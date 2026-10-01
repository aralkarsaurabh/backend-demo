import { RefreshTokenRepository } from "../../../domain/repositories/RefreshTokenRepository";
import { UserRepository } from "../../../domain/repositories/UserRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import { RefreshResponse } from "../../dto/auth/AuthResponse";
import { RefreshTokenRequest } from "../../dto/auth/RefreshTokenRequest";
import { TokenService } from "../../services/TokenService";
import { issueTokenPair } from "./issueTokenPair";

export class RefreshTokens {
  constructor(
    private readonly users: UserRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly tokens: TokenService,
  ) {}

  async execute(request: RefreshTokenRequest): Promise<RefreshResponse> {
    // Signature, expiry and `type` are checked here; throws the matching code.
    const payload = this.tokens.verifyRefreshToken(request.refreshToken);

    const stored = await this.refreshTokens.findById(payload.jti);
    if (
      !stored ||
      stored.userId !== payload.sub ||
      stored.tokenHash !== this.tokens.hashToken(request.refreshToken)
    ) {
      throw new AppError(ErrorCode.INVALID_REFRESH_TOKEN);
    }

    // Already rotated into a newer token: someone is replaying an old one.
    if (stored.replacedBy) {
      await this.refreshTokens.revokeFamily(stored.familyId);
      throw new AppError(ErrorCode.REFRESH_TOKEN_REUSED);
    }

    // Revoked without being rotated, i.e. by logout.
    if (stored.revokedAt) {
      throw new AppError(ErrorCode.REFRESH_TOKEN_REVOKED);
    }

    const user = await this.users.findById(stored.userId);
    if (!user) throw new AppError(ErrorCode.INVALID_REFRESH_TOKEN);

    // The role is read from the database here, so a refreshed access token
    // always carries the user's current role.
    const { pair, record } = issueTokenPair(this.tokens, user, stored.familyId);

    const rotated = await this.refreshTokens.rotate(stored.id, record);
    if (!rotated) {
      // Lost a race against another refresh with the same token: treat as reuse.
      await this.refreshTokens.revokeFamily(stored.familyId);
      throw new AppError(ErrorCode.REFRESH_TOKEN_REUSED);
    }

    return { tokens: pair };
  }
}
