import { OrganizationMembershipRepository } from "../../../domain/repositories/OrganizationMembershipRepository";
import { MemberResponse, toMemberResponse } from "../../dto/organization/OrganizationResponse";

export class ListOrganizationMembers {
  constructor(private readonly memberships: OrganizationMembershipRepository) {}

  async execute(organizationId: string): Promise<{ members: MemberResponse[] }> {
    const members = await this.memberships.listByOrganization(organizationId);
    return { members: members.map(toMemberResponse) };
  }
}
