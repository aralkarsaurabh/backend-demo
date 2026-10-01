import { UserRole } from "../../domain/enums/UserRole";

export interface AccessTokenClaims {
  sub: string;
  role: UserRole;
}

export interface RefreshTokenClaims {
  sub: string;
  /** The RefreshToken row id. */
  jti: string;
}

export interface AccessTokenPayload extends AccessTokenClaims {
  type: "access";
  iat: number;
  nbf: number;
  exp: number;
}

export interface RefreshTokenPayload extends RefreshTokenClaims {
  type: "refresh";
  iat: number;
  nbf: number;
  exp: number;
}

export interface TokenService {
  generateAccessToken(claims: AccessTokenClaims): {
    token: string;
    expiresIn: number;
  };

  generateRefreshToken(claims: RefreshTokenClaims): {
    token: string;
    expiresAt: Date;
  };

  /** Throws AppError: ACCESS_TOKEN_EXPIRED or INVALID_ACCESS_TOKEN. */
  verifyAccessToken(token: string): AccessTokenPayload;

  /** Throws AppError: REFRESH_TOKEN_EXPIRED or INVALID_REFRESH_TOKEN. */
  verifyRefreshToken(token: string): RefreshTokenPayload;

  /** SHA-256 hex digest, used for the stored `tokenHash`. */
  hashToken(token: string): string;
}
