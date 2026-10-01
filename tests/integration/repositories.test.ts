import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NewRefreshToken } from "../../src/domain/repositories/RefreshTokenRepository";
import { createPrismaClient } from "../../src/infrastructure/database/prisma";
import { PrismaRefreshTokenRepository } from "../../src/infrastructure/database/repositories/PrismaRefreshTokenRepository";
import { PrismaUserRepository } from "../../src/infrastructure/database/repositories/PrismaUserRepository";
import { AppError } from "../../src/shared/errors/AppError";
import { resetDatabase } from "../helpers/integration";

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const users = new PrismaUserRepository(prisma);
const tokens = new PrismaRefreshTokenRepository(prisma);

beforeEach(() => resetDatabase(prisma));
afterAll(() => prisma.$disconnect());

const newUser = (email = "asha@example.com") =>
  users.create({ name: "Asha", email, passwordHash: "hash" });

const newToken = (userId: string, familyId: string = randomUUID()): NewRefreshToken => ({
  id: randomUUID(),
  userId,
  familyId,
  tokenHash: randomUUID(),
  expiresAt: new Date(Date.now() + 60_000),
});

describe("PrismaUserRepository", () => {
  it("creates users with role USER by default and finds them by id and email", async () => {
    const user = await newUser();
    expect(user.role).toBe("USER");
    expect((await users.findById(user.id))?.email).toBe("asha@example.com");
    expect((await users.findByEmail("asha@example.com"))?.id).toBe(user.id);
    expect(await users.findByEmail("nobody@example.com")).toBeNull();
    expect(await users.findById(randomUUID())).toBeNull();
  });

  it("maps a duplicate email to EMAIL_ALREADY_EXISTS and rethrows anything else", async () => {
    await newUser();
    const error = await newUser().catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("EMAIL_ALREADY_EXISTS");

    await expect(
      users.create({ name: "x", email: "y@example.com", passwordHash: "h", role: "NOPE" as never }),
    ).rejects.not.toBeInstanceOf(AppError);
  });

  it("lists users oldest first", async () => {
    await newUser("one@example.com");
    await newUser("two@example.com");
    expect((await users.findAll()).map((u) => u.email)).toEqual(["one@example.com", "two@example.com"]);
  });
});

describe("PrismaRefreshTokenRepository", () => {
  it("creates and finds a token with no revocation set", async () => {
    const user = await newUser();
    const data = newToken(user.id);
    await tokens.create(data);

    expect(await tokens.findById(data.id)).toMatchObject({
      id: data.id,
      familyId: data.familyId,
      tokenHash: data.tokenHash,
      revokedAt: null,
      replacedBy: null,
    });
    expect(await tokens.findById(randomUUID())).toBeNull();
  });

  it("rotate() revokes the old token, links it to the new one and inserts the new one", async () => {
    const user = await newUser();
    const current = newToken(user.id);
    await tokens.create(current);
    const next = newToken(user.id, current.familyId);

    expect(await tokens.rotate(current.id, next)).toBe(true);

    const oldRow = (await tokens.findById(current.id))!;
    expect(oldRow.revokedAt).not.toBeNull();
    expect(oldRow.replacedBy).toBe(next.id);
    expect((await tokens.findById(next.id))?.revokedAt).toBeNull();
  });

  it("rotate() on an already revoked token returns false and inserts nothing", async () => {
    const user = await newUser();
    const current = newToken(user.id);
    await tokens.create(current);
    await tokens.rotate(current.id, newToken(user.id, current.familyId));

    const late = newToken(user.id, current.familyId);
    expect(await tokens.rotate(current.id, late)).toBe(false);
    expect(await tokens.findById(late.id)).toBeNull();
  });

  it("rotate() on an unknown token returns false", async () => {
    const user = await newUser();
    expect(await tokens.rotate(randomUUID(), newToken(user.id))).toBe(false);
  });

  it("rotate() lets exactly one of many simultaneous callers win, and the losers insert nothing", async () => {
    const user = await newUser();
    const current = newToken(user.id);
    await tokens.create(current);

    const attempts = Array.from({ length: 6 }, () => newToken(user.id, current.familyId));
    const results = await Promise.all(attempts.map((next) => tokens.rotate(current.id, next)));

    expect(results.filter(Boolean)).toHaveLength(1);
    const rows = await prisma.refreshToken.findMany({ where: { familyId: current.familyId } });
    expect(rows).toHaveLength(2); // the original and the single winner's new token
    const winner = attempts[results.indexOf(true)];
    expect((await tokens.findById(current.id))?.replacedBy).toBe(winner.id);
  });

  it("rotate() is all or nothing: if inserting the new token fails, the old one stays valid", async () => {
    const user = await newUser();
    const current = newToken(user.id);
    await tokens.create(current);
    const clash = newToken(user.id, current.familyId);
    await tokens.create(clash);

    // same tokenHash as an existing row -> unique violation on insert
    const next = { ...newToken(user.id, current.familyId), tokenHash: clash.tokenHash };
    await expect(tokens.rotate(current.id, next)).rejects.toThrow();

    const row = (await tokens.findById(current.id))!;
    expect(row.revokedAt).toBeNull();
    expect(row.replacedBy).toBeNull();
  });

  it("revokeFamily() revokes every live token in that family only, and keeps earlier revocation times", async () => {
    const user = await newUser();
    const family: string = randomUUID();
    const other: string = randomUUID();
    const a = newToken(user.id, family);
    const b = newToken(user.id, family);
    const c = newToken(user.id, other);
    for (const t of [a, b, c]) await tokens.create(t);
    await tokens.rotate(a.id, newToken(user.id, family)); // a is already revoked
    const revokedAtBefore = (await tokens.findById(a.id))!.revokedAt!;

    await tokens.revokeFamily(family);

    const familyRows = await prisma.refreshToken.findMany({ where: { familyId: family } });
    expect(familyRows.every((r) => r.revokedAt)).toBe(true);
    expect((await tokens.findById(a.id))!.revokedAt).toEqual(revokedAtBefore);
    expect((await tokens.findById(c.id))?.revokedAt).toBeNull();
  });

  it("deleting a user deletes their refresh tokens (cascade)", async () => {
    const user = await newUser();
    await tokens.create(newToken(user.id));
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.refreshToken.count()).toBe(0);
  });
});
