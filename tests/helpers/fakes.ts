import { randomUUID } from "node:crypto";
import { CreatePipeline } from "../../src/application/use-cases/pipeline/CreatePipeline";
import { ListPipelines } from "../../src/application/use-cases/pipeline/ListPipelines";
import { GetPipeline } from "../../src/application/use-cases/pipeline/GetPipeline";
import { UpdatePipeline } from "../../src/application/use-cases/pipeline/UpdatePipeline";
import { DeletePipeline } from "../../src/application/use-cases/pipeline/DeletePipeline";
import { CreatePipelineStage } from "../../src/application/use-cases/pipeline/CreatePipelineStage";
import { UpdatePipelineStage } from "../../src/application/use-cases/pipeline/UpdatePipelineStage";
import { DeletePipelineStage } from "../../src/application/use-cases/pipeline/DeletePipelineStage";
import { ReorderPipelineStages } from "../../src/application/use-cases/pipeline/ReorderPipelineStages";
import { MoveLeadToStage } from "../../src/application/use-cases/pipeline/MoveLeadToStage";
import { GetPipelineSummary } from "../../src/application/use-cases/pipeline/GetPipelineSummary";
import { Pipeline, PipelineStage, PipelineWithStages } from "../../src/domain/entities/Pipeline";
import {
  CreatePipelineData,
  PipelineRepository,
  PipelineSummary,
  UpdatePipelineData,
} from "../../src/domain/repositories/PipelineRepository";
import {
  CreatePipelineStageData,
  PipelineStageRepository,
  UpdatePipelineStageData,
} from "../../src/domain/repositories/PipelineStageRepository";
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
import { ChangePassword } from "../../src/application/use-cases/user/ChangePassword";
import { UpdateCurrentUser } from "../../src/application/use-cases/user/UpdateCurrentUser";
import { UpdateUserStatus } from "../../src/application/use-cases/user/UpdateUserStatus";
import { GetCurrentUser } from "../../src/application/use-cases/user/GetCurrentUser";
import { ListUsers } from "../../src/application/use-cases/user/ListUsers";
import { Customer } from "../../src/domain/entities/Customer";
import {
  CreateCustomerData,
  CustomerListQuery,
  CustomerPage,
  CustomerRepository,
  UpdateCustomerData,
} from "../../src/domain/repositories/CustomerRepository";
import { CreateCustomer } from "../../src/application/use-cases/customer/CreateCustomer";
import { ListCustomers } from "../../src/application/use-cases/customer/ListCustomers";
import { UpdateCustomer } from "../../src/application/use-cases/customer/UpdateCustomer";
import { DeleteCustomer } from "../../src/application/use-cases/customer/DeleteCustomer";
import { GetCustomer } from "../../src/application/use-cases/customer/GetCustomer";
import { AssignLead } from "../../src/application/use-cases/lead/AssignLead";
import { ConvertLead } from "../../src/application/use-cases/lead/ConvertLead";
import { CreateLead } from "../../src/application/use-cases/lead/CreateLead";
import { DeleteLead } from "../../src/application/use-cases/lead/DeleteLead";
import { GetLead } from "../../src/application/use-cases/lead/GetLead";
import { ListLeads } from "../../src/application/use-cases/lead/ListLeads";
import { UpdateLead } from "../../src/application/use-cases/lead/UpdateLead";
import { Lead } from "../../src/domain/entities/Lead";
import {
  ConvertedLead,
  CreateLeadData,
  LeadListQuery,
  LeadPage,
  LeadRepository,
  UpdateLeadData,
} from "../../src/domain/repositories/LeadRepository";
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
import { UserStatus } from "../../src/domain/enums/UserStatus";
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
  UpdateUserData,
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
      status: UserStatus.ACTIVE,
      createdAt: now,
      updatedAt: now,
    };
    this.users.push(user);
    return user;
  }

  async findAll() {
    return [...this.users];
  }

  private require(userId: string) {
    const user = this.users.find((u) => u.id === userId);
    if (!user) throw new AppError(ErrorCode.USER_NOT_FOUND);
    return user;
  }

  async updateProfile(userId: string, data: UpdateUserData) {
    const user = this.require(userId);
    user.name = data.name;
    user.updatedAt = new Date();
    return { ...user };
  }

  async updatePassword(userId: string, passwordHash: string) {
    const user = this.require(userId);
    user.passwordHash = passwordHash;
    user.updatedAt = new Date();
  }

  async updateStatus(userId: string, status: UserStatus) {
    const user = this.require(userId);
    user.status = status;
    user.updatedAt = new Date();
    return { ...user };
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

  async revokeAllForUser(userId: string) {
    for (const row of this.rows.values()) {
      if (row.userId === userId && !row.revokedAt) row.revokedAt = new Date();
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
  const customers = new InMemoryCustomerRepository();
  const pipelineData = new InMemoryPipelineData();
  const leads = new InMemoryLeadRepository(customers, pipelineData);
  const pipelines = new InMemoryPipelineRepository(pipelineData, leads);
  const pipelineStages = new InMemoryPipelineStageRepository(pipelineData, leads);

  return {
    users,
    refreshTokens,
    passwords,
    tokens,
    orgData,
    organizations,
    memberships,
    invitations,
    customers,
    leads,
    pipelineData,
    pipelines,
    pipelineStages,
    register: new RegisterUser(users, passwords),
    login: new LoginUser(users, refreshTokens, passwords, tokens),
    refresh: new RefreshTokens(users, refreshTokens, tokens),
    logout: new LogoutUser(refreshTokens, tokens),
    getCurrentUser: new GetCurrentUser(users),
    listUsers: new ListUsers(users),
    updateCurrentUser: new UpdateCurrentUser(users),
    changePassword: new ChangePassword(users, refreshTokens, passwords),
    updateUserStatus: new UpdateUserStatus(users, refreshTokens),
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
    createCustomer: new CreateCustomer(customers),
    getCustomer: new GetCustomer(customers),
    listCustomers: new ListCustomers(customers),
    updateCustomer: new UpdateCustomer(customers),
    deleteCustomer: new DeleteCustomer(customers),
    createLead: new CreateLead(leads),
    getLead: new GetLead(leads),
    listLeads: new ListLeads(leads),
    assignLead: new AssignLead(memberships),
    updateLead: new UpdateLead(leads, new AssignLead(memberships)),
    deleteLead: new DeleteLead(leads),
    convertLead: new ConvertLead(leads),
    createPipeline: new CreatePipeline(pipelines),
    listPipelines: new ListPipelines(pipelines),
    getPipeline: new GetPipeline(pipelines),
    updatePipeline: new UpdatePipeline(pipelines),
    deletePipeline: new DeletePipeline(pipelines),
    createPipelineStage: new CreatePipelineStage(pipelineStages),
    updatePipelineStage: new UpdatePipelineStage(pipelines, pipelineStages),
    deletePipelineStage: new DeletePipelineStage(pipelines, pipelineStages),
    reorderPipelineStages: new ReorderPipelineStages(pipelines, pipelineStages),
    moveLeadToStage: new MoveLeadToStage(leads, pipelineStages),
    getPipelineSummary: new GetPipelineSummary(pipelines),
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

/** Like the Prisma repository, every method is scoped to one organization. */
export class InMemoryCustomerRepository implements CustomerRepository {
  readonly customers: Customer[] = [];

  async create(organizationId: string, data: CreateCustomerData) {
    const now = new Date();
    const customer: Customer = {
      id: randomUUID(),
      organizationId,
      name: data.name,
      email: data.email ?? null,
      phone: data.phone ?? null,
      company: data.company ?? null,
      notes: data.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.customers.push(customer);
    return { ...customer };
  }

  async findById(organizationId: string, customerId: string) {
    const row = this.customers.find((c) => c.id === customerId && c.organizationId === organizationId);
    return row ? { ...row } : null;
  }

  async update(organizationId: string, customerId: string, data: UpdateCustomerData) {
    const row = this.customers.find((c) => c.id === customerId && c.organizationId === organizationId);
    if (!row) return null;
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) (row as unknown as Record<string, unknown>)[key] = value;
    }
    row.updatedAt = new Date();
    return { ...row };
  }

  async delete(organizationId: string, customerId: string) {
    const index = this.customers.findIndex((c) => c.id === customerId && c.organizationId === organizationId);
    if (index < 0) return false;
    this.customers.splice(index, 1);
    return true;
  }

  /** Mirrors the SQL: filters, a total order ending in id, then the page. */
  async list(organizationId: string, query: CustomerListQuery): Promise<CustomerPage> {
    const needle = query.search?.toLowerCase();
    const has = (value: string | null) => value?.toLowerCase().includes(needle!) ?? false;
    const matching = this.customers.filter(
      (c) =>
        c.organizationId === organizationId &&
        (!query.company || c.company?.toLowerCase() === query.company.toLowerCase()) &&
        (!query.createdFrom || c.createdAt >= query.createdFrom) &&
        (!query.createdTo || c.createdAt <= query.createdTo) &&
        (!needle || has(c.name) || has(c.email) || has(c.phone) || has(c.company)),
    );

    const dir = query.sortOrder === "asc" ? 1 : -1;
    const key = (c: Customer) => {
      const value = c[query.sortBy];
      return value instanceof Date ? value.getTime() : value;
    };
    matching.sort((a, b) => {
      const [x, y] = [key(a), key(b)];
      if (x !== y) {
        if (x === null) return 1; // empty values last, like nulls: "last"
        if (y === null) return -1;
        return (x < y ? -1 : 1) * dir;
      }
      return (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) * dir;
    });

    const start = (query.page - 1) * query.limit;
    return {
      items: matching.slice(start, start + query.limit).map((c) => ({ ...c })),
      totalItems: matching.length,
    };
  }
}

/**
 * Like the Prisma repository, every method is scoped to one organization, and update and convert
 * refuse a converted lead. Convert writes the lead only after the guard passes, so there is
 * nothing to roll back here; the real rollback is proved against SQL in lead-repositories.test.ts.
 */
export class InMemoryLeadRepository implements LeadRepository {
  readonly leads: Lead[] = [];

  constructor(
    private readonly customers: InMemoryCustomerRepository,
    private readonly pipelineData: InMemoryPipelineData = new InMemoryPipelineData(),
  ) {}

  async create(organizationId: string, data: CreateLeadData) {
    const now = new Date();
    const lead: Lead = {
      id: randomUUID(),
      organizationId,
      name: data.name,
      email: data.email ?? null,
      phone: data.phone ?? null,
      company: data.company ?? null,
      source: data.source ?? null,
      status: "NEW",
      assignedToUserId: null,
      notes: data.notes ?? null,
      convertedAt: null,
      convertedCustomerId: null,
      pipelineStageId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.leads.push(lead);
    return { ...lead };
  }

  async findById(organizationId: string, leadId: string) {
    const row = this.leads.find((l) => l.id === leadId && l.organizationId === organizationId);
    return row ? { ...row } : null;
  }

  async update(organizationId: string, leadId: string, data: UpdateLeadData) {
    const row = this.leads.find((l) => l.id === leadId && l.organizationId === organizationId);
    if (!row || row.status === "CONVERTED") return null;
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) (row as unknown as Record<string, unknown>)[key] = value;
    }
    row.updatedAt = new Date();
    return { ...row };
  }

  async delete(organizationId: string, leadId: string) {
    const index = this.leads.findIndex((l) => l.id === leadId && l.organizationId === organizationId);
    if (index < 0) return false;
    this.leads.splice(index, 1);
    return true;
  }

  /** Mirrors the SQL: filters, a total order ending in id, then the page. */
  async list(organizationId: string, query: LeadListQuery): Promise<LeadPage> {
    const needle = query.search?.toLowerCase();
    const has = (value: string | null) => value?.toLowerCase().includes(needle!) ?? false;
    const matching = this.leads.filter(
      (l) =>
        l.organizationId === organizationId &&
        (!query.status || l.status === query.status) &&
        (!query.source || l.source === query.source) &&
        (!query.assignedToUserId || l.assignedToUserId === query.assignedToUserId) &&
        (!query.createdFrom || l.createdAt >= query.createdFrom) &&
        (!query.createdTo || l.createdAt <= query.createdTo) &&
        (!needle || has(l.name) || has(l.email) || has(l.phone) || has(l.company)),
    );

    const dir = query.sortOrder === "asc" ? 1 : -1;
    const key = (l: Lead) => {
      const value = l[query.sortBy];
      return value instanceof Date ? value.getTime() : value;
    };
    matching.sort((a, b) => {
      const [x, y] = [key(a), key(b)];
      if (x !== y) {
        if (x === null) return 1; // empty values last, like nulls: "last"
        if (y === null) return -1;
        return (x < y ? -1 : 1) * dir;
      }
      return (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) * dir;
    });

    const start = (query.page - 1) * query.limit;
    return {
      items: matching.slice(start, start + query.limit).map((l) => ({ ...l })),
      totalItems: matching.length,
    };
  }

  /** Mirrors the SQL: the stage is reached through its pipeline's organization, and a converted lead is refused. */
  async moveToStage(organizationId: string, leadId: string, stageId: string) {
    const stage = this.pipelineData.stages.find((s) => s.id === stageId);
    const pipeline = stage && this.pipelineData.pipelines.find((p) => p.id === stage.pipelineId);
    if (!stage || pipeline?.organizationId !== organizationId) return null;

    const row = this.leads.find((l) => l.id === leadId && l.organizationId === organizationId);
    if (!row || row.status === "CONVERTED") return null;
    row.pipelineStageId = stage.id;
    row.updatedAt = new Date();
    return { ...row };
  }

  async convert(organizationId: string, leadId: string): Promise<ConvertedLead | null> {
    const row = this.leads.find((l) => l.id === leadId && l.organizationId === organizationId);
    if (!row) return null;
    if (row.status === "CONVERTED") throw new AppError(ErrorCode.LEAD_ALREADY_CONVERTED);

    const customer = await this.customers.create(organizationId, {
      name: row.name,
      email: row.email ?? undefined,
      phone: row.phone ?? undefined,
      company: row.company ?? undefined,
      notes: row.notes ?? undefined,
    });
    row.status = "CONVERTED";
    row.convertedAt = new Date();
    row.convertedCustomerId = customer.id;
    row.updatedAt = new Date();
    return { lead: { ...row }, customer };
  }
}


/** The pipeline and stage fakes share one store, as the real tables do. */
export class InMemoryPipelineData {
  pipelines: Pipeline[] = [];
  stages: PipelineStage[] = [];

  stagesOf(pipelineId: string): PipelineStage[] {
    return this.stages
      .filter((s) => s.pipelineId === pipelineId)
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ ...s }));
  }

  /** The pipeline, only if it belongs to the organization. */
  pipelineIn(organizationId: string, pipelineId: string) {
    return this.pipelines.find((p) => p.id === pipelineId && p.organizationId === organizationId);
  }
}

