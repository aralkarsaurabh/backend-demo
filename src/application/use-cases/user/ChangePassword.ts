import { RefreshTokenRepository } from "../../../domain/repositories/RefreshTokenRepository";
import { UserRepository } from "../../../domain/repositories/UserRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import { PasswordService } from "../../services/PasswordService";
import { ChangePasswordRequest } from "../../dto/user/UserRequests";

export class ChangePassword {
  constructor(
    private readonly users: UserRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly passwords: PasswordService,
  ) {}

  /**
   * Revokes every refresh token of the user, including the caller's own, so a
   * refresh token stolen before the change stops working. Access tokens already
   * issued stay valid until they expire (D1).
   */
  async execute(userId: string, request: ChangePasswordRequest): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) throw new AppError(ErrorCode.USER_NOT_FOUND);

    if (!(await this.passwords.compare(request.currentPassword, user.passwordHash))) {
      throw new AppError(ErrorCode.INVALID_CURRENT_PASSWORD);
    }

    await this.users.updatePassword(userId, await this.passwords.hash(request.newPassword));
    await this.refreshTokens.revokeAllForUser(userId);
  }
}
