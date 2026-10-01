import { z } from "zod";
import { OrganizationRole } from "../../../domain/enums/OrganizationRole";
import { emailField } from "../auth/RegisterRequest";

export const ORGANIZATION_NAME_MIN_LENGTH = 2;
export const ORGANIZATION_NAME_MAX_LENGTH = 100;
export const INVITATION_TOKEN_MAX_LENGTH = 256;

/** OWNER is never assignable: there is exactly one, the creator. */
const assignableRole = z.enum([OrganizationRole.ADMIN, OrganizationRole.MEMBER], {
  error: "Role must be ADMIN or MEMBER.",
});

export const createOrganizationRequestSchema = z.object({
  name: z
    .string({ error: "Name is required." })
    .trim()
    .transform((name) => name.replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(
          ORGANIZATION_NAME_MIN_LENGTH,
          `Name must contain at least ${ORGANIZATION_NAME_MIN_LENGTH} characters.`,
        )
        .max(
          ORGANIZATION_NAME_MAX_LENGTH,
          `Name must be at most ${ORGANIZATION_NAME_MAX_LENGTH} characters.`,
        ),
    ),
});

export const inviteMemberRequestSchema = z.object({
  email: emailField,
  role: assignableRole.default(OrganizationRole.MEMBER),
});

export const acceptInvitationRequestSchema = z.object({
  token: z
    .string({ error: "Token is required." })
    .min(1, "Token is required.")
    .max(INVITATION_TOKEN_MAX_LENGTH, "Token is not valid."),
});

export const updateMemberRoleRequestSchema = z.object({
  role: assignableRole,
});

export const organizationParamsSchema = z.object({
  organizationId: z.uuid({ error: "Organization id must be a valid id." }),
});

export const memberParamsSchema = organizationParamsSchema.extend({
  userId: z.uuid({ error: "User id must be a valid id." }),
});

export type CreateOrganizationRequest = z.output<typeof createOrganizationRequestSchema>;
export type InviteMemberRequest = z.output<typeof inviteMemberRequestSchema>;
export type AcceptInvitationRequest = z.output<typeof acceptInvitationRequestSchema>;
export type UpdateMemberRoleRequest = z.output<typeof updateMemberRoleRequestSchema>;