/** Like the Prisma repository: scoped to one organization, with the same refusals as the SQL constraints. */
export class InMemoryPipelineRepository implements PipelineRepository {
  constructor(
    private readonly data: InMemoryPipelineData,
    private readonly leads: InMemoryLeadRepository,
  ) {}

  private view(pipeline: Pipeline): PipelineWithStages {
    return { ...pipeline, stages: this.data.stagesOf(pipeline.id) };
  }

  private nameTaken(organizationId: string, name: string, exceptId?: string) {
    return this.data.pipelines.some(
      (p) => p.organizationId === organizationId && p.name === name && p.id !== exceptId,
    );
  }

  async create(organizationId: string, input: CreatePipelineData) {
    if (this.nameTaken(organizationId, input.name)) throw new AppError(ErrorCode.PIPELINE_ALREADY_EXISTS);
    const now = new Date();
    const pipeline: Pipeline = {
      id: randomUUID(),
      organizationId,
      name: input.name,
      description: input.description ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.data.pipelines.push(pipeline);
    return this.view(pipeline);
  }

  async findById(organizationId: string, pipelineId: string) {
    const pipeline = this.data.pipelineIn(organizationId, pipelineId);
    return pipeline ? this.view(pipeline) : null;
  }

  async findMany(organizationId: string) {
    return this.data.pipelines.filter((p) => p.organizationId === organizationId).map((p) => this.view(p));
  }

  async update(organizationId: string, pipelineId: string, input: UpdatePipelineData) {
    const pipeline = this.data.pipelineIn(organizationId, pipelineId);
    if (!pipeline) return null;
    if (input.name !== undefined && this.nameTaken(organizationId, input.name, pipelineId)) {
      throw new AppError(ErrorCode.PIPELINE_ALREADY_EXISTS);
    }
    if (input.name !== undefined) pipeline.name = input.name;
    if (input.description !== undefined) pipeline.description = input.description;
    pipeline.updatedAt = new Date();
    return this.view(pipeline);
  }

  async delete(organizationId: string, pipelineId: string) {
    const pipeline = this.data.pipelineIn(organizationId, pipelineId);
    if (!pipeline) return false;
    if (this.data.stagesOf(pipelineId).length > 0) throw new AppError(ErrorCode.PIPELINE_NOT_EMPTY);
    this.data.pipelines.splice(this.data.pipelines.indexOf(pipeline), 1);
    return true;
  }

  async getSummary(organizationId: string, pipelineId: string): Promise<PipelineSummary | null> {
    const pipeline = this.data.pipelineIn(organizationId, pipelineId);
    if (!pipeline) return null;
    const stages = this.data.stagesOf(pipelineId).map((s) => ({
      id: s.id,
      name: s.name,
      position: s.position,
      leadCount: this.leads.leads.filter((l) => l.pipelineStageId === s.id && l.organizationId === organizationId)
        .length,
    }));
    return {
      pipeline: { id: pipeline.id, name: pipeline.name },
      stages,
      totalLeads: stages.reduce((total, s) => total + s.leadCount, 0),
    };
  }
}

export class InMemoryPipelineStageRepository implements PipelineStageRepository {
  constructor(
    private readonly data: InMemoryPipelineData,
    private readonly leads: InMemoryLeadRepository,
  ) {}

