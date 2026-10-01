import { UserStatus } from "../../../domain/enums/UserStatus";
import { canTransitionStatus } from "../../../domain/policies/UserStatusTransitions";
import { RefreshTokenRepository } from "../../../domain/repositories/RefreshTokenRepository";
import { UserRepository } from "../../../domain/repositories/UserRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import { UpdateUserStatusRequest } from "../../dto/user/UserRequests";
import { ProfileResponse, toProfileResponse } from "../../dto/user/UserResponse";

export class UpdateUserStatus {
  constructor(
    private readonly users: UserRepository,
    private readonly refreshTokens: RefreshTokenRepository,
  ) {}

  /**
   * Platform-level; the route applies authorize(ADMIN). Suspending or deactivating
   * revokes all of the user's refresh tokens, so no new access token can be
   * obtained. An access token already issued lives until it expires (D1).
   */
  async execute(
    actorId: string,
    targetId: string,
    request: UpdateUserStatusRequest,
  ): Promise<{ user: ProfileResponse }> {
    if (actorId === targetId) throw new AppError(ErrorCode.CANNOT_CHANGE_OWN_STATUS);

    const target = await this.users.findById(targetId);
    if (!target) throw new AppError(ErrorCode.USER_NOT_FOUND);

    if (!canTransitionStatus(target.status, request.status)) {
      if (request.status === target.status) {
        if (request.status === UserStatus.SUSPENDED) {
          throw new AppError(ErrorCode.USER_ALREADY_SUSPENDED);
        }
        if (request.status === UserStatus.DEACTIVATED) {
          throw new AppError(ErrorCode.USER_ALREADY_DEACTIVATED);
        }
      }
      throw new AppError(ErrorCode.INVALID_USER_STATUS);
    }

    const user = await this.users.updateStatus(targetId, request.status);
    if (request.status !== UserStatus.ACTIVE) {
      await this.refreshTokens.revokeAllForUser(targetId);
    }
    return { user: toProfileResponse(user) };
  }
}
