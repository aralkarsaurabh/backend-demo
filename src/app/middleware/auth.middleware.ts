import { RequestHandler } from "express";
import { TokenService } from "../../application/services/TokenService";
import { AppError } from "../../shared/errors/AppError";
import { ErrorCode } from "../../shared/errors/error-codes";

const BEARER = /^Bearer\s+(\S+)$/i;

/**
 * Verifies the access token (signature, expiry, type) and attaches
 * `req.user = { id, role }`. Stateless: no database lookup, so the role is the
 * one in the token (design choice D1).
 */
export function authenticate(tokens: TokenService): RequestHandler {
  return (req, _res, next) => {
    const match = BEARER.exec(req.headers.authorization ?? "");
    if (!match) throw new AppError(ErrorCode.UNAUTHORIZED);

    const payload = tokens.verifyAccessToken(match[1]);
    req.user = { id: payload.sub, role: payload.role };
    next();
  };
}
