import type { Prisma } from "../../generated/prisma/client";
import { registerRequestSchema } from "../../src/application/dto/auth/RegisterRequest";
import { UserRole } from "../../src/domain/enums/UserRole";
import { BcryptPasswordService } from "../../src/infrastructure/authentication/BcryptPasswordService";
import { AppError } from "../../src/shared/errors/AppError";
import { parseOrThrow } from "../../src/shared/validation/parse";

/**
 * Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD. If a user with
 * that email already exists they are promoted to ADMIN and their password is
 * left alone. Seeds are never edited once created: change = new seed file.
 */
export async function up(tx: Prisma.TransactionClient): Promise<void> {
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must both be set.");
  }

  // Same rules as registration: normalised email, 8 to 72 character password.
  let admin;
  try {
    admin = parseOrThrow(registerRequestSchema, {
      name: "Administrator",
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
  } catch (error) {
    if (error instanceof AppError && error.details) {
      throw new Error(
        `ADMIN_EMAIL / ADMIN_PASSWORD are not valid: ${JSON.stringify(error.details)}`,
      );
    }
    throw error;
  }

  const existing = await tx.user.findUnique({ where: { email: admin.email } });
  if (existing) {
    if (existing.role !== UserRole.ADMIN) {
      await tx.user.update({ where: { id: existing.id }, data: { role: UserRole.ADMIN } });
    }
    return;
  }

  await tx.user.create({
    data: {
      name: admin.name,
      email: admin.email,
      passwordHash: await new BcryptPasswordService().hash(admin.password),
      role: UserRole.ADMIN,
    },
  });
}
