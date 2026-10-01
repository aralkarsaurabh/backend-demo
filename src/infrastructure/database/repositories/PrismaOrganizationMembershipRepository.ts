import {
  OrganizationMemberView,
  OrganizationMembership,
} from "../../../domain/entities/OrganizationMembership";
import { OrganizationRole } from "../../../domain/enums/OrganizationRole";
import { OrganizationMembershipRepository } from "../../../domain/repositories/OrganizationMembershipRepository";
import type { PrismaClient } from "../prisma";

export class PrismaOrganizationMembershipRepository implements OrganizationMembershipRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByOrganizationAndUser(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMembership | null> {
    return this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
  }

  async listByOrganization(organizationId: string): Promise<OrganizationMemberView[]> {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { organizationId },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
    return memberships.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      joinedAt: m.createdAt,
    }));
  }

  async updateRole(
    organizationId: string,
    userId: string,
    role: OrganizationRole,
  ): Promise<boolean> {
    // The role <> OWNER condition is what keeps the OWNER row untouchable.
    const result = await this.prisma.organizationMembership.updateMany({
      where: { organizationId, userId, role: { not: OrganizationRole.OWNER } },
      data: { role },
    });
    return result.count > 0;
  }

  async remove(organizationId: string, userId: string): Promise<boolean> {
    const result = await this.prisma.organizationMembership.deleteMany({
      where: { organizationId, userId, role: { not: OrganizationRole.OWNER } },
    });
    return result.count > 0;
  }
}
