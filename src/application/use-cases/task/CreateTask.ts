import { TaskRepository } from "../../../domain/repositories/TaskRepository";
import { CreateTaskRequest } from "../../dto/task/TaskRequests";
import { TaskResponse, toTaskResponse } from "../../dto/task/TaskResponse";
import { AssignTask } from "./AssignTask";

export class CreateTask {
  constructor(
    private readonly tasks: TaskRepository,
    private readonly assignTask: AssignTask,
  ) {}

  /** `organizationId` is the caller's verified organization, never a body field. */
  async execute(organizationId: string, request: CreateTaskRequest): Promise<{ task: TaskResponse }> {
    if (request.assignedToUserId) {
      await this.assignTask.execute(organizationId, request.assignedToUserId);
    }
    const task = await this.tasks.create(organizationId, request);
    return { task: toTaskResponse(task) };
  }
}
