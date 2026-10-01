import { OrganizationRepository } from "../../../domain/repositories/OrganizationRepository";
import {
  OrganizationWithRoleResponse,
  toOrganizationWithRole,
} from "../../dto/organization/OrganizationResponse";

export class ListUserOrganizations {
  constructor(private readonly organizations: OrganizationRepository) {}

  async execute(userId: string): Promise<{ organizations: OrganizationWithRoleResponse[] }> {
    const items = await this.organizations.listByUserId(userId);
    return {
      organizations: items.map(({ organization, role }) =>
        toOrganizationWithRole(organization, role),
      ),
    };
  }
}