  private nameTaken(pipelineId: string, name: string, exceptId?: string) {
    return this.data.stages.some((s) => s.pipelineId === pipelineId && s.name === name && s.id !== exceptId);
  }

  async create(organizationId: string, pipelineId: string, input: CreatePipelineStageData) {
    if (!this.data.pipelineIn(organizationId, pipelineId)) return null;
    if (this.nameTaken(pipelineId, input.name)) throw new AppError(ErrorCode.PIPELINE_STAGE_ALREADY_EXISTS);
    const existing = this.data.stagesOf(pipelineId);
    const now = new Date();
    const stage: PipelineStage = {
      id: randomUUID(),
      pipelineId,
      name: input.name,
      position: existing.length === 0 ? 0 : existing[existing.length - 1].position + 1,
      createdAt: now,
      updatedAt: now,
    };
    this.data.stages.push(stage);
    return { ...stage };
  }

  async findById(organizationId: string, stageId: string) {
    const stage = this.data.stages.find((s) => s.id === stageId);
    return stage && this.data.pipelineIn(organizationId, stage.pipelineId) ? { ...stage } : null;
  }

  private inPipeline(organizationId: string, pipelineId: string, stageId: string) {
    if (!this.data.pipelineIn(organizationId, pipelineId)) return undefined;
    return this.data.stages.find((s) => s.id === stageId && s.pipelineId === pipelineId);
  }

