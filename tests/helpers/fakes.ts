import { randomUUID } from "node:crypto";
import { PasswordService } from "../../src/application/services/PasswordService";
import { LoginUser } from "../../src/application/use-cases/auth/LoginUser";
import { LogoutUser } from "../../src/application/use-cases/auth/LogoutUser";
import { RefreshTokens } from "../../src/application/use-cases/auth/RefreshTokens";
import { RegisterUser } from "../../src/application/use-cases/auth/RegisterUser";
import { AcceptOrganizationInvitation } from "../../src/application/use-cases/organization/AcceptOrganizationInvitation";
import { CreateOrganization } from "../../src/application/use-cases/organization/CreateOrganization";
import { GetOrganization } from "../../src/application/use-cases/organization/GetOrganization";
import { InviteOrganizationMember } from "../../src/application/use-cases/organization/InviteOrganizationMember";
import { ListOrganizationMembers } from "../../src/application/use-cases/organization/ListOrganizationMembers";
import { ListUserOrganizations } from "../../src/application/use-cases/organization/ListUserOrganizations";
import { RemoveOrganizationMember } from "../../src/application/use-cases/organization/RemoveOrganizationMember";
import { UpdateOrganizationMemberRole } from "../../src/application/use-cases/organization/UpdateOrganizationMemberRole";
import { GetCurrentUser } from "../../src/application/use-cases/user/GetCurrentUser";
import { ListUsers } from "../../src/application/use-cases/user/ListUsers";
import { Organization } from "../../src/domain/entities/Organization";
import { OrganizationInvitation } from "../../src/domain/entities/OrganizationInvitation";
import {
  OrganizationMemberView,
  OrganizationMembership,
} from "../../src/domain/entities/OrganizationMembership";
import { RefreshToken } from "../../src/domain/entities/RefreshToken";
import { User } from "../../src/domain/entities/User";
import { OrganizationRole } from "../../src/domain/enums/OrganizationRole";
import { UserRole } from "../../src/domain/enums/UserRole";
import {
  NewOrganizationInvitation,
  OrganizationInvitationRepository,
} from "../../src/domain/repositories/OrganizationInvitationRepository";
import { OrganizationMembershipRepository } from "../../src/domain/repositories/OrganizationMembershipRepository";
import {
  NewOrganization,
  OrganizationRepository,
  OrganizationWithRole,
} from "../../src/domain/repositories/OrganizationRepository";
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
  const orgData = new InMemoryOrganizationData();
  const organizations = new InMemoryOrganizationRepository(orgData);
  const memberships = new InMemoryOrganizationMembershipRepository(orgData, users);
  const invitations = new InMemoryOrganizationInvitationRepository(orgData);

  return {
    users,
    refreshTokens,
    passwords,
    tokens,
    orgData,
    organizations,
    memberships,
    invitations,
    register: new RegisterUser(users, passwords),
    login: new LoginUser(users, refreshTokens, passwords, tokens),
    refresh: new RefreshTokens(users, refreshTokens, tokens),
    logout: new LogoutUser(refreshTokens, tokens),
    getCurrentUser: new GetCurrentUser(users),
    listUsers: new ListUsers(users),
    createOrganization: new CreateOrganization(organizations),
    listUserOrganizations: new ListUserOrganizations(organizations),
    getOrganization: new GetOrganization(organizations),
    inviteOrganizationMember: new InviteOrganizationMember(users, memberships, invitations, tokens),
    acceptOrganizationInvitation: new AcceptOrganizationInvitation(
      users,
      organizations,
      memberships,
      invitations,
      tokens,
    ),
    listOrganizationMembers: new ListOrganizationMembers(memberships),
    updateOrganizationMemberRole: new UpdateOrganizationMemberRole(memberships),
    removeOrganizationMember: new RemoveOrganizationMember(memberships),
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

/** The three organization fakes share one store, as the real tables do. */
export class InMemoryOrganizationData {
  organizations: Organization[] = [];
  memberships: OrganizationMembership[] = [];
  invitations: OrganizationInvitation[] = [];
}

export class InMemoryOrganizationRepository implements OrganizationRepository {
  constructor(private readonly data: InMemoryOrganizationData) {}

  // Like the Prisma transaction: either both rows exist afterwards or neither.
  async createWithOwner(input: NewOrganization, ownerUserId: string) {
    if (this.data.organizations.some((o) => o.slug === input.slug)) return null;
    const now = new Date();
    const organization: Organization = {
      id: randomUUID(),
      name: input.name,
      slug: input.slug,
      createdAt: now,
      updatedAt: now,
    };
    this.data.organizations.push(organization);
    this.data.memberships.push({
      id: randomUUID(),
      organizationId: organization.id,
      userId: ownerUserId,
      role: OrganizationRole.OWNER,
      createdAt: now,
      updatedAt: now,
    });
    return organization;
  }

  async findById(id: string) {
    return this.data.organizations.find((o) => o.id === id) ?? null;
  }

  async findBySlug(slug: string) {
    return this.data.organizations.find((o) => o.slug === slug) ?? null;
  }

  async listByUserId(userId: string): Promise<OrganizationWithRole[]> {
    return this.data.memberships
      .filter((m) => m.userId === userId)
      .map((m) => ({
        organization: this.data.organizations.find((o) => o.id === m.organizationId)!,
        role: m.role,
      }));
  }
}

export class InMemoryOrganizationMembershipRepository implements OrganizationMembershipRepository {
  constructor(
    private readonly data: InMemoryOrganizationData,
    private readonly users: InMemoryUserRepository,
  ) {}

  async findByOrganizationAndUser(organizationId: string, userId: string) {
    const row = this.data.memberships.find(
      (m) => m.organizationId === organizationId && m.userId === userId,
    );
    return row ? { ...row } : null;
  }

  async listByOrganization(organizationId: string): Promise<OrganizationMemberView[]> {
    return this.data.memberships
      .filter((m) => m.organizationId === organizationId)
      .map((m) => {
        const user = this.users.users.find((u) => u.id === m.userId)!;
        return {
          userId: m.userId,
          name: user.name,
          email: user.email,
          role: m.role,
          joinedAt: m.createdAt,
        };
      });
  }

  // Both refuse an OWNER row, like the `role <> 'OWNER'` condition in the SQL.
  async updateRole(organizationId: string, userId: string, role: OrganizationRole) {
    const row = this.data.memberships.find(
      (m) => m.organizationId === organizationId && m.userId === userId,
    );
    if (!row || row.role === OrganizationRole.OWNER) return false;
    row.role = role;
    row.updatedAt = new Date();
    return true;
  }

  async remove(organizationId: string, userId: string) {
    const index = this.data.memberships.findIndex(
      (m) => m.organizationId === organizationId && m.userId === userId,
    );
    if (index < 0 || this.data.memberships[index].role === OrganizationRole.OWNER) return false;
    this.data.memberships.splice(index, 1);
    return true;
  }
}

export class InMemoryOrganizationInvitationRepository implements OrganizationInvitationRepository {
  constructor(private readonly data: InMemoryOrganizationData) {}

  async create(input: NewOrganizationInvitation) {
    const now = new Date();
    const sameTarget = (i: OrganizationInvitation) =>
      i.organizationId === input.organizationId && i.email === input.email && i.acceptedAt === null;

    // Expired unaccepted invitations for this (organization, email) are replaced.
    this.data.invitations = this.data.invitations.filter((i) => !(sameTarget(i) && i.expiresAt < now));
    if (this.data.invitations.some(sameTarget)) {
      throw new AppError(ErrorCode.INVITATION_ALREADY_EXISTS);
    }

    const row: OrganizationInvitation = { ...input, acceptedAt: null, createdAt: now };
    this.data.invitations.push(row);
    return { ...row };
  }

  async findByTokenHash(tokenHash: string) {
    const row = this.data.invitations.find((i) => i.tokenHash === tokenHash);
    return row ? { ...row } : null;
  }

  // No awaits between the checks and the writes, so this is atomic, like the SQL
  // transaction. A duplicate membership throws before anything is written.
  async accept(invitation: OrganizationInvitation, userId: string, now: Date) {
    const row = this.data.invitations.find((i) => i.id === invitation.id);
    if (!row || row.acceptedAt || row.expiresAt <= now) return false;

    const alreadyMember = this.data.memberships.some(
      (m) => m.organizationId === invitation.organizationId && m.userId === userId,
    );
    if (alreadyMember) throw new AppError(ErrorCode.MEMBERSHIP_ALREADY_EXISTS);

    row.acceptedAt = now;
    this.data.memberships.push({
      id: randomUUID(),
      organizationId: invitation.organizationId,
      userId,
      role: invitation.role,
      createdAt: now,
      updatedAt: now,
    });
    return true;
  }
}
