import { Organization } from "../entities/Organization";
import { OrganizationRole } from "../enums/OrganizationRole";

export interface NewOrganization {
  name: string;
  slug: string;
}

export interface OrganizationWithRole {
  organization: Organization;
  role: OrganizationRole;
}

export interface OrganizationRepository {
  /**
   * In one transaction, creates the organization and an OWNER membership for
   * `ownerUserId`. Returns null, changing nothing, if the slug is already taken.
   */
  createWithOwner(data: NewOrganization, ownerUserId: string): Promise<Organization | null>;

  findById(id: string): Promise<Organization | null>;

  findBySlug(slug: string): Promise<Organization | null>;

  /** The user's organizations with their role in each, oldest membership first. */
  listByUserId(userId: string): Promise<OrganizationWithRole[]>;
}
