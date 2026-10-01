import { z } from "zod";
import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "../../../config/constants";

export const emailField = z
  .string({ error: "Email is required." })
  .trim()
  .toLowerCase()
  .max(EMAIL_MAX_LENGTH, `Email must be at most ${EMAIL_MAX_LENGTH} characters.`)
  .pipe(z.email({ error: "Please provide a valid email address." }));

export const registerRequestSchema = z.object({
  name: z
    .string({ error: "Name is required." })
    .trim()
    .min(1, "Name is required.")
    .max(NAME_MAX_LENGTH, `Name must be at most ${NAME_MAX_LENGTH} characters.`),
  email: emailField,
  // Passwords are never trimmed.
  password: z
    .string({ error: "Password is required." })
    .min(
      PASSWORD_MIN_LENGTH,
      `Password must contain at least ${PASSWORD_MIN_LENGTH} characters.`,
    )
    .max(
      PASSWORD_MAX_LENGTH,
      `Password must contain at most ${PASSWORD_MAX_LENGTH} characters.`,
    ),
});

export type RegisterRequest = z.output<typeof registerRequestSchema>;
