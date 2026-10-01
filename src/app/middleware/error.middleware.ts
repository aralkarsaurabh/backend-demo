import { ErrorRequestHandler, RequestHandler } from "express";
import { AppError } from "../../shared/errors/AppError";
import { ErrorCode } from "../../shared/errors/error-codes";
import { Logger } from "../../shared/logger";
import { ApiResponse } from "../../shared/response/ApiResponse";

export const notFoundHandler: RequestHandler = () => {
  throw new AppError(ErrorCode.ROUTE_NOT_FOUND);
};

/** Turns anything thrown in a request into the standard error envelope. */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error, req, res, next) => {
    if (res.headersSent) return next(error);

    const appError = toAppError(error);
    if (appError.code === ErrorCode.INTERNAL_SERVER_ERROR) {
      // Never leak internals to the client; the full error goes to the log only.
      logger.error("unhandled_error", {
        method: req.method,
        path: req.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    res
      .status(appError.httpStatus)
      .json(ApiResponse.failure(appError.message, appError.code, appError.details));
  };
}

function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  // Errors raised by express.json() before our code runs.
  const type = (error as { type?: string } | null)?.type;
  if (type === "entity.parse.failed") {
    return new AppError(ErrorCode.VALIDATION_ERROR, {
      details: { body: "Request body must be valid JSON." },
    });
  }
  if (type === "entity.too.large") {
    return new AppError(ErrorCode.VALIDATION_ERROR, {
      details: { body: "Request body is too large." },
    });
  }

  return new AppError(ErrorCode.INTERNAL_SERVER_ERROR);
}
