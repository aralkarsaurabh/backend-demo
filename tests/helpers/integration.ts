import { Express } from "express";
import request from "supertest";
import { createApp } from "../../src/app/app";
import { buildContainer } from "../../src/app/container";
import { BcryptPasswordService } from "../../src/infrastructure/authentication/BcryptPasswordService";
import { JwtTokenService } from "../../src/infrastructure/authentication/JwtTokenService";
import { createPrismaClient } from "../../src/infrastructure/database/prisma";
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
    passwords: new BcryptPasswordService(4),
    tokens,
  });
  const app: Express = createApp(container, silentLogger);
  return { app, prisma, tokens, api: request(app) };
}

export type IntegrationApp = ReturnType<typeof buildIntegrationApp>;

export async function resetDatabase(prisma: IntegrationApp["prisma"]) {
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
