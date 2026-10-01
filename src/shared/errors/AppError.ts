import { ERROR_DEFAULT_MESSAGE, ERROR_HTTP_STATUS, ErrorCode } from "./error-codes";

export type ErrorDetails = Record<string, string>;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details: ErrorDetails | null;

  constructor(
    code: ErrorCode,
    options: { message?: string; details?: ErrorDetails } = {},
  ) {
    super(options.message ?? ERROR_DEFAULT_MESSAGE[code]);
    this.name = "AppError";
    this.code = code;
    this.httpStatus = ERROR_HTTP_STATUS[code];
    this.details = options.details ?? null;
  }
}
