import { z } from "zod";
import { TOKEN_MAX_LENGTH } from "../../../config/constants";

/**
 * Input is the raw `Authorization` header value; output is the bare token.
 * Used by both refresh and logout.
 */
export const refreshTokenRequestSchema = z
  .object({
    authorization: z
      .string({ error: "A Bearer refresh token is required." })
      .trim()
      .regex(/^Bearer\s+\S+$/i, "Authorization must be 'Bearer <refreshToken>'.")
      .max(TOKEN_MAX_LENGTH + 7, "Refresh token is too long."),
  })
  .transform(({ authorization }) => ({
    refreshToken: authorization.replace(/^Bearer\s+/i, ""),
  }));

export type RefreshTokenRequest = z.output<typeof refreshTokenRequestSchema>;
