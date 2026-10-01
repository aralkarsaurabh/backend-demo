import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  bearer,
  buildIntegrationApp,
  createOrganization,
  createTask,
  joinOrganization,
  resetDatabase,
  signUp,
} from "../helpers/integration";

const ctx = buildIntegrationApp();
const { api, prisma } = ctx;

beforeEach(() => resetDatabase(prisma));
afterAll(() => prisma.$disconnect());

const BASE = "/api/v1";
const path = (orgId: string, taskId?: string) =>
  `${BASE}/organizations/${orgId}/tasks${taskId ? `/${taskId}` : ""}`;

function expectEnvelope(body: any, success: boolean) {
  expect(Object.keys(body).sort()).toEqual(["data", "error", "message", "meta", "success"]);
  expect(body.success).toBe(success);
  if (success) expect(body.error).toBeNull();
  else {
    expect(body.data).toBeNull();
    expect(Object.keys(body.error).sort()).toEqual(["code", "details"]);
  }
}

function expectError(res: any, status: number, code: string) {
  expect(res.status).toBe(status);
  expectEnvelope(res.body, false);
  expect(res.body.error.code).toBe(code);
}

/** Organization A (owner, admin, member) and organization B with its own owner. */
async function setup() {
  const owner = await signUp(ctx, "owner@example.com");
  const org = await createOrganization(ctx, owner, "Org A");
  const admin = await joinOrganization(ctx, owner, org.id, "admin@example.com", "ADMIN");
  const member = await joinOrganization(ctx, owner, org.id, "member@example.com", "MEMBER");
  const otherOwner = await signUp(ctx, "other@example.com");
  const otherOrg = await createOrganization(ctx, otherOwner, "Org B");
  return { owner, admin, member, org, otherOwner, otherOrg };
}

describe("POST /organizations/:organizationId/tasks", () => {
  it("creates a TODO unassigned task for every organization role", async () => {
    const { owner, admin, member, org } = await setup();
    for (const actor of [owner, admin, member]) {
      const res = await api
        .post(path(org.id))
        .set(bearer(actor.accessToken))
        .send({
          title: "Follow up with Rahul",
          description: "Discuss enterprise pricing",
          dueDate: "2026-10-05T12:00:00.000Z",
        });
      expect(res.status).toBe(201);
      expectEnvelope(res.body, true);
      expect(res.body.message).toBe("Task created successfully.");
      expect(res.body.data.task).toMatchObject({
        title: "Follow up with Rahul",
        description: "Discuss enterprise pricing",
        dueDate: "2026-10-05T12:00:00.000Z",
        status: "TODO",
        assignedToUserId: null,
      });
      expect(res.body.data.task).not.toHaveProperty("organizationId");
    }
  });

  it("needs only a title", async () => {
    const { member, org } = await setup();
    const res = await api.post(path(org.id)).set(bearer(member.accessToken)).send({ title: "Just a title" });
    expect(res.status).toBe(201);
  });

  it("assigns a member of the organization", async () => {
    const { owner, member, org } = await setup();
    const res = await api
      .post(path(org.id))
      .set(bearer(owner.accessToken))
      .send({ title: "t", assignedToUserId: member.user.id });
    expect(res.status).toBe(201);
    expect(res.body.data.task.assignedToUserId).toBe(member.user.id);
  });

  it("refuses a user of another organization and an unknown user with 400 ASSIGNED_USER_NOT_MEMBER", async () => {
    const { owner, otherOwner, org } = await setup();
    for (const assignedToUserId of [otherOwner.user.id, randomUUID()]) {
      const res = await api.post(path(org.id)).set(bearer(owner.accessToken)).send({ title: "t", assignedToUserId });
      expectError(res, 400, "ASSIGNED_USER_NOT_MEMBER");
    }
    expect(await prisma.task.count()).toBe(0);
  });

  it("rejects invalid bodies and fields the server owns with 400 VALIDATION_ERROR", async () => {
    const { owner, org } = await setup();
    for (const body of [
      {},
      { title: "" },
      { title: "x".repeat(201) },
      { title: "t", dueDate: "tomorrow" },
      { title: "t", status: "COMPLETED" },
      { title: "t", organizationId: randomUUID() },
      { title: "t", id: randomUUID() },
      { title: "t", createdAt: "2026-10-01T00:00:00.000Z" },
      { title: "t", updatedAt: "2026-10-01T00:00:00.000Z" },
    ]) {
      expectError(await api.post(path(org.id)).set(bearer(owner.accessToken)).send(body), 400, "VALIDATION_ERROR");
    }
  });

  it("needs authentication, and treats a non-member as if the organization did not exist", async () => {
    const { org, otherOwner } = await setup();
    expectError(await api.post(path(org.id)).send({ title: "t" }), 401, "UNAUTHORIZED");
    expectError(
      await api.post(path(org.id)).set(bearer(otherOwner.accessToken)).send({ title: "t" }),
      404,
      "ORGANIZATION_NOT_FOUND",
    );
  });
});

