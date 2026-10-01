import jwt from "jsonwebtoken";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { JwtTokenService } from "../../src/infrastructure/authentication/JwtTokenService";
import { TEST_SECRETS } from "../helpers/fakes";
import { bearer, buildIntegrationApp, login, resetDatabase, signUp } from "../helpers/integration";

const ctx = buildIntegrationApp();
const { api, prisma } = ctx;

beforeEach(() => resetDatabase(prisma));
afterAll(() => prisma.$disconnect());

const refresh = (token: string) => api.post("/api/v1/auth/refresh").set(bearer(token));
const logout = (token: string) => api.post("/api/v1/auth/logout").set(bearer(token));
const jtiOf = (token: string) => (jwt.decode(token) as { jti: string }).jti;

describe("POST /api/v1/auth/refresh: rotation", () => {
  it("returns a new pair, revokes and links the old token, and keeps the family", async () => {
    const { refreshToken: first } = await signUp(ctx);
    const res = await refresh(first);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Token refreshed.");
    expect(res.body.data.tokens).toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      tokenType: "Bearer",
      expiresIn: 900,
    });
    const second = res.body.data.tokens.refreshToken;
    expect(second).not.toBe(first);

    const oldRow = await prisma.refreshToken.findUniqueOrThrow({ where: { id: jtiOf(first) } });
    const newRow = await prisma.refreshToken.findUniqueOrThrow({ where: { id: jtiOf(second) } });
    expect(oldRow.revokedAt).not.toBeNull();
    expect(oldRow.replacedBy).toBe(newRow.id);
    expect(newRow.revokedAt).toBeNull();
    expect(newRow.familyId).toBe(oldRow.familyId);
    expect(newRow.tokenHash).toBe(ctx.tokens.hashToken(second));
  });

  it("works repeatedly, even back to back: each new token is unique and works once", async () => {
    let { refreshToken } = await signUp(ctx);
    const seen = new Set([refreshToken]);
    for (let i = 0; i < 4; i++) {
      const res = await refresh(refreshToken);
      expect(res.status).toBe(200);
      refreshToken = res.body.data.tokens.refreshToken;
      expect(seen.has(refreshToken)).toBe(false);
      seen.add(refreshToken);
    }
    const rows = await prisma.refreshToken.findMany();
    expect(rows).toHaveLength(5);
    expect(rows.filter((r) => !r.revokedAt)).toHaveLength(1);
    expect(new Set(rows.map((r) => r.familyId)).size).toBe(1);
  });

  it("requires a Bearer refresh token in the Authorization header", async () => {
    for (const header of [undefined, "Basic abc", "Bearer"]) {
      const req = api.post("/api/v1/auth/refresh");
      const res = await (header === undefined ? req : req.set("Authorization", header));
      expect(res.status, String(header)).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.details.authorization).toBeDefined();
    }
  });

  it("rejects an access token, garbage, and a validly signed token with no database row", async () => {
    const { accessToken, user } = await signUp(ctx);
    const orphan = ctx.tokens.generateRefreshToken({ sub: user.id, jti: "00000000-0000-4000-8000-000000000000" });

    for (const token of [accessToken, "garbage", orphan.token]) {
      const res = await refresh(token);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("INVALID_REFRESH_TOKEN");
    }
  });

  it("rejects an expired refresh token and one signed with the wrong secret", async () => {
    const { user } = await signUp(ctx);
    const expired = new JwtTokenService(TEST_SECRETS, { access: 900, refresh: -10 }).generateRefreshToken({
      sub: user.id,
      jti: "11111111-1111-4111-8111-111111111111",
    });
    const res = await refresh(expired.token);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("REFRESH_TOKEN_EXPIRED");

    const wrongSecret = new JwtTokenService({ access: "a".repeat(40), refresh: "q".repeat(40) })
      .generateRefreshToken({ sub: user.id, jti: "22222222-2222-4222-8222-222222222222" });
    expect((await refresh(wrongSecret.token)).body.error.code).toBe("INVALID_REFRESH_TOKEN");
  });

  it("rejects a token whose hash does not match the stored row", async () => {
    const { refreshToken, user } = await signUp(ctx);
    const lookalike = new JwtTokenService(TEST_SECRETS, { access: 900, refresh: 1234 }).generateRefreshToken({
      sub: user.id,
      jti: jtiOf(refreshToken),
    });
    expect(lookalike.token).not.toBe(refreshToken);
    expect((await refresh(lookalike.token)).body.error.code).toBe("INVALID_REFRESH_TOKEN");
    // the genuine token is unaffected
    expect((await refresh(refreshToken)).status).toBe(200);
  });

  it("returns INVALID_REFRESH_TOKEN when the user has been deleted", async () => {
    const { refreshToken, user } = await signUp(ctx);
    await prisma.user.delete({ where: { id: user.id } });
    const res = await refresh(refreshToken);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_REFRESH_TOKEN");
  });
});

