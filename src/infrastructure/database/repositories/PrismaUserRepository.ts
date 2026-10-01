import { User } from "../../../domain/entities/User";
import { UserStatus } from "../../../domain/enums/UserStatus";
import {
  CreateUserData,
  UpdateUserData,
  UserRepository,
} from "../../../domain/repositories/UserRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import type { PrismaClient } from "../prisma";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async create(data: CreateUserData): Promise<User> {
    try {
      return await this.prisma.user.create({ data });
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_CONSTRAINT_VIOLATION) {
        throw new AppError(ErrorCode.EMAIL_ALREADY_EXISTS);
      }
      throw error;
    }
  }

  findAll(): Promise<User[]> {
    return this.prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  }

  updateProfile(userId: string, data: UpdateUserData): Promise<User> {
    return this.prisma.user.update({ where: { id: userId }, data: { name: data.name } });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  updateStatus(userId: string, status: UserStatus): Promise<User> {
    return this.prisma.user.update({ where: { id: userId }, data: { status } });
  }
}
