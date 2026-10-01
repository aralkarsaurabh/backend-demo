import { Task, TASK_FINISHED_STATUSES } from "../../../domain/entities/Task";
import {
  CreateTaskData,
  TaskListQuery,
  TaskPage,
  TaskRepository,
  UpdateTaskData,
} from "../../../domain/repositories/TaskRepository";
import type { Prisma } from "../../../../generated/prisma/client";
import type { PrismaClient } from "../prisma";

export class PrismaTaskRepository implements TaskRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(organizationId: string, data: CreateTaskData): Promise<Task> {
    return this.prisma.task.create({ data: { ...data, organizationId } });
  }

  findById(organizationId: string, taskId: string): Promise<Task | null> {
    return this.prisma.task.findFirst({ where: { id: taskId, organizationId } });
  }

  async update(organizationId: string, taskId: string, data: UpdateTaskData): Promise<Task | null> {
    const { count } = await this.prisma.task.updateMany({ where: { id: taskId, organizationId }, data });
    if (count === 0) return null;
    return this.findById(organizationId, taskId);
  }

  async delete(organizationId: string, taskId: string): Promise<boolean> {
    const { count } = await this.prisma.task.deleteMany({ where: { id: taskId, organizationId } });
    return count > 0;
  }

  async list(organizationId: string, query: TaskListQuery): Promise<TaskPage> {
    const where = buildWhere(organizationId, query);
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        orderBy: buildOrderBy(query),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.task.count({ where }),
    ]);
    return { items, totalItems };
  }
}

/** The organization id is always part of the filter; the optional filters only narrow it. */
function buildWhere(organizationId: string, query: TaskListQuery): Prisma.TaskWhereInput {
  const { search, status, assignedToUserId, dueFrom, dueTo, overdue } = query;
  const dueDate = {
    ...(dueFrom && { gte: dueFrom }),
    ...(dueTo && { lte: dueTo }),
    // Overdue is a query condition, never a stored column (D48).
    ...(overdue && { lt: new Date() }),
  };
  return {
    organizationId,
    ...(status && { status }),
    ...(assignedToUserId && { assignedToUserId }),
    ...(Object.keys(dueDate).length > 0 && { dueDate }),
    // An AND, so it narrows a `status` filter instead of replacing it.
    ...(overdue && { AND: [{ status: { notIn: [...TASK_FINISHED_STATUSES] } }] }),
    ...(search && {
      OR: (["title", "description"] as const).map((field) => ({
        [field]: { contains: escapeLike(search), mode: "insensitive" as const },
      })),
    }),
  };
}

/** Prisma's `contains` does not escape LIKE wildcards, so `%` and `_` would match anything. */
const escapeLike = (text: string) => text.replace(/[\\%_]/g, "\\$&");

/** The sort field is a whitelisted value, never raw input. `id` makes the order total. */
function buildOrderBy(query: TaskListQuery): Prisma.TaskOrderByWithRelationInput[] {
  const { sortBy, sortOrder } = query;
  const primary =
    sortBy === "dueDate" ? { dueDate: { sort: sortOrder, nulls: "last" as const } } : { [sortBy]: sortOrder };
  return [primary, { id: sortOrder }];
}
