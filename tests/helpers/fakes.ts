import { randomUUID } from "node:crypto";
import { PasswordService } from "../../src/application/services/PasswordService";
import { LoginUser } from "../../src/application/use-cases/auth/LoginUser";
import { LogoutUser } from "../../src/application/use-cases/auth/LogoutUser";
import { RefreshTokens } from "../../src/application/use-cases/auth/RefreshTokens";
import { RegisterUser } from "../../src/application/use-cases/auth/RegisterUser";
import { GetCurrentUser } from "../../src/application/use-cases/user/GetCurrentUser";
import { ListUsers } from "../../src/application/use-cases/user/ListUsers";
import { RefreshToken } from "../../src/domain/entities/RefreshToken";
import { User } from "../../src/domain/entities/User";
import { UserRole } from "../../src/domain/enums/UserRole";
import {
  NewRefreshToken,
  RefreshTokenRepository,
} from "../../src/domain/repositories/RefreshTokenRepository";
import {
  CreateUserData,
  UserRepository,
} from "../../src/domain/repositories/UserRepository";
import { JwtTokenService } from "../../src/infrastructure/authentication/JwtTokenService";
import { AppError } from "../../src/shared/errors/AppError";
import { ErrorCode } from "../../src/shared/errors/error-codes";

export class InMemoryUserRepository implements UserRepository {
  users: User[] = [];

  async findById(id: string) {
    return this.users.find((u) => u.id === id) ?? null;
  }

  async findByEmail(email: string) {
    return this.users.find((u) => u.email === email) ?? null;
  }

  async create(data: CreateUserData) {
    if (this.users.some((u) => u.email === data.email)) {
      throw new AppError(ErrorCode.EMAIL_ALREADY_EXISTS);
    }
    const now = new Date();
    const user: User = {
      id: randomUUID(),
      name: data.name,
      email: data.email,
      passwordHash: data.passwordHash,
      role: data.role ?? UserRole.USER,
      createdAt: now,
      updatedAt: now,
    };
    this.users.push(user);
    return user;
  }

  async findAll() {
    return [...this.users];
  }
}

export class InMemoryRefreshTokenRepository implements RefreshTokenRepository {
  rows = new Map<string, RefreshToken>();

  async create(data: NewRefreshToken) {
    const row: RefreshToken = {
      ...data,
      revokedAt: null,
      replacedBy: null,
      createdAt: new Date(),
    };
    this.rows.set(row.id, row);
    return row;
  }

  async findById(id: string) {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  // No awaits between the check and the writes, so this is atomic, like the
  // conditional UPDATE inside the Prisma transaction.
  async rotate(currentId: string, next: NewRefreshToken) {
    const current = this.rows.get(currentId);
    if (!current || current.revokedAt) return false;
    current.revokedAt = new Date();
    current.replacedBy = next.id;
    await this.create(next);
    return true;
  }

  async revokeFamily(familyId: string) {
    for (const row of this.rows.values()) {
      if (row.familyId === familyId && !row.revokedAt) row.revokedAt = new Date();
    }
  }

  family(familyId: string) {
    return [...this.rows.values()].filter((r) => r.familyId === familyId);
  }
}

export class FakePasswordService implements PasswordService {
  hashCalls = 0;
  compareCalls = 0;

  async hash(password: string) {
    this.hashCalls++;
    return `hashed:${password}`;
  }

  async compare(password: string, hash: string) {
    this.compareCalls++;
    return hash === `hashed:${password}`;
  }
}

export const TEST_SECRETS = { access: "a".repeat(40), refresh: "r".repeat(40) };

export function buildApp(ttl?: { access: number; refresh: number }) {
  const users = new InMemoryUserRepository();
  const refreshTokens = new InMemoryRefreshTokenRepository();
  const passwords = new FakePasswordService();
  const tokens = new JwtTokenService(TEST_SECRETS, ttl);

  return {
    users,
    refreshTokens,
    passwords,
    tokens,
    register: new RegisterUser(users, passwords),
    login: new LoginUser(users, refreshTokens, passwords, tokens),
    refresh: new RefreshTokens(users, refreshTokens, tokens),
    logout: new LogoutUser(refreshTokens, tokens),
    getCurrentUser: new GetCurrentUser(users),
    listUsers: new ListUsers(users),
  };
}

export type TestApp = ReturnType<typeof buildApp>;

export async function registerAndLogin(app: TestApp, email = "asha@example.com") {
  await app.register.execute({ name: "Asha", email, password: "StrongPass123!" });
  return app.login.execute({ email, password: "StrongPass123!" });
}

/** Resolves to the AppError code a promise rejects with, or "NO ERROR". */
export async function errorCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "NO ERROR";
  } catch (error) {
    return error instanceof AppError ? error.code : `NON-APP ERROR: ${String(error)}`;
  }
}
