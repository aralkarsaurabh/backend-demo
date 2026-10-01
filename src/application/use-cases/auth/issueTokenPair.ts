import { randomUUID } from "node:crypto";
import { User } from "../../../domain/entities/User";
import { NewRefreshToken } from "../../../domain/repositories/RefreshTokenRepository";
import { TokenPairResponse } from "../../dto/auth/AuthResponse";
import { TokenService } from "../../services/TokenService";

/**
 * Builds a new access + refresh token pair for a user. The caller persists
 * `record` (login: create, refresh: rotate), so storing and issuing stay
 * in the use case that owns the transaction.
 */
export function issueTokenPair(
  tokens: TokenService,
  user: Pick<User, "id" | "role">,
  familyId: string,
): { pair: TokenPairResponse; record: NewRefreshToken } {
  const id = randomUUID();
  const access = tokens.generateAccessToken({ sub: user.id, role: user.role });
  const refresh = tokens.generateRefreshToken({ sub: user.id, jti: id });

  return {
    pair: {
      accessToken: access.token,
      refreshToken: refresh.token,
      tokenType: "Bearer",
      expiresIn: access.expiresIn,
    },
    record: {
      id,
      userId: user.id,
      familyId,
      tokenHash: tokens.hashToken(refresh.token),
      expiresAt: refresh.expiresAt,
    },
  };
}
