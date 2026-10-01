import { RequestHandler } from "express";
import { UserRole } from "../../domain/enums/UserRole";
import { AppError } from "../../shared/errors/AppError";
import { ErrorCode } from "../../shared/errors/error-codes";

/** Must run after `authenticate`. */
export function authorize(...allowed: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw new AppError(ErrorCode.UNAUTHORIZED);
    if (!allowed.includes(req.user.role)) throw new AppError(ErrorCode.FORBIDDEN);
    next();
  };
}
