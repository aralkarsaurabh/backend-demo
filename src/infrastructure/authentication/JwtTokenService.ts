import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import {
  AccessTokenClaims,
  AccessTokenPayload,
  RefreshTokenClaims,
  RefreshTokenPayload,
  TokenService,
} from "../../application/services/TokenService";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from "../../config/constants";
import { UserRole } from "../../domain/enums/UserRole";
import { AppError } from "../../shared/errors/AppError";
import { ErrorCode } from "../../shared/errors/error-codes";

const ALGORITHM = "HS256";

export class JwtTokenService implements TokenService {
  constructor(
    private readonly secrets: { access: string; refresh: string },
    private readonly ttl: { access: number; refresh: number } = {
      access: ACCESS_TOKEN_TTL_SECONDS,
      refresh: REFRESH_TOKEN_TTL_SECONDS,
    },
  ) {}

  generateAccessToken(claims: AccessTokenClaims) {
    const now = nowInSeconds();
    const token = jwt.sign(
      { sub: claims.sub, role: claims.role, type: "access", iat: now, nbf: now },
      this.secrets.access,
      { algorithm: ALGORITHM, expiresIn: this.ttl.access },
    );
    return { token, expiresIn: this.ttl.access };
  }

  generateRefreshToken(claims: RefreshTokenClaims) {
    const now = nowInSeconds();
    const token = jwt.sign(
      { sub: claims.sub, jti: claims.jti, type: "refresh", iat: now, nbf: now },
      this.secrets.refresh,
      { algorithm: ALGORITHM, expiresIn: this.ttl.refresh },
    );
    return { token, expiresAt: new Date((now + this.ttl.refresh) * 1000) };
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    const payload = this.verify(
      token,
      this.secrets.access,
      ErrorCode.ACCESS_TOKEN_EXPIRED,
      ErrorCode.INVALID_ACCESS_TOKEN,
    );
    if (
      payload.type !== "access" ||
      typeof payload.sub !== "string" ||
      !Object.values(UserRole).includes(payload.role as UserRole)
    ) {
      throw new AppError(ErrorCode.INVALID_ACCESS_TOKEN);
    }
    return payload as unknown as AccessTokenPayload;
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    const payload = this.verify(
      token,
      this.secrets.refresh,
      ErrorCode.REFRESH_TOKEN_EXPIRED,
      ErrorCode.INVALID_REFRESH_TOKEN,
    );
    if (
      payload.type !== "refresh" ||
      typeof payload.sub !== "string" ||
      typeof payload.jti !== "string"
    ) {
      throw new AppError(ErrorCode.INVALID_REFRESH_TOKEN);
    }
    return payload as unknown as RefreshTokenPayload;
  }

  hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private verify(
    token: string,
    secret: string,
    expiredCode: ErrorCode,
    invalidCode: ErrorCode,
  ): jwt.JwtPayload {
    try {
      const decoded = jwt.verify(token, secret, { algorithms: [ALGORITHM] });
      if (typeof decoded === "string") throw new AppError(invalidCode);
      return decoded;
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError(expiredCode);
      }
      throw new AppError(invalidCode);
    }
  }
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
