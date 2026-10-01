import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createTaskRequestSchema,
  taskListQuerySchema,
  taskParamsSchema,
  updateTaskRequestSchema,
} from "../../src/application/dto/task/TaskRequests";

const id: string = randomUUID();

describe("createTaskRequestSchema", () => {
  it("needs only a title, which is trimmed", () => {
    expect(createTaskRequestSchema.parse({ title: "  Follow up  " })).toEqual({ title: "Follow up" });
  });

  it("accepts every optional field and turns the due date into a Date", () => {
    const parsed = createTaskRequestSchema.parse({
      title: "Follow up with Rahul",
      description: "Discuss enterprise pricing",
      assignedToUserId: id,
      dueDate: "2026-10-05T12:00:00.000Z",
    });
    expect(parsed.dueDate).toEqual(new Date("2026-10-05T12:00:00.000Z"));
    expect(parsed.assignedToUserId).toBe(id);
  });

  it("rejects a missing, empty or too long title", () => {
    expect(createTaskRequestSchema.safeParse({}).success).toBe(false);
    expect(createTaskRequestSchema.safeParse({ title: "   " }).success).toBe(false);
    expect(createTaskRequestSchema.safeParse({ title: "x".repeat(201) }).success).toBe(false);
    expect(createTaskRequestSchema.safeParse({ title: "x".repeat(200) }).success).toBe(true);
  });

  it("rejects a bad assignee id, a bad due date and a too long description", () => {
    expect(createTaskRequestSchema.safeParse({ title: "t", assignedToUserId: "nope" }).success).toBe(false);
    expect(createTaskRequestSchema.safeParse({ title: "t", dueDate: "2026-10-05" }).success).toBe(false);
    expect(createTaskRequestSchema.safeParse({ title: "t", dueDate: null }).success).toBe(false);
    expect(createTaskRequestSchema.safeParse({ title: "t", description: "x".repeat(2001) }).success).toBe(false);
  });

  it("rejects the fields the server owns, including status", () => {
    for (const extra of [
      { organizationId: id },
      { id },
      { createdAt: "2026-10-01T00:00:00.000Z" },
      { updatedAt: "2026-10-01T00:00:00.000Z" },
      { status: "COMPLETED" },
      { unknown: 1 },
    ]) {
      expect(createTaskRequestSchema.safeParse({ title: "t", ...extra }).success).toBe(false);
    }
  });
});

describe("updateTaskRequestSchema", () => {
  it("needs at least one field", () => {
    expect(updateTaskRequestSchema.safeParse({}).success).toBe(false);
    expect(updateTaskRequestSchema.safeParse({ status: "IN_PROGRESS" }).success).toBe(true);
  });

  it("accepts every status, including reopening", () => {
    for (const status of ["TODO", "IN_PROGRESS", "COMPLETED", "CANCELLED"]) {
      expect(updateTaskRequestSchema.safeParse({ status }).success).toBe(true);
    }
    expect(updateTaskRequestSchema.safeParse({ status: "BLOCKED" }).success).toBe(false);
  });

  it("clears description, assignee and due date with null, but not the title", () => {
    const parsed = updateTaskRequestSchema.parse({ description: null, assignedToUserId: null, dueDate: null });
    expect(parsed).toEqual({ description: null, assignedToUserId: null, dueDate: null });
    expect(updateTaskRequestSchema.safeParse({ title: null }).success).toBe(false);
  });

  it("rejects the fields the server owns", () => {
    for (const extra of [{ organizationId: id }, { id }, { createdAt: "2026-10-01T00:00:00.000Z" }, { updatedAt: "x" }]) {
      expect(updateTaskRequestSchema.safeParse({ title: "t", ...extra }).success).toBe(false);
    }
  });
});

describe("taskParamsSchema", () => {
  it("needs uuid organization and task ids", () => {
    expect(taskParamsSchema.safeParse({ organizationId: id, taskId: id }).success).toBe(true);
    expect(taskParamsSchema.safeParse({ organizationId: id, taskId: "nope" }).success).toBe(false);
  });
});

describe("taskListQuerySchema", () => {
  it("defaults to page 1, limit 20, newest first", () => {
    expect(taskListQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 20,
      sortBy: "createdAt",
      sortOrder: "desc",
    });
  });

  it("coerces numbers, reads dates as inclusive UTC day bounds, and overdue=true", () => {
    const parsed = taskListQuerySchema.parse({
      page: "2",
      limit: "5",
      status: "TODO",
      assignedToUserId: id,
      dueFrom: "2026-10-01",
      dueTo: "2026-10-31",
      overdue: "true",
      search: "rahul",
      sortBy: "dueDate",
      sortOrder: "asc",
    });
    expect(parsed).toMatchObject({ page: 2, limit: 5, status: "TODO", overdue: true, sortBy: "dueDate" });
    expect(parsed.dueFrom).toEqual(new Date("2026-10-01T00:00:00.000Z"));
    expect(parsed.dueTo).toEqual(new Date("2026-10-31T23:59:59.999Z"));
  });

  it("rejects bad values and unknown keys", () => {
    for (const query of [
      { page: "0" },
      { limit: "101" },
      { status: "BLOCKED" },
      { assignedToUserId: "nope" },
      { dueFrom: "10/01/2026" },
      { dueFrom: "2026-10-31", dueTo: "2026-10-01" },
      { overdue: "false" },
      { sortBy: "description" },
      { sortOrder: "up" },
      { search: "" },
      { organizationId: id },
    ]) {
      expect(taskListQuerySchema.safeParse(query).success).toBe(false);
    }
  });
});
