import { Request, Response } from "express";
import {
  changePasswordSchema,
  updateCurrentUserSchema,
  updateUserStatusSchema,
  userIdParamSchema,
} from "../../../application/dto/user/UserRequests";
import { ChangePassword } from "../../../application/use-cases/user/ChangePassword";
import { UpdateCurrentUser } from "../../../application/use-cases/user/UpdateCurrentUser";
import { UpdateUserStatus } from "../../../application/use-cases/user/UpdateUserStatus";
import { GetCurrentUser } from "../../../application/use-cases/user/GetCurrentUser";
import { ListUsers } from "../../../application/use-cases/user/ListUsers";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import { Logger } from "../../../shared/logger";
import { ApiResponse } from "../../../shared/response/ApiResponse";
import { parseOrThrow } from "../../../shared/validation/parse";

export interface UserUseCases {
  getCurrentUser: GetCurrentUser;
  listUsers: ListUsers;
  updateCurrentUser: UpdateCurrentUser;
  changePassword: ChangePassword;
  updateUserStatus: UpdateUserStatus;
}

export class UserController {
  constructor(
    private readonly useCases: UserUseCases,
    private readonly logger: Logger,
  ) {}

  me = async (req: Request, res: Response) => {
    if (!req.user) throw new AppError(ErrorCode.UNAUTHORIZED);
    const result = await this.useCases.getCurrentUser.execute(req.user.id);
    res.status(200).json(ApiResponse.success("Profile retrieved successfully.", result));
  };

  updateMe = async (req: Request, res: Response) => {
    if (!req.user) throw new AppError(ErrorCode.UNAUTHORIZED);
    const body = parseOrThrow(updateCurrentUserSchema, req.body ?? {});
    const result = await this.useCases.updateCurrentUser.execute(req.user.id, body);
    res.status(200).json(ApiResponse.success("Account updated successfully.", result));
  };

  changePassword = async (req: Request, res: Response) => {
    if (!req.user) throw new AppError(ErrorCode.UNAUTHORIZED);
    const body = parseOrThrow(changePasswordSchema, req.body ?? {});
    await this.useCases.changePassword.execute(req.user.id, body);
    this.logger.info("password_changed", { userId: req.user.id });
    res.status(200).json(ApiResponse.success("Password changed successfully. Please sign in again.", null));
  };

  /** ADMIN only; the route applies authorize(). */
  updateStatus = async (req: Request, res: Response) => {
    if (!req.user) throw new AppError(ErrorCode.UNAUTHORIZED);
    const { userId } = parseOrThrow(userIdParamSchema, req.params);
    const body = parseOrThrow(updateUserStatusSchema, req.body ?? {});
    const result = await this.useCases.updateUserStatus.execute(req.user.id, userId, body);
    this.logger.info("user_status_changed", {
      actorId: req.user.id,
      userId,
      status: result.user.status,
    });
    res.status(200).json(ApiResponse.success("User status updated successfully.", result));
  };

  /** ADMIN only; the route applies authorize(). */
  list = async (_req: Request, res: Response) => {
    const result = await this.useCases.listUsers.execute();
    res.status(200).json(ApiResponse.success("Users retrieved.", result));
  };
}
