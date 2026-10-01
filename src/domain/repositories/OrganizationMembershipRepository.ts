import {
  OrganizationMemberView,
  OrganizationMembership,
} from "../entities/OrganizationMembership";
import { OrganizationRole } from "../enums/OrganizationRole";

export interface OrganizationMembershipRepository {
  findByOrganizationAndUser(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMembership | null>;

  /** Members with their user fields, oldest membership first. */
  listByOrganization(organizationId: string): Promise<OrganizationMemberView[]>;

  /**
   * Changes a member's role. Never touches an OWNER row: returns false, changing
   * nothing, if there is no such member or the member is the OWNER.
   */
  updateRole(organizationId: string, userId: string, role: OrganizationRole): Promise<boolean>;

  /**
   * Removes a member. Never touches an OWNER row: returns false, changing
   * nothing, if there is no such member or the member is the OWNER.
   */
  remove(organizationId: string, userId: string): Promise<boolean>;
}
