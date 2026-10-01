import { z } from "zod";
import { PASSWORD_MAX_LENGTH } from "../../../config/constants";
import { emailField } from "./RegisterRequest";

export const loginRequestSchema = z.object({
  email: emailField,
  password: z
    .string({ error: "Password is required." })
    .min(1, "Password is required.")
    .max(
      PASSWORD_MAX_LENGTH,
      `Password must contain at most ${PASSWORD_MAX_LENGTH} characters.`,
    ),
});

export type LoginRequest = z.output<typeof loginRequestSchema>;
