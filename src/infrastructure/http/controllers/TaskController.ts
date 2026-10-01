import { Request, Response } from "express";
import {
  createTaskRequestSchema,
  taskListQuerySchema,
  taskParamsSchema,
  updateTaskRequestSchema,
} from "../../../application/dto/task/TaskRequests";
import { CreateTask } from "../../../application/use-cases/task/CreateTask";
import { DeleteTask } from "../../../application/use-cases/task/DeleteTask";
import { GetTask } from "../../../application/use-cases/task/GetTask";
import { ListTasks } from "../../../application/use-cases/task/ListTasks";
import { UpdateTask } from "../../../application/use-cases/task/UpdateTask";
import {
  OrganizationPermission,
  hasPermission,
} from "../../../domain/policies/OrganizationPermissions";
import { OrganizationRole } from "../../../domain/enums/OrganizationRole";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import { Logger } from "../../../shared/logger";
import { ApiResponse } from "../../../shared/response/ApiResponse";
import { parseOrThrow } from "../../../shared/validation/parse";

export interface TaskUseCases {
  createTask: CreateTask;
  getTask: GetTask;
  listTasks: ListTasks;
  updateTask: UpdateTask;
  deleteTask: DeleteTask;
}

const currentUser = (req: Request) => {
  if (!req.user) throw new AppError(ErrorCode.UNAUTHORIZED);
  return req.user;
};

/** Set by requireOrganizationMembership; every task route runs it first. */
const currentMembership = (req: Request) => {
  if (!req.organizationMembership) throw new AppError(ErrorCode.ORGANIZATION_NOT_FOUND);
  return req.organizationMembership;
};

/** Assigning is its own permission, so it depends on the body and cannot be a route guard. */
const requireAssignPermission = (role: OrganizationRole, assignedToUserId: string | null | undefined) => {
  if (assignedToUserId !== undefined && !hasPermission(role, OrganizationPermission.TASK_ASSIGN)) {
    throw new AppError(ErrorCode.INSUFFICIENT_ORGANIZATION_PERMISSION);
  }
};

// Logs carry ids only, never a task's title or description.
export class TaskController {
  constructor(
    private readonly useCases: TaskUseCases,
    private readonly logger: Logger,
  ) {}

  create = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { organizationId, role } = currentMembership(req);
    const body = parseOrThrow(createTaskRequestSchema, req.body ?? {});
    requireAssignPermission(role, body.assignedToUserId);
    const result = await this.useCases.createTask.execute(organizationId, body);

    this.logger.info("task_created", { userId: user.id, organizationId, taskId: result.task.id });
    res.status(201).json(ApiResponse.success("Task created successfully.", result));
  };

  list = async (req: Request, res: Response) => {
    const { organizationId } = currentMembership(req);
    const query = parseOrThrow(taskListQuerySchema, req.query);
    const result = await this.useCases.listTasks.execute(organizationId, query);
    res.status(200).json(ApiResponse.success("Tasks retrieved successfully.", result));
  };

  get = async (req: Request, res: Response) => {
    const { organizationId } = currentMembership(req);
    const { taskId } = parseOrThrow(taskParamsSchema, req.params);
    const result = await this.useCases.getTask.execute(organizationId, taskId);
    res.status(200).json(ApiResponse.success("Task retrieved successfully.", result));
  };

  update = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { organizationId, role } = currentMembership(req);
    const { taskId } = parseOrThrow(taskParamsSchema, req.params);
    const body = parseOrThrow(updateTaskRequestSchema, req.body ?? {});
    requireAssignPermission(role, body.assignedToUserId);
    const result = await this.useCases.updateTask.execute(organizationId, taskId, body);

    this.logger.info("task_updated", {
      userId: user.id,
      organizationId,
      taskId,
      // field names only, never the values
      changedFields: Object.keys(body)
        .filter((key) => body[key as keyof typeof body] !== undefined)
        .join(","),
    });
    res.status(200).json(ApiResponse.success("Task updated successfully.", result));
  };

  remove = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { organizationId } = currentMembership(req);
    const { taskId } = parseOrThrow(taskParamsSchema, req.params);
    await this.useCases.deleteTask.execute(organizationId, taskId);

    this.logger.info("task_deleted", { userId: user.id, organizationId, taskId });
    res.status(200).json(ApiResponse.success("Task deleted successfully.", null));
  };
}
