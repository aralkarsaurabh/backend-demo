import { OrganizationRole } from "../enums/OrganizationRole";

export interface OrganizationMembership {
  id: string;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  createdAt: Date;
  updatedAt: Date;
}

/** A membership joined with the member's public user fields. */
export interface OrganizationMemberView {
  userId: string;
  name: string;
  email: string;
  role: OrganizationRole;
  joinedAt: Date;
}
