import { z } from "zod";
import { TASK_STATUSES } from "../../../domain/entities/Task";
import { TASK_SORT_FIELDS } from "../../../domain/repositories/TaskRepository";
import {
  CUSTOMER_LIST_DEFAULT_LIMIT,
  CUSTOMER_LIST_MAX_LIMIT,
  CUSTOMER_SEARCH_MAX_LENGTH,
  text,
} from "../customer/CustomerRequests";
import { organizationParamsSchema } from "../organization/OrganizationRequests";

export const TASK_TITLE_MAX_LENGTH = 200;
export const TASK_DESCRIPTION_MAX_LENGTH = 2000;

const titleField = text("Title", TASK_TITLE_MAX_LENGTH);
const descriptionField = text("Description", TASK_DESCRIPTION_MAX_LENGTH);
const assigneeField = z.uuid({ error: "Assigned user id must be a valid id." });
const statusField = z.enum(TASK_STATUSES, { error: `Status must be one of: ${TASK_STATUSES.join(", ")}.` });
const dueDateField = z.iso
  .datetime({ offset: true, error: "Due date must be a timestamp like 2026-10-05T12:00:00.000Z." })
  .transform((value) => new Date(value));

/**
 * Strict: the organization id comes from the URL and membership, never the body, and the
 * id, the status (a new task is always TODO) and the timestamps belong to the server.
 */
export const createTaskRequestSchema = z.strictObject({
  title: titleField,
  description: descriptionField.optional(),
  assignedToUserId: assigneeField.optional(),
  dueDate: dueDateField.optional(),
});

/**
 * Every field is optional but at least one must be present, and `null` clears the description,
 * the due date or the assignee. The title cannot be cleared. Strict, like create.
 */
export const updateTaskRequestSchema = z
  .strictObject({
    title: titleField.optional(),
    description: descriptionField.nullable().optional(),
    assignedToUserId: assigneeField.nullable().optional(),
    dueDate: dueDateField.nullable().optional(),
    status: statusField.optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "Send at least one field to update.",
  });

export const taskParamsSchema = organizationParamsSchema.extend({
  taskId: z.uuid({ error: "Task id must be a valid id." }),
});

const startOfDay = (date: string) => new Date(`${date}T00:00:00.000Z`);
const endOfDay = (date: string) => new Date(`${date}T23:59:59.999Z`);

/** Query strings arrive as text: numbers are coerced, and only whitelisted values pass. */
export const taskListQuerySchema = z
  .strictObject({
    page: z.coerce
      .number({ error: "Page must be a whole number." })
      .int("Page must be a whole number.")
      .min(1, "Page must be at least 1.")
      .default(1),
    limit: z.coerce
      .number({ error: "Limit must be a whole number." })
      .int("Limit must be a whole number.")
      .min(1, "Limit must be at least 1.")
      .max(CUSTOMER_LIST_MAX_LIMIT, `Limit must be at most ${CUSTOMER_LIST_MAX_LIMIT}.`)
      .default(CUSTOMER_LIST_DEFAULT_LIMIT),
    search: text("Search", CUSTOMER_SEARCH_MAX_LENGTH).optional(),
    status: statusField.optional(),
    assignedToUserId: assigneeField.optional(),
    dueFrom: z.iso.date({ error: "Due from must be a date like 2026-10-01." }).transform(startOfDay).optional(),
    dueTo: z.iso.date({ error: "Due to must be a date like 2026-10-31." }).transform(endOfDay).optional(),
    overdue: z.literal("true", { error: "Overdue must be true." }).transform(() => true).optional(),
    sortBy: z
      .enum(TASK_SORT_FIELDS, { error: `Sort by must be one of: ${TASK_SORT_FIELDS.join(", ")}.` })
      .default("createdAt"),
    sortOrder: z.enum(["asc", "desc"], { error: "Sort order must be asc or desc." }).default("desc"),
  })
  .refine((query) => !query.dueFrom || !query.dueTo || query.dueFrom <= query.dueTo, {
    path: ["dueFrom"],
    message: "Due from must not be after due to.",
  });

export type CreateTaskRequest = z.output<typeof createTaskRequestSchema>;
export type UpdateTaskRequest = z.output<typeof updateTaskRequestSchema>;
export type ListTasksRequest = z.output<typeof taskListQuerySchema>;
