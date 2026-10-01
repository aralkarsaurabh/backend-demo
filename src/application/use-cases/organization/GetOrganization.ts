import { OrganizationRole } from "../../../domain/enums/OrganizationRole";
import { OrganizationRepository } from "../../../domain/repositories/OrganizationRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import {
  OrganizationDetailResponse,
  toOrganizationDetail,
} from "../../dto/organization/OrganizationResponse";

export class GetOrganization {
  constructor(private readonly organizations: OrganizationRepository) {}

  /** `callerRole` is the caller's already-verified role in this organization. */
  async execute(
    organizationId: string,
    callerRole: OrganizationRole,
  ): Promise<{ organization: OrganizationDetailResponse }> {
    const organization = await this.organizations.findById(organizationId);
    if (!organization) throw new AppError(ErrorCode.ORGANIZATION_NOT_FOUND);
    return { organization: toOrganizationDetail(organization, callerRole) };
  }
}
