import { OrganizationRole } from "../../../domain/enums/OrganizationRole";
import { outranks } from "../../../domain/policies/OrganizationPermissions";
import { OrganizationMembershipRepository } from "../../../domain/repositories/OrganizationMembershipRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";

export interface RemoveOrganizationMemberCommand {
  organizationId: string;
  /** The caller's already-verified role in this organization. */
  actorRole: OrganizationRole;
  targetUserId: string;
}

export class RemoveOrganizationMember {
  constructor(private readonly memberships: OrganizationMembershipRepository) {}

  /**
   * Nobody can remove the OWNER, including the OWNER (no leaving in v1), and the
   * actor must strictly outrank the target. That also stops an ADMIN removing
   * themselves or another ADMIN.
   */
  async execute(command: RemoveOrganizationMemberCommand): Promise<{ removedRole: OrganizationRole }> {
    const target = await this.memberships.findByOrganizationAndUser(
      command.organizationId,
      command.targetUserId,
    );
    if (!target) throw new AppError(ErrorCode.MEMBERSHIP_NOT_FOUND);
    if (target.role === OrganizationRole.OWNER) throw new AppError(ErrorCode.CANNOT_REMOVE_OWNER);
    if (!outranks(command.actorRole, target.role)) {
      throw new AppError(ErrorCode.INSUFFICIENT_ORGANIZATION_PERMISSION);
    }

    // The repository refuses to touch an OWNER row, even if one appeared since the read.
    const removed = await this.memberships.remove(command.organizationId, command.targetUserId);
    if (!removed) throw new AppError(ErrorCode.CANNOT_REMOVE_OWNER);

    return { removedRole: target.role };
  }
}
