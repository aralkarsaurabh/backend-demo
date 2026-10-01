import { Express } from "express";
import request from "supertest";
import { createApp } from "../../src/app/app";
import { buildContainer } from "../../src/app/container";
import { BcryptPasswordService } from "../../src/infrastructure/authentication/BcryptPasswordService";
import { JwtTokenService } from "../../src/infrastructure/authentication/JwtTokenService";
import { createPrismaClient } from "../../src/infrastructure/database/prisma";
import { PrismaCustomerRepository } from "../../src/infrastructure/database/repositories/PrismaCustomerRepository";
import { PrismaLeadRepository } from "../../src/infrastructure/database/repositories/PrismaLeadRepository";
import { PrismaPipelineRepository } from "../../src/infrastructure/database/repositories/PrismaPipelineRepository";
import { PrismaPipelineStageRepository } from "../../src/infrastructure/database/repositories/PrismaPipelineStageRepository";
import { PrismaTaskRepository } from "../../src/infrastructure/database/repositories/PrismaTaskRepository";
import { PrismaOrganizationInvitationRepository } from "../../src/infrastructure/database/repositories/PrismaOrganizationInvitationRepository";
import { PrismaOrganizationMembershipRepository } from "../../src/infrastructure/database/repositories/PrismaOrganizationMembershipRepository";
import { PrismaOrganizationRepository } from "../../src/infrastructure/database/repositories/PrismaOrganizationRepository";
import { PrismaRefreshTokenRepository } from "../../src/infrastructure/database/repositories/PrismaRefreshTokenRepository";
import { PrismaUserRepository } from "../../src/infrastructure/database/repositories/PrismaUserRepository";
import { silentLogger } from "../../src/shared/logger";
import { TEST_SECRETS } from "./fakes";

export const PASSWORD = "StrongPass123!";

/** The real app wired to the real (test) database. bcrypt cost 4 keeps tests fast. */
export function buildIntegrationApp() {
  const prisma = createPrismaClient(process.env.DATABASE_URL!);
  const tokens = new JwtTokenService(TEST_SECRETS);
  const container = buildContainer({
    users: new PrismaUserRepository(prisma),
    refreshTokens: new PrismaRefreshTokenRepository(prisma),
    organizations: new PrismaOrganizationRepository(prisma),
    organizationMemberships: new PrismaOrganizationMembershipRepository(prisma),
    organizationInvitations: new PrismaOrganizationInvitationRepository(prisma),
    customers: new PrismaCustomerRepository(prisma),
    leads: new PrismaLeadRepository(prisma),
    pipelines: new PrismaPipelineRepository(prisma),
    pipelineStages: new PrismaPipelineStageRepository(prisma),
    tasks: new PrismaTaskRepository(prisma),
    passwords: new BcryptPasswordService(4),
    tokens,
  });
  const app: Express = createApp(container, silentLogger);
  return { app, prisma, tokens, api: request(app) };
}

export type IntegrationApp = ReturnType<typeof buildIntegrationApp>;

export async function resetDatabase(prisma: IntegrationApp["prisma"]) {
  await prisma.task.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.pipelineStage.deleteMany();
  await prisma.pipeline.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.organizationInvitation.deleteMany();
  await prisma.organizationMembership.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.seedMigration.deleteMany();
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function register(
  ctx: IntegrationApp,
  email = "asha@example.com",
  password = PASSWORD,
) {
  return ctx.api.post("/api/v1/auth/register").send({ name: "Asha", email, password });
}

export async function login(ctx: IntegrationApp, email = "asha@example.com", password = PASSWORD) {
  return ctx.api.post("/api/v1/auth/login").send({ email, password });
}

/** Registers, logs in and returns the tokens and user. */
export async function signUp(ctx: IntegrationApp, email = "asha@example.com") {
  await register(ctx, email);
  const res = await login(ctx, email);
  return {
    user: res.body.data.user as { id: string; email: string; role: string },
    accessToken: res.body.data.tokens.accessToken as string,
    refreshToken: res.body.data.tokens.refreshToken as string,
  };
}

type SignedUp = Awaited<ReturnType<typeof signUp>>;

/** Creates an organization as `owner` and returns its id and slug. */
export async function createOrganization(
  ctx: IntegrationApp,
  owner: SignedUp,
  name = "Acme Technologies",
) {
  const res = await ctx.api
    .post("/api/v1/organizations")
    .set(bearer(owner.accessToken))
    .send({ name });
  return res.body.data.organization as { id: string; name: string; slug: string; role: string };
}

/** Invites `email` as `inviter` and returns the raw one-time token. */
export async function invite(
  ctx: IntegrationApp,
  inviter: SignedUp,
  organizationId: string,
  email: string,
  role: "ADMIN" | "MEMBER" = "MEMBER",
) {
  const res = await ctx.api
    .post(`/api/v1/organizations/${organizationId}/invitations`)
    .set(bearer(inviter.accessToken))
    .send({ email, role });
  return res.body.data.token as string;
}

/** Signs up `email`, invites them as `inviter`, and has them accept. */
export async function joinOrganization(
  ctx: IntegrationApp,
  inviter: SignedUp,
  organizationId: string,
  email: string,
  role: "ADMIN" | "MEMBER" = "MEMBER",
) {
  const member = await signUp(ctx, email);
  const token = await invite(ctx, inviter, organizationId, email, role);
  await ctx.api
    .post("/api/v1/organization-invitations/accept")
    .set(bearer(member.accessToken))
    .send({ token });
  return member;
}

type Org = Awaited<ReturnType<typeof createOrganization>>;

/** Creates a customer through the API as `actor` and returns it. */
export async function createCustomer(
  ctx: IntegrationApp,
  actor: SignedUp,
  org: Org,
  body: Record<string, unknown> = { name: "Acme Technologies" },
) {
  const res = await ctx.api
    .post(`/api/v1/organizations/${org.id}/customers`)
    .set(bearer(actor.accessToken))
    .send(body);
  return res.body.data.customer as {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
  };
}

/** Creates a lead through the API as `actor` and returns it. */
export async function createLead(
  ctx: IntegrationApp,
  actor: SignedUp,
  org: Org,
  body: Record<string, unknown> = { name: "Rahul Sharma" },
) {
  const res = await ctx.api
    .post(`/api/v1/organizations/${org.id}/leads`)
    .set(bearer(actor.accessToken))
    .send(body);
  return res.body.data.lead as {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    source: string | null;
    status: string;
    assignedToUserId: string | null;
    notes: string | null;
    convertedAt: string | null;
    convertedCustomerId: string | null;
    createdAt: string;
    updatedAt: string;
  };
}

/** Creates a task through the API as `actor` and returns it. */
export async function createTask(
  ctx: IntegrationApp,
  actor: SignedUp,
  org: Org,
  body: Record<string, unknown> = { title: "Follow up with Rahul" },
) {
  const res = await ctx.api
    .post(`/api/v1/organizations/${org.id}/tasks`)
    .set(bearer(actor.accessToken))
    .send(body);
  return res.body.data.task as {
    id: string;
    title: string;
    description: string | null;
    assignedToUserId: string | null;
    dueDate: string | null;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
}
