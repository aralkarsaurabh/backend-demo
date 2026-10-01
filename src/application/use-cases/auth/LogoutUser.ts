import { RefreshTokenRepository } from "../../../domain/repositories/RefreshTokenRepository";
import { AppError } from "../../../shared/errors/AppError";
import { RefreshTokenRequest } from "../../dto/auth/RefreshTokenRequest";
import { TokenService } from "../../services/TokenService";

export class LogoutUser {
  constructor(
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly tokens: TokenService,
  ) {}

  /**
   * Revokes the whole token family of the presented refresh token. Idempotent:
   * a token that is invalid, expired or already revoked is not an error, so the
   * response never reveals whether a token was real. Infrastructure failures
   * still propagate.
   */
  async execute(request: RefreshTokenRequest): Promise<void> {
    try {
      const payload = this.tokens.verifyRefreshToken(request.refreshToken);
      const stored = await this.refreshTokens.findById(payload.jti);
      if (
        stored &&
        stored.tokenHash === this.tokens.hashToken(request.refreshToken)
      ) {
        await this.refreshTokens.revokeFamily(stored.familyId);
      }
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
    }
  }
}
