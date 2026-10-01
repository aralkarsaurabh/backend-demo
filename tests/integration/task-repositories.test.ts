import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { TaskListQuery } from "../../src/domain/repositories/TaskRepository";
import { createPrismaClient } from "../../src/infrastructure/database/prisma";
import { PrismaTaskRepository } from "../../src/infrastructure/database/repositories/PrismaTaskRepository";
import { resetDatabase } from "../helpers/integration";

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const tasks = new PrismaTaskRepository(prisma);

beforeEach(() => resetDatabase(prisma));
afterAll(() => prisma.$disconnect());

const newOrg = (name = "Acme") =>
  prisma.organization.create({ data: { name, slug: `${name.toLowerCase()}-${randomUUID().slice(0, 8)}` } });

const query = (over: Partial<TaskListQuery> = {}): TaskListQuery => ({
  page: 1,
  limit: 20,
  sortBy: "createdAt",
  sortOrder: "desc",
  ...over,
});

const titles = async (organizationId: string, over: Partial<TaskListQuery> = {}) =>
  (await tasks.list(organizationId, query({ sortBy: "title", sortOrder: "asc", ...over }))).items.map((t) => t.title);

const days = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

describe("PrismaTaskRepository: create and findById", () => {
  it("creates a TODO unassigned task in the organization, with null for omitted fields", async () => {
    const org = await newOrg();
    const task = await tasks.create(org.id, { title: "Follow up" });
    expect(task).toMatchObject({
      organizationId: org.id,
      title: "Follow up",
      status: "TODO",
      description: null,
      assignedToUserId: null,
      dueDate: null,
    });
  });

  it("findById() finds a task only through its own organization", async () => {
    const a = await newOrg("a");
    const b = await newOrg("b");
    const task = await tasks.create(a.id, { title: "t" });
    expect((await tasks.findById(a.id, task.id))?.title).toBe("t");
    expect(await tasks.findById(b.id, task.id)).toBeNull();
  });

  it("deleting an organization deletes its tasks (cascade)", async () => {
    const org = await newOrg();
    await tasks.create(org.id, { title: "t" });
    await prisma.organization.delete({ where: { id: org.id } });
    expect(await prisma.task.count()).toBe(0);
  });

  it("deleting the assigned user unassigns the task instead of deleting it", async () => {
    const org = await newOrg();
    const user = await prisma.user.create({ data: { name: "U", email: "u@example.com", passwordHash: "x" } });
    const task = await tasks.create(org.id, { title: "t", assignedToUserId: user.id });
    await prisma.user.delete({ where: { id: user.id } });
    expect((await tasks.findById(org.id, task.id))?.assignedToUserId).toBeNull();
  });
});

describe("PrismaTaskRepository: update", () => {
  it("changes only the given fields; null clears", async () => {
    const org = await newOrg();
    const task = await tasks.create(org.id, { title: "t", description: "d", dueDate: days(1) });
    const updated = await tasks.update(org.id, task.id, { status: "COMPLETED", description: null, dueDate: null });
    expect(updated).toMatchObject({ title: "t", status: "COMPLETED", description: null, dueDate: null });
  });

  it("moves a completed task back, in any direction", async () => {
    const org = await newOrg();
    const task = await tasks.create(org.id, { title: "t" });
    await tasks.update(org.id, task.id, { status: "CANCELLED" });
    expect((await tasks.update(org.id, task.id, { status: "TODO" }))?.status).toBe("TODO");
  });

  it("update() cannot reach another organization's task", async () => {
    const a = await newOrg("a");
    const b = await newOrg("b");
    const task = await tasks.create(a.id, { title: "t" });
    expect(await tasks.update(b.id, task.id, { title: "Hacked" })).toBeNull();
    expect((await tasks.findById(a.id, task.id))?.title).toBe("t");
  });

  it("returns null for an unknown task", async () => {
    const org = await newOrg();
    expect(await tasks.update(org.id, randomUUID(), { title: "x" })).toBeNull();
  });
});

describe("PrismaTaskRepository: delete", () => {
  it("deletes within the organization only", async () => {
    const a = await newOrg("a");
    const b = await newOrg("b");
    const task = await tasks.create(a.id, { title: "t" });
    expect(await tasks.delete(b.id, task.id)).toBe(false);
    expect(await prisma.task.count()).toBe(1);
    expect(await tasks.delete(a.id, task.id)).toBe(true);
    expect(await tasks.delete(a.id, task.id)).toBe(false);
  });
});

