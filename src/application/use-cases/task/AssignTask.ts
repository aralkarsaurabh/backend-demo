import { OrganizationMembershipRepository } from "../../../domain/repositories/OrganizationMembershipRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";

/** The assignment rule (D46): a task is only ever assigned to a member of its own organization. */
export class AssignTask {
  constructor(private readonly memberships: OrganizationMembershipRepository) {}

  /**
   * A user that does not exist and a user that is not a member fail the same way, so the
   * error does not reveal which user ids exist.
   */
  async execute(organizationId: string, assigneeUserId: string): Promise<void> {
    const membership = await this.memberships.findByOrganizationAndUser(organizationId, assigneeUserId);
    if (!membership) throw new AppError(ErrorCode.ASSIGNED_USER_NOT_MEMBER);
  }
}
