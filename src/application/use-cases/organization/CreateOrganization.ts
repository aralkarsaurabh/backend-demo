import { randomBytes } from "node:crypto";
import { OrganizationRole } from "../../../domain/enums/OrganizationRole";
import { OrganizationRepository } from "../../../domain/repositories/OrganizationRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import { CreateOrganizationRequest } from "../../dto/organization/OrganizationRequests";
import {
  OrganizationWithRoleResponse,
  toOrganizationWithRole,
} from "../../dto/organization/OrganizationResponse";
import { slugify } from "./slugify";

const MAX_SLUG_RETRIES = 5;

const randomSuffix = () => randomBytes(2).toString("hex");

export class CreateOrganization {
  constructor(
    private readonly organizations: OrganizationRepository,
    private readonly suffix: () => string = randomSuffix,
  ) {}

  async execute(
    request: CreateOrganizationRequest,
    ownerUserId: string,
  ): Promise<{ organization: OrganizationWithRoleResponse }> {
    const base = slugify(request.name);

    for (let attempt = 0; attempt <= MAX_SLUG_RETRIES; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${this.suffix()}`;
      if (await this.organizations.findBySlug(slug)) continue;

      // Null means another request took the slug between the check and the insert.
      const organization = await this.organizations.createWithOwner(
        { name: request.name, slug },
        ownerUserId,
      );
      if (organization) {
        return { organization: toOrganizationWithRole(organization, OrganizationRole.OWNER) };
      }
    }

    throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR);
  }
}
