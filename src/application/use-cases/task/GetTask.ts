import { TaskRepository } from "../../../domain/repositories/TaskRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import { TaskResponse, toTaskResponse } from "../../dto/task/TaskResponse";

export class GetTask {
  constructor(private readonly tasks: TaskRepository) {}

  async execute(organizationId: string, taskId: string): Promise<{ task: TaskResponse }> {
    const task = await this.tasks.findById(organizationId, taskId);
    if (!task) throw new AppError(ErrorCode.TASK_NOT_FOUND);
    return { task: toTaskResponse(task) };
  }
}
