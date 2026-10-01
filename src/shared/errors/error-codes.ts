export const ErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  EMAIL_ALREADY_EXISTS: "EMAIL_ALREADY_EXISTS",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  USER_NOT_FOUND: "USER_NOT_FOUND",

  UNAUTHORIZED: "UNAUTHORIZED",
  INVALID_ACCESS_TOKEN: "INVALID_ACCESS_TOKEN",
  ACCESS_TOKEN_EXPIRED: "ACCESS_TOKEN_EXPIRED",

  INVALID_REFRESH_TOKEN: "INVALID_REFRESH_TOKEN",
  REFRESH_TOKEN_EXPIRED: "REFRESH_TOKEN_EXPIRED",
  REFRESH_TOKEN_REVOKED: "REFRESH_TOKEN_REVOKED",
  REFRESH_TOKEN_REUSED: "REFRESH_TOKEN_REUSED",

  FORBIDDEN: "FORBIDDEN",
  ROUTE_NOT_FOUND: "ROUTE_NOT_FOUND",
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  EMAIL_ALREADY_EXISTS: 409,
  INVALID_CREDENTIALS: 401,
  USER_NOT_FOUND: 404,
  UNAUTHORIZED: 401,
  INVALID_ACCESS_TOKEN: 401,
  ACCESS_TOKEN_EXPIRED: 401,
  INVALID_REFRESH_TOKEN: 401,
  REFRESH_TOKEN_EXPIRED: 401,
  REFRESH_TOKEN_REVOKED: 401,
  REFRESH_TOKEN_REUSED: 401,
  FORBIDDEN: 403,
  ROUTE_NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
};

export const ERROR_DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  VALIDATION_ERROR: "Please correct the highlighted fields.",
  EMAIL_ALREADY_EXISTS: "An account with this email already exists.",
  INVALID_CREDENTIALS: "The email or password is incorrect.",
  USER_NOT_FOUND: "User not found.",
  UNAUTHORIZED: "You must be signed in to do this.",
  INVALID_ACCESS_TOKEN: "Your access token is not valid.",
  ACCESS_TOKEN_EXPIRED: "Your access token has expired.",
  INVALID_REFRESH_TOKEN: "Your refresh token is not valid.",
  REFRESH_TOKEN_EXPIRED: "Your refresh token has expired. Please sign in again.",
  REFRESH_TOKEN_REVOKED: "Your session has ended. Please sign in again.",
  REFRESH_TOKEN_REUSED:
    "This refresh token was already used. You were signed out for security reasons.",
  FORBIDDEN: "You are not allowed to do this.",
  ROUTE_NOT_FOUND: "The requested route does not exist.",
  INTERNAL_SERVER_ERROR: "Something went wrong. Please try again later.",
};
