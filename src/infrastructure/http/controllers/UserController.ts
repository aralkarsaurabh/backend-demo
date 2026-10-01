import { Request, Response } from "express";
import { GetCurrentUser } from "../../../application/use-cases/user/GetCurrentUser";
import { ListUsers } from "../../../application/use-cases/user/ListUsers";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import { ApiResponse } from "../../../shared/response/ApiResponse";

export class UserController {
  constructor(
    private readonly getCurrentUser: GetCurrentUser,
    private readonly listUsers: ListUsers,
  ) {}

  me = async (req: Request, res: Response) => {
    if (!req.user) throw new AppError(ErrorCode.UNAUTHORIZED);
    const result = await this.getCurrentUser.execute(req.user.id);
    res.status(200).json(ApiResponse.success("Current user retrieved.", result));
  };

  /** ADMIN only; the route applies authorize(). */
  list = async (_req: Request, res: Response) => {
    const result = await this.listUsers.execute();
    res.status(200).json(ApiResponse.success("Users retrieved.", result));
  };
}
