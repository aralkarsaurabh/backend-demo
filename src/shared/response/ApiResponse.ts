import { ErrorDetails } from "../errors/AppError";
import { ErrorCode } from "../errors/error-codes";

export interface ApiMeta {
  timestamp: string;
}

export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
  error: null;
  meta: ApiMeta;
}

export interface ApiFailure {
  success: false;
  message: string;
  data: null;
  error: { code: ErrorCode; details: ErrorDetails | null };
  meta: ApiMeta;
}

const meta = (): ApiMeta => ({ timestamp: new Date().toISOString() });

export const ApiResponse = {
  success<T>(message: string, data: T): ApiSuccess<T> {
    return { success: true, message, data, error: null, meta: meta() };
  },

  failure(
    message: string,
    code: ErrorCode,
    details: ErrorDetails | null = null,
  ): ApiFailure {
    return {
      success: false,
      message,
      data: null,
      error: { code, details },
      meta: meta(),
    };
  },
};
