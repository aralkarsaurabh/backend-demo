import { z } from "zod";
import { AppError, ErrorDetails } from "../errors/AppError";
import { ErrorCode } from "../errors/error-codes";

/** Runs a Zod schema and throws VALIDATION_ERROR with a field -> message map. */
export function parseOrThrow<S extends z.ZodType>(
  schema: S,
  input: unknown,
): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const details: ErrorDetails = {};
  for (const issue of result.error.issues) {
    const field = issue.path.length > 0 ? issue.path.join(".") : "request";
    if (!(field in details)) details[field] = issue.message;
  }
  throw new AppError(ErrorCode.VALIDATION_ERROR, { details });
}
