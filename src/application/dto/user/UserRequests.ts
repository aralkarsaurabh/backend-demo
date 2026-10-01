import { z } from "zod";
import {
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "../../../config/constants";
import { UserStatus } from "../../../domain/enums/UserStatus";

// strictObject: a client sending role, status, email etc. gets a validation error
// instead of having those fields silently ignored.
export const updateCurrentUserSchema = z.strictObject({
  name: z
    .string({ error: "Name is required." })
    .trim()
    .min(1, "Name is required.")
    .max(NAME_MAX_LENGTH, `Name must be at most ${NAME_MAX_LENGTH} characters.`),
});

export type UpdateCurrentUserRequest = z.output<typeof updateCurrentUserSchema>;

export const changePasswordSchema = z.strictObject({
  currentPassword: z
    .string({ error: "Current password is required." })
    .min(1, "Current password is required.")
    .max(PASSWORD_MAX_LENGTH, `Password must contain at most ${PASSWORD_MAX_LENGTH} characters.`),
  newPassword: z
    .string({ error: "New password is required." })
    .min(
      PASSWORD_MIN_LENGTH,
      `Password must contain at least ${PASSWORD_MIN_LENGTH} characters.`,
    )
    .max(PASSWORD_MAX_LENGTH, `Password must contain at most ${PASSWORD_MAX_LENGTH} characters.`),
});

export type ChangePasswordRequest = z.output<typeof changePasswordSchema>;

export const updateUserStatusSchema = z.strictObject({
  status: z.enum([UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.DEACTIVATED], {
    error: "Status must be ACTIVE, SUSPENDED or DEACTIVATED.",
  }),
});

export type UpdateUserStatusRequest = z.output<typeof updateUserStatusSchema>;

export const userIdParamSchema = z.object({ userId: z.uuid({ error: "User id is not valid." }) });