describe("POST /api/v1/auth/refresh: reuse detection", () => {
  it("replaying a rotated token returns REFRESH_TOKEN_REUSED and revokes the whole family", async () => {
    const { refreshToken: a } = await signUp(ctx);
    const b = (await refresh(a)).body.data.tokens.refreshToken;

    const replay = await refresh(a);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe("REFRESH_TOKEN_REUSED");

    // B was never used, but its family is now dead
    const afterwards = await refresh(b);
    expect(afterwards.status).toBe(401);
    expect(afterwards.body.error.code).toBe("REFRESH_TOKEN_REVOKED");
    expect((await prisma.refreshToken.findMany()).every((r) => r.revokedAt)).toBe(true);
  });

  it("leaves other devices' families alone", async () => {
    const { refreshToken: phoneA } = await signUp(ctx);
    const laptop = (await login(ctx)).body.data.tokens.refreshToken;

    await refresh(phoneA);
    await refresh(phoneA); // reuse on the phone family

    expect((await refresh(laptop)).status).toBe(200);
  });

  it("lets exactly one of two simultaneous refreshes win; the loser is REFRESH_TOKEN_REUSED and the family dies", async () => {
    const { refreshToken } = await signUp(ctx);
    const results = await Promise.all([refresh(refreshToken), refresh(refreshToken)]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    const loser = results.find((r) => r.status === 401)!;
    expect(loser.body.error.code).toBe("REFRESH_TOKEN_REUSED");

    const rows = await prisma.refreshToken.findMany();
    expect(rows).toHaveLength(2); // the loser inserted nothing
    expect(rows.every((r) => r.revokedAt)).toBe(true);
  });

  it("gives the refreshed access token the user's current role", async () => {
    const { refreshToken, user } = await signUp(ctx);
    await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
    const res = await refresh(refreshToken);
    expect((jwt.decode(res.body.data.tokens.accessToken) as { role: string }).role).toBe("ADMIN");
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("revokes the whole family, so even a newer rotated token stops working", async () => {
    const { refreshToken: a } = await signUp(ctx);
    const b = (await refresh(a)).body.data.tokens.refreshToken;

    const res = await logout(b);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      message: "You have been logged out successfully.",
      data: null,
      error: null,
    });

    const afterwards = await refresh(b);
    expect(afterwards.status).toBe(401);
    expect(afterwards.body.error.code).toBe("REFRESH_TOKEN_REVOKED"); // revoked, not "reused"
    expect((await prisma.refreshToken.findMany()).every((r) => r.revokedAt)).toBe(true);
  });

  it("is idempotent and never reveals whether a token was real", async () => {
    const { refreshToken, accessToken } = await signUp(ctx);
    expect((await logout(refreshToken)).status).toBe(200);
    expect((await logout(refreshToken)).status).toBe(200);
    for (const token of ["garbage", accessToken]) {
      expect((await logout(token)).status).toBe(200);
    }
  });

  it("requires the Authorization header", async () => {
    const res = await api.post("/api/v1/auth/logout");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("only ends the session it was called for", async () => {
    const { refreshToken: phone } = await signUp(ctx);
    const laptop = (await login(ctx)).body.data.tokens.refreshToken;

    await logout(phone);

    expect((await refresh(phone)).body.error.code).toBe("REFRESH_TOKEN_REVOKED");
    expect((await refresh(laptop)).status).toBe(200);
  });

  it("does not kill an access token that was already issued (design choice D1)", async () => {
    const { accessToken, refreshToken } = await signUp(ctx);
    await logout(refreshToken);
    expect((await api.get("/api/v1/users/me").set(bearer(accessToken))).status).toBe(200);
  });
});