describe("PrismaTaskRepository: list", () => {
  it("never returns another organization's tasks and counts only this organization's", async () => {
    const a = await newOrg("a");
    const b = await newOrg("b");
    await tasks.create(a.id, { title: "a1" });
    await tasks.create(b.id, { title: "b1" });
    const page = await tasks.list(a.id, query());
    expect(page.items.map((t) => t.title)).toEqual(["a1"]);
    expect(page.totalItems).toBe(1);
  });

  it("filters by status and assignee", async () => {
    const org = await newOrg();
    const user = await prisma.user.create({ data: { name: "U", email: "u@example.com", passwordHash: "x" } });
    await tasks.create(org.id, { title: "mine", assignedToUserId: user.id });
    const other = await tasks.create(org.id, { title: "other" });
    await tasks.update(org.id, other.id, { status: "IN_PROGRESS" });
    expect(await titles(org.id, { assignedToUserId: user.id })).toEqual(["mine"]);
    expect(await titles(org.id, { status: "IN_PROGRESS" })).toEqual(["other"]);
  });

  it("filters by an inclusive due range and leaves out tasks without a due date", async () => {
    const org = await newOrg();
    await tasks.create(org.id, { title: "start", dueDate: new Date("2026-10-01T00:00:00.000Z") });
    await tasks.create(org.id, { title: "end", dueDate: new Date("2026-10-31T23:59:59.999Z") });
    await tasks.create(org.id, { title: "before", dueDate: new Date("2026-09-30T23:59:59.999Z") });
    await tasks.create(org.id, { title: "after", dueDate: new Date("2026-11-01T00:00:00.000Z") });
    await tasks.create(org.id, { title: "none" });
    const range = { dueFrom: new Date("2026-10-01T00:00:00.000Z"), dueTo: new Date("2026-10-31T23:59:59.999Z") };
    expect(await titles(org.id, range)).toEqual(["end", "start"]);
  });

  it("overdue returns only unfinished tasks with a past due date", async () => {
    const org = await newOrg();
    await tasks.create(org.id, { title: "late", dueDate: days(-2) });
    await tasks.create(org.id, { title: "future", dueDate: days(2) });
    await tasks.create(org.id, { title: "no date" });
    const done = await tasks.create(org.id, { title: "done", dueDate: days(-2) });
    const cancelled = await tasks.create(org.id, { title: "cancelled", dueDate: days(-2) });
    const started = await tasks.create(org.id, { title: "started", dueDate: days(-1) });
    await tasks.update(org.id, done.id, { status: "COMPLETED" });
    await tasks.update(org.id, cancelled.id, { status: "CANCELLED" });
    await tasks.update(org.id, started.id, { status: "IN_PROGRESS" });
    expect(await titles(org.id, { overdue: true })).toEqual(["late", "started"]);
  });

  it("searches title and description, ignoring case, and treats % and _ literally", async () => {
    const org = await newOrg();
    await tasks.create(org.id, { title: "Call Rahul" });
    await tasks.create(org.id, { title: "Quote", description: "for RAHUL" });
    await tasks.create(org.id, { title: "100% done" });
    await tasks.create(org.id, { title: "a_b" });
    await tasks.create(org.id, { title: "axb" });
    expect(await titles(org.id, { search: "rahul" })).toEqual(["Call Rahul", "Quote"]);
    expect(await titles(org.id, { search: "%" })).toEqual(["100% done"]);
    expect(await titles(org.id, { search: "_" })).toEqual(["a_b"]);
  });

  it("sorts by due date with empty dates last, in both directions", async () => {
    const org = await newOrg();
    await tasks.create(org.id, { title: "none" });
    await tasks.create(org.id, { title: "later", dueDate: days(5) });
    await tasks.create(org.id, { title: "sooner", dueDate: days(1) });
    const order = async (sortOrder: "asc" | "desc") =>
      (await tasks.list(org.id, query({ sortBy: "dueDate", sortOrder }))).items.map((t) => t.title);
    expect(await order("asc")).toEqual(["sooner", "later", "none"]);
    expect(await order("desc")).toEqual(["later", "sooner", "none"]);
  });

  it("paginates in a total order, so pages never repeat or skip equal sort values", async () => {
    const org = await newOrg();
    for (let i = 0; i < 5; i++) await tasks.create(org.id, { title: "same" });
    const ids: string[] = [];
    for (const page of [1, 2, 3]) {
      const result = await tasks.list(org.id, query({ page, limit: 2, sortBy: "title" }));
      expect(result.totalItems).toBe(5);
      ids.push(...result.items.map((t) => t.id));
    }
    expect(new Set(ids).size).toBe(5);
  });
});
