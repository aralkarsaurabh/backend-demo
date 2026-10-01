import { UserRepository } from "../../../domain/repositories/UserRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import { toUserResponse, UserResponse } from "../../dto/user/UserResponse";

export class GetCurrentUser {
  constructor(private readonly users: UserRepository) {}

  /** Reads from the database, so it shows the current role even if the token's is stale. */
  async execute(userId: string): Promise<{ user: UserResponse }> {
    const user = await this.users.findById(userId);
    if (!user) throw new AppError(ErrorCode.USER_NOT_FOUND);
    return { user: toUserResponse(user) };
  }
}
