import { randomBytes, randomUUID } from "node:crypto";
import { OrganizationRole } from "../../../domain/enums/OrganizationRole";
import { canInviteRole } from "../../../domain/policies/OrganizationPermissions";
import { OrganizationInvitationRepository } from "../../../domain/repositories/OrganizationInvitationRepository";
import { OrganizationMembershipRepository } from "../../../domain/repositories/OrganizationMembershipRepository";
import { UserRepository } from "../../../domain/repositories/UserRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import {
  InvitationResponse,
  toInvitationResponse,
} from "../../dto/organization/OrganizationResponse";
import { TokenService } from "../../services/TokenService";

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const generateToken = () => randomBytes(32).toString("base64url");

export interface InviteOrganizationMemberCommand {
  organizationId: string;
  /** The caller's already-verified role in this organization. */
  actorRole: OrganizationRole;
  invitedBy: string;
  email: string;
  role: OrganizationRole;
}

export class InviteOrganizationMember {
  constructor(
    private readonly users: UserRepository,
    private readonly memberships: OrganizationMembershipRepository,
    private readonly invitations: OrganizationInvitationRepository,
    private readonly tokens: TokenService,
    private readonly newToken: () => string = generateToken,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * The raw token is returned once and never stored: only its SHA-256 hash is.
   * Inviting does not create a user.
   */
  async execute(
    command: InviteOrganizationMemberCommand,
  ): Promise<{ invitation: InvitationResponse; token: string }> {
    if (!canInviteRole(command.actorRole, command.role)) {
      throw new AppError(ErrorCode.INSUFFICIENT_ORGANIZATION_PERMISSION);
    }

    const existingUser = await this.users.findByEmail(command.email);
    if (existingUser) {
      const membership = await this.memberships.findByOrganizationAndUser(
        command.organizationId,
        existingUser.id,
      );
      if (membership) throw new AppError(ErrorCode.MEMBERSHIP_ALREADY_EXISTS);
    }

    const token = this.newToken();
    const invitation = await this.invitations.create({
      id: randomUUID(),
      organizationId: command.organizationId,
      email: command.email,
      role: command.role,
      tokenHash: this.tokens.hashToken(token),
      expiresAt: new Date(this.now().getTime() + INVITATION_TTL_MS),
      invitedBy: command.invitedBy,
    });

    return { invitation: toInvitationResponse(invitation), token };
  }
}
