import { TaskRepository } from "../../../domain/repositories/TaskRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import { UpdateTaskRequest } from "../../dto/task/TaskRequests";
import { TaskResponse, toTaskResponse } from "../../dto/task/TaskResponse";
import { AssignTask } from "./AssignTask";

export class UpdateTask {
  constructor(
    private readonly tasks: TaskRepository,
    private readonly assignTask: AssignTask,
  ) {}

  /** Any status may follow any other (D47), so there is no transition check. */
  async execute(
    organizationId: string,
    taskId: string,
    request: UpdateTaskRequest,
  ): Promise<{ task: TaskResponse }> {
    const existing = await this.tasks.findById(organizationId, taskId);
    if (!existing) throw new AppError(ErrorCode.TASK_NOT_FOUND);

    if (request.assignedToUserId) {
      await this.assignTask.execute(organizationId, request.assignedToUserId);
    }

    const task = await this.tasks.update(organizationId, taskId, request);
    // The update matched nothing: the task was deleted just now.
    if (!task) throw new AppError(ErrorCode.TASK_NOT_FOUND);
    return { task: toTaskResponse(task) };
  }
}
