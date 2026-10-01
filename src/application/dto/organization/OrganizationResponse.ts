import { Organization } from "../../../domain/entities/Organization";
import { OrganizationInvitation } from "../../../domain/entities/OrganizationInvitation";
import { OrganizationMemberView } from "../../../domain/entities/OrganizationMembership";
import { OrganizationRole } from "../../../domain/enums/OrganizationRole";

export interface OrganizationSummaryResponse {
  id: string;
  name: string;
  slug: string;
}

export interface OrganizationWithRoleResponse extends OrganizationSummaryResponse {
  /** The caller's role in this organization. */
  role: OrganizationRole;
}

export interface OrganizationDetailResponse extends OrganizationWithRoleResponse {
  createdAt: string;
}

export interface MemberResponse {
  userId: string;
  name: string;
  email: string;
  role: OrganizationRole;
  joinedAt: string;
}

export interface InvitationResponse {
  id: string;
  email: string;
  role: OrganizationRole;
  expiresAt: string;
}

export function toOrganizationSummary(organization: Organization): OrganizationSummaryResponse {
  return { id: organization.id, name: organization.name, slug: organization.slug };
}

export function toOrganizationWithRole(
  organization: Organization,
  role: OrganizationRole,
): OrganizationWithRoleResponse {
  return { ...toOrganizationSummary(organization), role };
}

export function toOrganizationDetail(
  organization: Organization,
  role: OrganizationRole,
): OrganizationDetailResponse {
  return {
    ...toOrganizationWithRole(organization, role),
    createdAt: organization.createdAt.toISOString(),
  };
}

export function toMemberResponse(member: OrganizationMemberView): MemberResponse {
  return {
    userId: member.userId,
    name: member.name,
    email: member.email,
    role: member.role,
    joinedAt: member.joinedAt.toISOString(),
  };
}

/** Never includes the token hash. */
export function toInvitationResponse(invitation: OrganizationInvitation): InvitationResponse {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt.toISOString(),
  };
}
