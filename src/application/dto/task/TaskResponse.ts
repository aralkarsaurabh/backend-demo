import { Task } from "../../../domain/entities/Task";

export interface TaskResponse {
  id: string;
  title: string;
  description: string | null;
  assignedToUserId: string | null;
  dueDate: string | null;
  status: Task["status"];
  createdAt: string;
  updatedAt: string;
}

/** Never includes `organizationId`: the client already has it in the URL. */
export const toTaskResponse = (task: Task): TaskResponse => ({
  id: task.id,
  title: task.title,
  description: task.description,
  assignedToUserId: task.assignedToUserId,
  dueDate: task.dueDate?.toISOString() ?? null,
  status: task.status,
  createdAt: task.createdAt.toISOString(),
  updatedAt: task.updatedAt.toISOString(),
});

/** A list item leaves out the free-text description. */
export type TaskListItemResponse = Omit<TaskResponse, "description">;

export const toTaskListItem = (task: Task): TaskListItemResponse => {
  const { description: _description, ...item } = toTaskResponse(task);
  return item;
};
