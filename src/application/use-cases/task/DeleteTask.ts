import { TaskRepository } from "../../../domain/repositories/TaskRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";

export class DeleteTask {
  constructor(private readonly tasks: TaskRepository) {}

  /** Hard delete (D49), also for a completed task. */
  async execute(organizationId: string, taskId: string): Promise<void> {
    const deleted = await this.tasks.delete(organizationId, taskId);
    if (!deleted) throw new AppError(ErrorCode.TASK_NOT_FOUND);
  }
}
