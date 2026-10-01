import { OrganizationRole } from "../../../domain/enums/OrganizationRole";
import { OrganizationMembershipRepository } from "../../../domain/repositories/OrganizationMembershipRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";

export interface UpdateOrganizationMemberRoleCommand {
  organizationId: string;
  targetUserId: string;
  role: OrganizationRole;
}

export class UpdateOrganizationMemberRole {
  constructor(private readonly memberships: OrganizationMembershipRepository) {}

  /**
   * The route's permission check (OWNER only) has already run. The OWNER's role
   * can never change and OWNER can never be assigned (there is one, for life).
   */
  async execute(command: UpdateOrganizationMemberRoleCommand): Promise<{
    member: { userId: string; role: OrganizationRole };
    previousRole: OrganizationRole;
  }> {
    const target = await this.memberships.findByOrganizationAndUser(
      command.organizationId,
      command.targetUserId,
    );
    if (!target) throw new AppError(ErrorCode.MEMBERSHIP_NOT_FOUND);
    if (target.role === OrganizationRole.OWNER) {
      throw new AppError(ErrorCode.CANNOT_CHANGE_OWNER_ROLE);
    }

    const member = { userId: target.userId, role: command.role };
    if (target.role === command.role) return { member, previousRole: target.role };

    // The repository refuses to touch an OWNER row, even if one appeared since the read.
    const updated = await this.memberships.updateRole(
      command.organizationId,
      command.targetUserId,
      command.role,
    );
    if (!updated) throw new AppError(ErrorCode.CANNOT_CHANGE_OWNER_ROLE);

    return { member, previousRole: target.role };
  }
}
