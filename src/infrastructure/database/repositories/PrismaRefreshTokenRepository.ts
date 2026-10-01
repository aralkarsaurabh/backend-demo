import { RefreshToken } from "../../../domain/entities/RefreshToken";
import {
  NewRefreshToken,
  RefreshTokenRepository,
} from "../../../domain/repositories/RefreshTokenRepository";
import type { PrismaClient } from "../prisma";

export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(data: NewRefreshToken): Promise<RefreshToken> {
    return this.prisma.refreshToken.create({ data });
  }

  findById(id: string): Promise<RefreshToken | null> {
    return this.prisma.refreshToken.findUnique({ where: { id } });
  }

  rotate(currentId: string, next: NewRefreshToken): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // The revokedAt IS NULL condition is what lets only one of several
      // simultaneous refreshes with the same token win.
      const revoked = await tx.refreshToken.updateMany({
        where: { id: currentId, revokedAt: null },
        data: { revokedAt: new Date(), replacedBy: next.id },
      });
      if (revoked.count === 0) return false;

      await tx.refreshToken.create({ data: next });
      return true;
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
