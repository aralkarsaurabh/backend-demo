import { Task, TaskStatus } from "../entities/Task";
import { SortOrder } from "./CustomerRepository";

export interface CreateTaskData {
  title: string;
  description?: string;
  assignedToUserId?: string;
  dueDate?: Date;
}

/** A field left out is unchanged; `null` clears an optional field or unassigns the task. */
export interface UpdateTaskData {
  title?: string;
  description?: string | null;
  assignedToUserId?: string | null;
  dueDate?: Date | null;
  status?: TaskStatus;
}

/** The only fields a list may be sorted by. Anything else is rejected before the database. */
export const TASK_SORT_FIELDS = ["createdAt", "dueDate", "title"] as const;
export type TaskSortField = (typeof TASK_SORT_FIELDS)[number];

export interface TaskListQuery {
  /** 1-based. */
  page: number;
  limit: number;
  /** Substring of title or description, ignoring case. */
  search?: string;
  status?: TaskStatus;
  assignedToUserId?: string;
  /** Inclusive bounds on dueDate; a task without a due date never matches them. */
  dueFrom?: Date;
  dueTo?: Date;
  /** Only unfinished tasks whose due date has passed (D48). Derived, never stored. */
  overdue?: boolean;
  sortBy: TaskSortField;
  sortOrder: SortOrder;
}

export interface TaskPage {
  items: Task[];
  /** Every task matching the filters, not just this page. */
  totalItems: number;
}

/**
 * Every method takes the organization id, so a query can never reach another
 * organization's tasks (decision D45).
 */
export interface TaskRepository {
  create(organizationId: string, data: CreateTaskData): Promise<Task>;

  /** Null when there is no such task in this organization. */
  findById(organizationId: string, taskId: string): Promise<Task | null>;

  /** Null, changing nothing, when there is no such task in this organization. */
  update(organizationId: string, taskId: string, data: UpdateTaskData): Promise<Task | null>;

  /** True if a task was deleted; false, changing nothing, if none matched. */
  delete(organizationId: string, taskId: string): Promise<boolean>;

  /** One page of the organization's tasks, in a total order that always ends in `id`. */
  list(organizationId: string, query: TaskListQuery): Promise<TaskPage>;
}
