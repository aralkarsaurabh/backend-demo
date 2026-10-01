import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { OrganizationRole } from "../../src/domain/enums/OrganizationRole";
import { buildApp, TestApp } from "../helpers/fakes";

const orgA: string = randomUUID();
const orgB: string = randomUUID();

function addMember(app: TestApp, organizationId: string, userId: string = randomUUID()) {
  const now = new Date();
  app.orgData.memberships.push({
    id: randomUUID(),
    organizationId,
    userId,
    role: OrganizationRole.MEMBER,
    createdAt: now,
    updatedAt: now,
  });
  return userId;
}

const listQuery = (over: Record<string, unknown> = {}) => ({
  page: 1,
  limit: 20,
  sortBy: "createdAt" as const,
  sortOrder: "desc" as const,
  ...over,
});

const days = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

describe("CreateTask", () => {
  it("stores an unassigned TODO task in the given organization, with null for omitted fields", async () => {
    const app = buildApp();
    const { task } = await app.createTask.execute(orgA, { title: "Follow up" });

    expect(task).toEqual({
      id: expect.any(String),
      title: "Follow up",
      description: null,
      assignedToUserId: null,
      dueDate: null,
      status: "TODO",
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(app.tasks.tasks[0].organizationId).toBe(orgA);
    expect(task).not.toHaveProperty("organizationId");
  });

  it("assigns a member of the organization and returns the due date as an ISO string", async () => {
    const app = buildApp();
    const member = addMember(app, orgA);
    const due = new Date("2026-10-05T12:00:00.000Z");
    const { task } = await app.createTask.execute(orgA, {
      title: "Call",
      assignedToUserId: member,
      dueDate: due,
    });
    expect(task.assignedToUserId).toBe(member);
    expect(task.dueDate).toBe("2026-10-05T12:00:00.000Z");
  });

  it("refuses an assignee who is not a member, or does not exist, with the same error, and stores nothing", async () => {
    const app = buildApp();
    const memberOfB = addMember(app, orgB);
    await expect(
      app.createTask.execute(orgA, { title: "x", assignedToUserId: memberOfB }),
    ).rejects.toMatchObject({ code: "ASSIGNED_USER_NOT_MEMBER" });
    await expect(
      app.createTask.execute(orgA, { title: "x", assignedToUserId: randomUUID() }),
    ).rejects.toMatchObject({ code: "ASSIGNED_USER_NOT_MEMBER" });
    expect(app.tasks.tasks).toHaveLength(0);
  });
});

describe("GetTask", () => {
  it("returns the task with its description", async () => {
    const app = buildApp();
    const { task } = await app.createTask.execute(orgA, { title: "t", description: "d" });
    expect((await app.getTask.execute(orgA, task.id)).task).toEqual(task);
  });

  it("is TASK_NOT_FOUND for an unknown id and for a task of another organization", async () => {
    const app = buildApp();
    const { task } = await app.createTask.execute(orgA, { title: "t" });
    await expect(app.getTask.execute(orgA, randomUUID())).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
    await expect(app.getTask.execute(orgB, task.id)).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
  });
});

describe("UpdateTask", () => {
  it("changes only the given fields; null clears", async () => {
    const app = buildApp();
    const { task } = await app.createTask.execute(orgA, {
      title: "t",
      description: "d",
      dueDate: days(1),
    });
    const { task: updated } = await app.updateTask.execute(orgA, task.id, {
      status: "IN_PROGRESS",
      description: null,
      dueDate: null,
    });
    expect(updated).toMatchObject({ title: "t", status: "IN_PROGRESS", description: null, dueDate: null });
  });

  it("allows any status change, so a completed or cancelled task can be reopened", async () => {
    const app = buildApp();
    const { task } = await app.createTask.execute(orgA, { title: "t" });
    for (const status of ["COMPLETED", "IN_PROGRESS", "CANCELLED", "TODO", "COMPLETED", "TODO"] as const) {
      const result = await app.updateTask.execute(orgA, task.id, { status });
      expect(result.task.status).toBe(status);
    }
  });

  it("assigns and unassigns, checking membership", async () => {
    const app = buildApp();
    const member = addMember(app, orgA);
    const { task } = await app.createTask.execute(orgA, { title: "t" });

    expect((await app.updateTask.execute(orgA, task.id, { assignedToUserId: member })).task.assignedToUserId).toBe(member);
    await expect(
      app.updateTask.execute(orgA, task.id, { assignedToUserId: randomUUID() }),
    ).rejects.toMatchObject({ code: "ASSIGNED_USER_NOT_MEMBER" });
    expect((await app.updateTask.execute(orgA, task.id, { assignedToUserId: null })).task.assignedToUserId).toBeNull();
  });

  it("changes nothing when the assignee is refused", async () => {
    const app = buildApp();
    const { task } = await app.createTask.execute(orgA, { title: "t" });
    await expect(
      app.updateTask.execute(orgA, task.id, { title: "changed", assignedToUserId: randomUUID() }),
    ).rejects.toMatchObject({ code: "ASSIGNED_USER_NOT_MEMBER" });
    expect((await app.getTask.execute(orgA, task.id)).task.title).toBe("t");
  });

  it("is TASK_NOT_FOUND for an unknown task and for a task of another organization", async () => {
    const app = buildApp();
    const { task } = await app.createTask.execute(orgA, { title: "t" });
    await expect(app.updateTask.execute(orgA, randomUUID(), { title: "x" })).rejects.toMatchObject({
      code: "TASK_NOT_FOUND",
    });
    await expect(app.updateTask.execute(orgB, task.id, { title: "x" })).rejects.toMatchObject({
      code: "TASK_NOT_FOUND",
    });
    expect(app.tasks.tasks[0].title).toBe("t");
  });
});

describe("DeleteTask", () => {
  it("hard deletes within the organization only", async () => {
    const app = buildApp();
    const { task } = await app.createTask.execute(orgA, { title: "t" });
    await expect(app.deleteTask.execute(orgB, task.id)).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
    expect(app.tasks.tasks).toHaveLength(1);
    await app.deleteTask.execute(orgA, task.id);
    expect(app.tasks.tasks).toHaveLength(0);
    await expect(app.deleteTask.execute(orgA, task.id)).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
  });
});

describe("AssignTask", () => {
  it("accepts a member and refuses anyone else with ASSIGNED_USER_NOT_MEMBER", async () => {
    const app = buildApp();
    const member = addMember(app, orgA);
    await expect(app.assignTask.execute(orgA, member)).resolves.toBeUndefined();
    await expect(app.assignTask.execute(orgB, member)).rejects.toMatchObject({ code: "ASSIGNED_USER_NOT_MEMBER" });
  });
});

describe("ListTasks", () => {
  it("lists only the organization's tasks, without descriptions, with pagination", async () => {
    const app = buildApp();
    await app.createTask.execute(orgA, { title: "a1", description: "secret" });
    await app.createTask.execute(orgA, { title: "a2" });
    await app.createTask.execute(orgB, { title: "b1" });

    const { tasks, pagination } = await app.listTasks.execute(orgA, listQuery({ limit: 1 }));
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).not.toHaveProperty("description");
    expect(tasks[0]).not.toHaveProperty("organizationId");
    expect(pagination).toEqual({
      page: 1,
      limit: 1,
      totalItems: 2,
      totalPages: 2,
      hasNextPage: true,
      hasPreviousPage: false,
    });
  });

  it("filters by status, assignee and due range, and searches title and description", async () => {
    const app = buildApp();
    const member = addMember(app, orgA);
    await app.createTask.execute(orgA, { title: "Call Rahul", assignedToUserId: member, dueDate: new Date("2026-10-10T00:00:00Z") });
    await app.createTask.execute(orgA, { title: "Send quote", description: "for rahul", dueDate: new Date("2026-11-10T00:00:00Z") });
    const { task: done } = await app.createTask.execute(orgA, { title: "Done thing" });
    await app.updateTask.execute(orgA, done.id, { status: "COMPLETED" });

    const titles = async (over: Record<string, unknown>) =>
      (await app.listTasks.execute(orgA, listQuery({ sortBy: "title", sortOrder: "asc", ...over }))).tasks.map((t) => t.title);

    expect(await titles({ status: "COMPLETED" })).toEqual(["Done thing"]);
    expect(await titles({ assignedToUserId: member })).toEqual(["Call Rahul"]);
    expect(await titles({ dueFrom: new Date("2026-10-01T00:00:00Z"), dueTo: new Date("2026-10-31T23:59:59.999Z") })).toEqual(["Call Rahul"]);
    expect(await titles({ search: "RAHUL" })).toEqual(["Call Rahul", "Send quote"]);
  });

  it("overdue=true returns only unfinished tasks whose due date has passed", async () => {
    const app = buildApp();
    await app.createTask.execute(orgA, { title: "late", dueDate: days(-2) });
    await app.createTask.execute(orgA, { title: "future", dueDate: days(2) });
    await app.createTask.execute(orgA, { title: "no due date" });
    const { task: doneLate } = await app.createTask.execute(orgA, { title: "done late", dueDate: days(-2) });
    const { task: cancelledLate } = await app.createTask.execute(orgA, { title: "cancelled late", dueDate: days(-2) });
    await app.updateTask.execute(orgA, doneLate.id, { status: "COMPLETED" });
    await app.updateTask.execute(orgA, cancelledLate.id, { status: "CANCELLED" });
    const { task: started } = await app.createTask.execute(orgA, { title: "started late", dueDate: days(-1) });
    await app.updateTask.execute(orgA, started.id, { status: "IN_PROGRESS" });

    const { tasks } = await app.listTasks.execute(orgA, listQuery({ overdue: true, sortBy: "title", sortOrder: "asc" }));
    expect(tasks.map((t) => t.title)).toEqual(["late", "started late"]);
  });

  it("sorts by due date with empty dates last, ending in id", async () => {
    const app = buildApp();
    await app.createTask.execute(orgA, { title: "none" });
    await app.createTask.execute(orgA, { title: "later", dueDate: days(5) });
    await app.createTask.execute(orgA, { title: "sooner", dueDate: days(1) });

    const order = async (sortOrder: "asc" | "desc") =>
      (await app.listTasks.execute(orgA, listQuery({ sortBy: "dueDate", sortOrder }))).tasks.map((t) => t.title);
    expect(await order("asc")).toEqual(["sooner", "later", "none"]);
    expect(await order("desc")).toEqual(["later", "sooner", "none"]);
  });
});
