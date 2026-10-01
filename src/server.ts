import { createApp } from "./app/app";
import { buildContainer } from "./app/container";
import { loadEnv } from "./config/env";
import { BcryptPasswordService } from "./infrastructure/authentication/BcryptPasswordService";
import { JwtTokenService } from "./infrastructure/authentication/JwtTokenService";
import { createPrismaClient } from "./infrastructure/database/prisma";
import { PrismaCustomerRepository } from "./infrastructure/database/repositories/PrismaCustomerRepository";
import { PrismaOrganizationInvitationRepository } from "./infrastructure/database/repositories/PrismaOrganizationInvitationRepository";
import { PrismaOrganizationMembershipRepository } from "./infrastructure/database/repositories/PrismaOrganizationMembershipRepository";
import { PrismaOrganizationRepository } from "./infrastructure/database/repositories/PrismaOrganizationRepository";
import { PrismaRefreshTokenRepository } from "./infrastructure/database/repositories/PrismaRefreshTokenRepository";
import { PrismaUserRepository } from "./infrastructure/database/repositories/PrismaUserRepository";
import { consoleLogger } from "./shared/logger";

const env = loadEnv();
const prisma = createPrismaClient(env.DATABASE_URL);

const container = buildContainer({
  users: new PrismaUserRepository(prisma),
  refreshTokens: new PrismaRefreshTokenRepository(prisma),
  organizations: new PrismaOrganizationRepository(prisma),
  organizationMemberships: new PrismaOrganizationMembershipRepository(prisma),
  organizationInvitations: new PrismaOrganizationInvitationRepository(prisma),
  customers: new PrismaCustomerRepository(prisma),
  passwords: new BcryptPasswordService(),
  tokens: new JwtTokenService({
    access: env.JWT_ACCESS_SECRET,
    refresh: env.JWT_REFRESH_SECRET,
  }),
});

const server = createApp(container, consoleLogger).listen(env.PORT, () => {
  consoleLogger.info("server_started", { port: env.PORT });
});

function shutdown(signal: string) {
  consoleLogger.info("server_stopping", { signal });
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