describe("GET /organizations/:organizationId/tasks", () => {
  it("lists the organization's tasks with the default page, without descriptions", async () => {
    const { owner, member, org, otherOwner, otherOrg } = await setup();
    await createTask(ctx, owner, org, { title: "one", description: "d" });
    await createTask(ctx, owner, org, { title: "two" });
    await createTask(ctx, otherOwner, otherOrg, { title: "other org" });

    const res = await api.get(path(org.id)).set(bearer(member.accessToken));
    expect(res.status).toBe(200);
    expectEnvelope(res.body, true);
    expect(res.body.data.tasks.map((t: any) => t.title).sort()).toEqual(["one", "two"]);
    expect(res.body.data.tasks[0]).not.toHaveProperty("description");
    expect(res.body.data.pagination).toEqual({
      page: 1,
      limit: 20,
      totalItems: 2,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    });
  });

  it("applies filters, search, overdue, sorting and paging", async () => {
    const { owner, member, org } = await setup();
    await createTask(ctx, owner, org, { title: "Call Rahul", assignedToUserId: member.user.id, dueDate: "2020-01-01T00:00:00.000Z" });
    await createTask(ctx, owner, org, { title: "Send quote", dueDate: "2999-01-01T00:00:00.000Z" });
    const done = await createTask(ctx, owner, org, { title: "Done", dueDate: "2020-01-01T00:00:00.000Z" });
    await api.patch(path(org.id, done.id)).set(bearer(owner.accessToken)).send({ status: "COMPLETED" });

    const titles = async (qs: string) =>
      (await api.get(`${path(org.id)}?${qs}`).set(bearer(owner.accessToken))).body.data.tasks.map((t: any) => t.title);

    expect(await titles("overdue=true")).toEqual(["Call Rahul"]);
    expect(await titles(`assignedToUserId=${member.user.id}`)).toEqual(["Call Rahul"]);
    expect(await titles("status=COMPLETED")).toEqual(["Done"]);
    expect(await titles("search=quote")).toEqual(["Send quote"]);
    expect(await titles("dueFrom=2999-01-01&dueTo=2999-01-01")).toEqual(["Send quote"]);
    expect(await titles("sortBy=title&sortOrder=asc&limit=2&page=2")).toEqual(["Send quote"]);
  });

  it("rejects an invalid query with 400 VALIDATION_ERROR", async () => {
    const { owner, org } = await setup();
    for (const qs of ["page=0", "limit=1000", "status=BLOCKED", "sortBy=description", "overdue=false", "organizationId=x"]) {
      expectError(await api.get(`${path(org.id)}?${qs}`).set(bearer(owner.accessToken)), 400, "VALIDATION_ERROR");
    }
  });
});

