import { OrganizationRole } from "../enums/OrganizationRole";

export interface OrganizationInvitation {
  id: string;
  organizationId: string;
  /** Lowercased. */
  email: string;
  role: OrganizationRole;
  /** SHA-256 of the invitation token. The token itself is never stored. */
  tokenHash: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  invitedBy: string;
  createdAt: Date;
}
