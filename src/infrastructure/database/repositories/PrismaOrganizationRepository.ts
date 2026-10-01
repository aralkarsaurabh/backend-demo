import { Organization } from "../../../domain/entities/Organization";
import { OrganizationRole } from "../../../domain/enums/OrganizationRole";
import {
  NewOrganization,
  OrganizationRepository,
  OrganizationWithRole,
} from "../../../domain/repositories/OrganizationRepository";
import type { PrismaClient } from "../prisma";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

export class PrismaOrganizationRepository implements OrganizationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createWithOwner(data: NewOrganization, ownerUserId: string): Promise<Organization | null> {
    try {
      // One transaction: if the membership insert fails, no organization remains.
      return await this.prisma.$transaction(async (tx) => {
        const organization = await tx.organization.create({ data });
        await tx.organizationMembership.create({
          data: {
            organizationId: organization.id,
            userId: ownerUserId,
            role: OrganizationRole.OWNER,
          },
        });
        return organization;
      });
    } catch (error) {
      // The only unique column on a new organization is the slug.
      if ((error as { code?: string }).code === UNIQUE_CONSTRAINT_VIOLATION) return null;
      throw error;
    }
  }

  findById(id: string): Promise<Organization | null> {
    return this.prisma.organization.findUnique({ where: { id } });
  }

  findBySlug(slug: string): Promise<Organization | null> {
    return this.prisma.organization.findUnique({ where: { slug } });
  }

  async listByUserId(userId: string): Promise<OrganizationWithRole[]> {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId },
      include: { organization: true },
      orderBy: { createdAt: "asc" },
    });
    return memberships.map((m) => ({ organization: m.organization, role: m.role }));
  }
}
