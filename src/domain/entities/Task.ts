/** Any status may be set from any other (D47): a finished task can be reopened. */
export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Statuses that end the work: a task in one of them is never overdue (D48). */
export const TASK_FINISHED_STATUSES = ["COMPLETED", "CANCELLED"] as const;

export interface Task {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  assignedToUserId: string | null;
  dueDate: Date | null;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
}
