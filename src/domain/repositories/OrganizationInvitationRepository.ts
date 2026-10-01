import { OrganizationInvitation } from "../entities/OrganizationInvitation";
import { OrganizationRole } from "../enums/OrganizationRole";

export interface NewOrganizationInvitation {
  id: string;
  organizationId: string;
  email: string;
  role: OrganizationRole;
  tokenHash: string;
  expiresAt: Date;
  invitedBy: string;
}

export interface OrganizationInvitationRepository {
  /**
   * In one transaction, deletes expired unaccepted invitations for the same
   * organization and email, then inserts. Throws AppError(INVITATION_ALREADY_EXISTS)
   * if an open invitation for that email already exists.
   */
  create(data: NewOrganizationInvitation): Promise<OrganizationInvitation>;

  findByTokenHash(tokenHash: string): Promise<OrganizationInvitation | null>;

  /**
   * Atomically accepts an invitation: in one transaction, marks it accepted
   * (only if it is not yet accepted and not expired at `now`) and creates the
   * membership with the invited role. Returns false, changing nothing, if the
   * invitation could not be marked. Throws AppError(MEMBERSHIP_ALREADY_EXISTS),
   * changing nothing, if the user is already a member.
   */
  accept(invitation: OrganizationInvitation, userId: string, now: Date): Promise<boolean>;
}
