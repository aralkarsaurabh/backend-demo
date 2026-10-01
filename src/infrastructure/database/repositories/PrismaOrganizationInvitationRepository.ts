import { OrganizationInvitation } from "../../../domain/entities/OrganizationInvitation";
import {
  NewOrganizationInvitation,
  OrganizationInvitationRepository,
} from "../../../domain/repositories/OrganizationInvitationRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import type { PrismaClient } from "../prisma";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

const isUniqueViolation = (error: unknown) =>
  (error as { code?: string }).code === UNIQUE_CONSTRAINT_VIOLATION;

export class PrismaOrganizationInvitationRepository implements OrganizationInvitationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: NewOrganizationInvitation): Promise<OrganizationInvitation> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // An expired, unaccepted invitation must not block inviting the same email again.
        await tx.organizationInvitation.deleteMany({
          where: {
            organizationId: data.organizationId,
            email: data.email,
            acceptedAt: null,
            expiresAt: { lt: new Date() },
          },
        });
        // The partial unique index (organizationId, email) WHERE acceptedAt IS NULL
        // rejects a second open invitation, even from a concurrent request.
        return tx.organizationInvitation.create({ data });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError(ErrorCode.INVITATION_ALREADY_EXISTS);
      throw error;
    }
  }

  findByTokenHash(tokenHash: string): Promise<OrganizationInvitation | null> {
    return this.prisma.organizationInvitation.findUnique({ where: { tokenHash } });
  }

  async accept(
    invitation: OrganizationInvitation,
    userId: string,
    now: Date,
  ): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // The acceptedAt IS NULL and expiresAt > now conditions are what let only
        // one of several simultaneous accepts win, and refuse an expired one.
        const marked = await tx.organizationInvitation.updateMany({
          where: { id: invitation.id, acceptedAt: null, expiresAt: { gt: now } },
          data: { acceptedAt: now },
        });
        if (marked.count === 0) return false;

        // If this fails, the transaction rolls back and the invitation stays open.
        await tx.organizationMembership.create({
          data: {
            organizationId: invitation.organizationId,
            userId,
            role: invitation.role,
          },
        });
        return true;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError(ErrorCode.MEMBERSHIP_ALREADY_EXISTS);
      throw error;
    }
  }
}