describe("GET /organizations/:organizationId/tasks/:taskId", () => {
  it("returns the task with its description, and 404s another organization's task", async () => {
    const { owner, member, org, otherOwner, otherOrg } = await setup();
    const task = await createTask(ctx, owner, org, { title: "t", description: "d" });

    const res = await api.get(path(org.id, task.id)).set(bearer(member.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.task).toMatchObject({ id: task.id, description: "d" });

    expectError(await api.get(path(org.id, randomUUID())).set(bearer(member.accessToken)), 404, "TASK_NOT_FOUND");
    expectError(await api.get(path(otherOrg.id, task.id)).set(bearer(otherOwner.accessToken)), 404, "TASK_NOT_FOUND");
    expectError(await api.get(path(org.id, task.id)).set(bearer(otherOwner.accessToken)), 404, "ORGANIZATION_NOT_FOUND");
    expectError(await api.get(path(org.id, "not-a-uuid")).set(bearer(member.accessToken)), 400, "VALIDATION_ERROR");
  });
});

describe("PATCH /organizations/:organizationId/tasks/:taskId", () => {
  it("updates fields and status for every role, and a finished task can be reopened", async () => {
    const { owner, admin, member, org } = await setup();
    const task = await createTask(ctx, owner, org, { title: "t" });
    for (const [actor, status] of [
      [owner, "IN_PROGRESS"],
      [admin, "COMPLETED"],
      [member, "TODO"],
    ] as const) {
      const res = await api.patch(path(org.id, task.id)).set(bearer(actor.accessToken)).send({ status });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Task updated successfully.");
      expect(res.body.data.task.status).toBe(status);
    }
  });

  it("clears description, due date and assignee with null", async () => {
    const { owner, member, org } = await setup();
    const task = await createTask(ctx, owner, org, {
      title: "t",
      description: "d",
      dueDate: "2026-10-05T12:00:00.000Z",
      assignedToUserId: member.user.id,
    });
    const res = await api
      .patch(path(org.id, task.id))
      .set(bearer(owner.accessToken))
      .send({ description: null, dueDate: null, assignedToUserId: null });
    expect(res.status).toBe(200);
    expect(res.body.data.task).toMatchObject({ description: null, dueDate: null, assignedToUserId: null });
  });

  it("checks the assignee's membership", async () => {
    const { owner, member, org, otherOwner } = await setup();
    const task = await createTask(ctx, owner, org, { title: "t" });
    const ok = await api.patch(path(org.id, task.id)).set(bearer(member.accessToken)).send({ assignedToUserId: member.user.id });
    expect(ok.status).toBe(200);
    const bad = await api.patch(path(org.id, task.id)).set(bearer(owner.accessToken)).send({ assignedToUserId: otherOwner.user.id });
    expectError(bad, 400, "ASSIGNED_USER_NOT_MEMBER");
  });

  it("rejects an empty body and fields the server owns with 400 VALIDATION_ERROR", async () => {
    const { owner, org } = await setup();
    const task = await createTask(ctx, owner, org, { title: "t" });
    for (const body of [{}, { organizationId: randomUUID() }, { id: randomUUID() }, { createdAt: "x" }, { updatedAt: "x" }, { status: "BLOCKED" }, { title: null }]) {
      expectError(await api.patch(path(org.id, task.id)).set(bearer(owner.accessToken)).send(body), 400, "VALIDATION_ERROR");
    }
  });

  it("404s an unknown task and another organization's task, changing nothing", async () => {
    const { owner, org, otherOwner, otherOrg } = await setup();
    const task = await createTask(ctx, owner, org, { title: "t" });
    expectError(await api.patch(path(org.id, randomUUID())).set(bearer(owner.accessToken)).send({ title: "x" }), 404, "TASK_NOT_FOUND");
    expectError(await api.patch(path(otherOrg.id, task.id)).set(bearer(otherOwner.accessToken)).send({ title: "x" }), 404, "TASK_NOT_FOUND");
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).title).toBe("t");
  });
});

describe("DELETE /organizations/:organizationId/tasks/:taskId", () => {
  it("lets OWNER and ADMIN delete, and 404s a second delete", async () => {
    const { owner, admin, org } = await setup();
    for (const actor of [owner, admin]) {
      const task = await createTask(ctx, owner, org, { title: "t" });
      const res = await api.delete(path(org.id, task.id)).set(bearer(actor.accessToken));
      expect(res.status).toBe(200);
      expectEnvelope(res.body, true);
      expect(res.body.data).toBeNull();
      expectError(await api.delete(path(org.id, task.id)).set(bearer(actor.accessToken)), 404, "TASK_NOT_FOUND");
    }
  });

  it("refuses a MEMBER with 403 and keeps the task", async () => {
    const { owner, member, org } = await setup();
    const task = await createTask(ctx, owner, org, { title: "t" });
    expectError(
      await api.delete(path(org.id, task.id)).set(bearer(member.accessToken)),
      403,
      "INSUFFICIENT_ORGANIZATION_PERMISSION",
    );
    expect(await prisma.task.count()).toBe(1);
  });

  it("cannot delete another organization's task", async () => {
    const { owner, org, otherOwner, otherOrg } = await setup();
    const task = await createTask(ctx, owner, org, { title: "t" });
    expectError(await api.delete(path(otherOrg.id, task.id)).set(bearer(otherOwner.accessToken)), 404, "TASK_NOT_FOUND");
    expect(await prisma.task.count()).toBe(1);
  });
});
