import { OrganizationRole } from "../../../domain/enums/OrganizationRole";
import { OrganizationInvitationRepository } from "../../../domain/repositories/OrganizationInvitationRepository";
import { OrganizationMembershipRepository } from "../../../domain/repositories/OrganizationMembershipRepository";
import { OrganizationRepository } from "../../../domain/repositories/OrganizationRepository";
import { UserRepository } from "../../../domain/repositories/UserRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import {
  OrganizationSummaryResponse,
  toOrganizationSummary,
} from "../../dto/organization/OrganizationResponse";
import { TokenService } from "../../services/TokenService";

export class AcceptOrganizationInvitation {
  constructor(
    private readonly users: UserRepository,
    private readonly organizations: OrganizationRepository,
    private readonly memberships: OrganizationMembershipRepository,
    private readonly invitations: OrganizationInvitationRepository,
    private readonly tokens: TokenService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(request: {
    token: string;
    userId: string;
  }): Promise<{ organization: OrganizationSummaryResponse; role: OrganizationRole }> {
    const invitation = await this.invitations.findByTokenHash(
      this.tokens.hashToken(request.token),
    );
    // Unknown and already-accepted tokens look the same.
    if (!invitation || invitation.acceptedAt) {
      throw new AppError(ErrorCode.INVALID_INVITATION);
    }

    // The email comes from the database; it is not in the access token. A token
    // holder who is not the invitee learns nothing, not even whether it expired.
    const user = await this.users.findById(request.userId);
    if (!user || user.email !== invitation.email) {
      throw new AppError(ErrorCode.INVALID_INVITATION);
    }

    const now = this.now();
    if (invitation.expiresAt <= now) throw new AppError(ErrorCode.INVITATION_EXPIRED);

    const existing = await this.memberships.findByOrganizationAndUser(
      invitation.organizationId,
      user.id,
    );
    if (existing) throw new AppError(ErrorCode.MEMBERSHIP_ALREADY_EXISTS);

    // False means a concurrent accept (or expiry) got there first.
    const accepted = await this.invitations.accept(invitation, user.id, now);
    if (!accepted) throw new AppError(ErrorCode.INVALID_INVITATION);

    const organization = await this.organizations.findById(invitation.organizationId);
    if (!organization) throw new AppError(ErrorCode.INVALID_INVITATION);

    return { organization: toOrganizationSummary(organization), role: invitation.role };
  }
}
