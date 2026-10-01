import { UserRepository } from "../../../domain/repositories/UserRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import { UpdateCurrentUserRequest } from "../../dto/user/UserRequests";
import { ProfileResponse, toProfileResponse } from "../../dto/user/UserResponse";

export class UpdateCurrentUser {
  constructor(private readonly users: UserRepository) {}

  /** Only the name is editable; email, role and status are never taken from the client. */
  async execute(
    userId: string,
    request: UpdateCurrentUserRequest,
  ): Promise<{ user: ProfileResponse }> {
    if (!(await this.users.findById(userId))) throw new AppError(ErrorCode.USER_NOT_FOUND);
    const user = await this.users.updateProfile(userId, { name: request.name });
    return { user: toProfileResponse(user) };
  }
}