  async update(organizationId: string, pipelineId: string, stageId: string, input: UpdatePipelineStageData) {
    const stage = this.inPipeline(organizationId, pipelineId, stageId);
    if (!stage) return null;
    if (this.nameTaken(pipelineId, input.name, stageId)) throw new AppError(ErrorCode.PIPELINE_STAGE_ALREADY_EXISTS);
    stage.name = input.name;
    stage.updatedAt = new Date();
    return { ...stage };
  }

  async delete(organizationId: string, pipelineId: string, stageId: string) {
    const stage = this.inPipeline(organizationId, pipelineId, stageId);
    if (!stage) return false;
    if (this.leads.leads.some((l) => l.pipelineStageId === stageId)) throw new AppError(ErrorCode.PIPELINE_STAGE_IN_USE);

    this.data.stages.splice(this.data.stages.indexOf(stage), 1);
    for (const later of this.data.stages) {
      if (later.pipelineId === pipelineId && later.position > stage.position) later.position -= 1;
    }
    return true;
  }

  async reorder(organizationId: string, pipelineId: string, stageIds: string[]) {
    if (!this.data.pipelineIn(organizationId, pipelineId)) return false;
    const current = this.data.stagesOf(pipelineId);
    const submitted = new Set(stageIds);
    const isExactPermutation =
      submitted.size === stageIds.length &&
      stageIds.length === current.length &&
      current.every((s) => submitted.has(s.id));
    if (!isExactPermutation) throw new AppError(ErrorCode.INVALID_STAGE_ORDER);

    for (const [position, id] of stageIds.entries()) {
      this.data.stages.find((s) => s.id === id)!.position = position;
    }
    return true;
  }
}
