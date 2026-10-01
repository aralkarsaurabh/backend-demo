import jwt from "jsonwebtoken";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { JwtTokenService } from "../../src/infrastructure/authentication/JwtTokenService";
import { TEST_SECRETS } from "../helpers/fakes";
import {
  PASSWORD,
  bearer,
  buildIntegrationApp,
  login,
  register,
  resetDatabase,
  signUp,
} from "../helpers/integration";

const ctx = buildIntegrationApp();
const { api, prisma } = ctx;

beforeEach(() => resetDatabase(prisma));
afterAll(() => prisma.$disconnect());

function expectEnvelope(body: any, success: boolean) {
  expect(Object.keys(body).sort()).toEqual(["data", "error", "message", "meta", "success"]);
  expect(body.success).toBe(success);
  expect(typeof body.message).toBe("string");
  expect(new Date(body.meta.timestamp).toISOString()).toBe(body.meta.timestamp);
  if (success) expect(body.error).toBeNull();
  else {
    expect(body.data).toBeNull();
    expect(Object.keys(body.error).sort()).toEqual(["code", "details"]);
  }
}

describe("POST /api/v1/auth/register", () => {
  it("creates a USER and returns the standard envelope without tokens or password data", async () => {
    const res = await register(ctx);

    expect(res.status).toBe(201);
    expectEnvelope(res.body, true);
    expect(res.body.message).toBe("Account created successfully.");
    expect(res.body.data.user).toEqual({
      id: expect.any(String),
      name: "Asha",
      email: "asha@example.com",
      role: "USER",
    });
    expect(res.body.data.tokens).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
  });

  it("stores a bcrypt hash, never the plain password", async () => {
    await register(ctx);
    const row = await prisma.user.findUniqueOrThrow({ where: { email: "asha@example.com" } });
    expect(row.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(row.passwordHash).not.toContain(PASSWORD);
  });

  it("trims and lowercases the email, and trims the name", async () => {
    const res = await api
      .post("/api/v1/auth/register")
      .send({ name: "  Asha  ", email: "  ASHA@Example.COM ", password: PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ name: "Asha", email: "asha@example.com" });
  });

  it("ignores a client-supplied role (no mass assignment)", async () => {
    const res = await api
      .post("/api/v1/auth/register")
      .send({ name: "Eve", email: "eve@example.com", password: PASSWORD, role: "ADMIN" });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe("USER");
    expect((await prisma.user.findUniqueOrThrow({ where: { email: "eve@example.com" } })).role).toBe("USER");
  });

  it("rejects bad input with VALIDATION_ERROR and a per-field details map", async () => {
    const res = await api.post("/api/v1/auth/register").send({ email: "nope", password: "short" });

    expect(res.status).toBe(400);
    expectEnvelope(res.body, false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details).toEqual({
      name: "Name is required.",
      email: "Please provide a valid email address.",
      password: "Password must contain at least 8 characters.",
    });
    expect(await prisma.user.count()).toBe(0);
  });

  it.each([
    ["password of 7 chars", { password: "1234567" }],
    ["password of 73 chars", { password: "x".repeat(73) }],
    ["name of 101 chars", { name: "n".repeat(101) }],
    ["blank name", { name: "   " }],
    ["email over 254 chars", { email: `${"a".repeat(250)}@x.com` }],
  ])("rejects %s", async (_label, override) => {
    const res = await api
      .post("/api/v1/auth/register")
      .send({ name: "Asha", email: "asha@example.com", password: PASSWORD, ...override });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("accepts boundary passwords of exactly 8 and 72 characters", async () => {
    expect((await register(ctx, "a@example.com", "12345678")).status).toBe(201);
    expect((await register(ctx, "b@example.com", "x".repeat(72))).status).toBe(201);
  });

  it("rejects an empty body with field errors, not a crash", async () => {
    const res = await api.post("/api/v1/auth/register");
    expect(res.status).toBe(400);
    expect(res.body.error.details).toMatchObject({ name: expect.any(String), email: expect.any(String) });
  });

  it("rejects malformed JSON with VALIDATION_ERROR", async () => {
    const res = await api
      .post("/api/v1/auth/register")
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      code: "VALIDATION_ERROR",
      details: { body: "Request body must be valid JSON." },
    });
  });

  it("rejects an oversized body", async () => {
    const res = await api
      .post("/api/v1/auth/register")
      .send({ name: "x".repeat(20_000), email: "a@example.com", password: PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.error.details.body).toBe("Request body is too large.");
  });

  it("returns 409 EMAIL_ALREADY_EXISTS for a taken email, case-insensitively", async () => {
    await register(ctx, "asha@example.com");
    const res = await register(ctx, "ASHA@EXAMPLE.COM");
    expect(res.status).toBe(409);
    expectEnvelope(res.body, false);
    expect(res.body.error.code).toBe("EMAIL_ALREADY_EXISTS");
    expect(await prisma.user.count()).toBe(1);
  });

  it("lets the database unique constraint decide when two registrations race: one 201, one 409", async () => {
    const results = await Promise.all([register(ctx, "race@example.com"), register(ctx, "race@example.com")]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.user.count()).toBe(1);
  });
});

describe("POST /api/v1/auth/login", () => {
  it("returns the user and a Bearer token pair with the right shape", async () => {
    await register(ctx);
    const res = await login(ctx);

    expect(res.status).toBe(200);
    expectEnvelope(res.body, true);
    expect(res.body.message).toBe("Login successful.");
    expect(res.body.data.user).toMatchObject({ email: "asha@example.com", role: "USER" });
    expect(res.body.data.tokens).toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      tokenType: "Bearer",
      expiresIn: 900,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
  });

  it("issues tokens with exactly the contract's claims", async () => {
    await register(ctx);
    const { accessToken, refreshToken } = (await login(ctx)).body.data.tokens;
    const access = jwt.decode(accessToken) as Record<string, unknown>;
    const refresh = jwt.decode(refreshToken) as Record<string, unknown>;

    expect(Object.keys(access).sort()).toEqual(["exp", "iat", "nbf", "role", "sub", "type"]);
    expect(access.type).toBe("access");
    expect((access.exp as number) - (access.iat as number)).toBe(15 * 60);
    expect(Object.keys(refresh).sort()).toEqual(["exp", "iat", "jti", "nbf", "sub", "type"]);
    expect(refresh.type).toBe("refresh");
    expect((refresh.exp as number) - (refresh.iat as number)).toBe(30 * 24 * 60 * 60);
  });

  it("stores only a hash of the refresh token, keyed by its jti", async () => {
    await register(ctx);
    const { refreshToken } = (await login(ctx)).body.data.tokens;
    const jti = (jwt.decode(refreshToken) as { jti: string }).jti;

    const row = await prisma.refreshToken.findUniqueOrThrow({ where: { id: jti } });
    expect(row.tokenHash).toBe(ctx.tokens.hashToken(refreshToken));
    expect(row.tokenHash).not.toBe(refreshToken);
    expect(row.revokedAt).toBeNull();
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 3600 * 1000);
  });

  it("gives an identical response for a wrong password and an unknown email", async () => {
    await register(ctx);
    const wrongPassword = await login(ctx, "asha@example.com", "WrongPass999!");
    const unknownEmail = await login(ctx, "nobody@example.com", "WrongPass999!");

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(wrongPassword.status);
    expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
    expect(unknownEmail.body.error).toEqual(wrongPassword.body.error);
    expect(wrongPassword.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("matches the email case-insensitively and issues nothing on failure", async () => {
    await register(ctx);
    expect((await login(ctx, "  ASHA@example.com  ")).status).toBe(200);
    const before = await prisma.refreshToken.count();
    await login(ctx, "asha@example.com", "WrongPass999!");
    expect(await prisma.refreshToken.count()).toBe(before);
  });

  it("validates input", async () => {
    const res = await api.post("/api/v1/auth/login").send({ email: "nope" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(res.body.error.details).sort()).toEqual(["email", "password"]);
  });

  it("gives every login its own token family", async () => {
    await register(ctx);
    await login(ctx);
    await login(ctx);
    const families = new Set((await prisma.refreshToken.findMany()).map((r) => r.familyId));
    expect(families.size).toBe(2);
  });
});

describe("GET /api/v1/users/me and access-token handling", () => {
  it("returns the current user", async () => {
    const { accessToken, user } = await signUp(ctx);
    const res = await api.get("/api/v1/users/me").set(bearer(accessToken));

    expect(res.status).toBe(200);
    expectEnvelope(res.body, true);
    expect(res.body.data.user).toEqual({
      id: user.id,
      name: "Asha",
      email: "asha@example.com",
      role: "USER",
      status: "ACTIVE",
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it("requires a Bearer token: none, wrong scheme and empty all give UNAUTHORIZED", async () => {
    const { accessToken } = await signUp(ctx);
    for (const header of [undefined, `Basic ${accessToken}`, "Bearer", "Bearer   ", accessToken]) {
      const req = api.get("/api/v1/users/me");
      const res = await (header === undefined ? req : req.set("Authorization", header));
      expect(res.status, String(header)).toBe(401);
      expect(res.body.error.code, String(header)).toBe("UNAUTHORIZED");
      expectEnvelope(res.body, false);
    }
  });

  it("rejects a refresh token used as an access token", async () => {
    const { refreshToken } = await signUp(ctx);
    const res = await api.get("/api/v1/users/me").set(bearer(refreshToken));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_ACCESS_TOKEN");
  });

  it("rejects garbage, a tampered signature and a token signed with the wrong secret", async () => {
    const { accessToken, user } = await signUp(ctx);
    const wrongSecret = new JwtTokenService({ access: "z".repeat(40), refresh: "y".repeat(40) })
      .generateAccessToken({ sub: user.id, role: "USER" }).token;
    const tampered = `${accessToken.slice(0, -3)}abc`;

    for (const token of ["garbage", tampered, wrongSecret]) {
      const res = await api.get("/api/v1/users/me").set(bearer(token));
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("INVALID_ACCESS_TOKEN");
    }
  });

  it("rejects an unsigned (alg: none) token claiming ADMIN", async () => {
    const { user } = await signUp(ctx);
    const forged = jwt.sign({ sub: user.id, role: "ADMIN", type: "access" }, "", {
      algorithm: "none" as jwt.Algorithm,
    });
    const res = await api.get("/api/v1/admin/users").set(bearer(forged));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_ACCESS_TOKEN");
  });

  it("rejects a correctly signed token carrying an unknown role", async () => {
    const { user } = await signUp(ctx);
    const forged = jwt.sign({ sub: user.id, role: "SUPERUSER", type: "access" }, TEST_SECRETS.access, {
      algorithm: "HS256",
    });
    const res = await api.get("/api/v1/users/me").set(bearer(forged));
    expect(res.body.error.code).toBe("INVALID_ACCESS_TOKEN");
  });

  it("returns ACCESS_TOKEN_EXPIRED for an expired token so clients know to refresh", async () => {
    const { user } = await signUp(ctx);
    const expired = new JwtTokenService(TEST_SECRETS, { access: -10, refresh: 60 })
      .generateAccessToken({ sub: user.id, role: "USER" }).token;
    const res = await api.get("/api/v1/users/me").set(bearer(expired));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("ACCESS_TOKEN_EXPIRED");
  });

  it("returns USER_NOT_FOUND when the account was deleted but the token is still valid", async () => {
    const { accessToken, user } = await signUp(ctx);
    await prisma.user.delete({ where: { id: user.id } });
    const res = await api.get("/api/v1/users/me").set(bearer(accessToken));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("USER_NOT_FOUND");
  });
});

describe("role-based authorization: GET /api/v1/admin/users", () => {
  async function adminToken() {
    const admin = await signUp(ctx, "root@example.com");
    await prisma.user.update({ where: { id: admin.user.id }, data: { role: "ADMIN" } });
    const res = await login(ctx, "root@example.com");
    return res.body.data.tokens.accessToken as string;
  }

  it("is 401 without a token and 403 for a USER", async () => {
    const noToken = await api.get("/api/v1/admin/users");
    expect(noToken.status).toBe(401);
    expect(noToken.body.error.code).toBe("UNAUTHORIZED");

    const { accessToken } = await signUp(ctx);
    const asUser = await api.get("/api/v1/admin/users").set(bearer(accessToken));
    expect(asUser.status).toBe(403);
    expectEnvelope(asUser.body, false);
    expect(asUser.body.error.code).toBe("FORBIDDEN");
  });

  it("lets an ADMIN list users, with createdAt and no password data", async () => {
    await signUp(ctx, "someone@example.com");
    const token = await adminToken();
    const res = await api.get("/api/v1/admin/users").set(bearer(token));

    expect(res.status).toBe(200);
    expectEnvelope(res.body, true);
    expect(res.body.data.users.map((u: any) => u.email).sort()).toEqual(["root@example.com", "someone@example.com"]);
    expect(res.body.data.users[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
  });

  it("trusts the role in the token (design choice D1): a promotion applies only after re-login or refresh", async () => {
    const { accessToken, refreshToken, user } = await signUp(ctx);
    await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });

    // old token still says USER
    expect((await api.get("/api/v1/admin/users").set(bearer(accessToken))).status).toBe(403);
    // but /users/me reads the database
    expect((await api.get("/api/v1/users/me").set(bearer(accessToken))).body.data.user.role).toBe("ADMIN");

    // a refresh picks up the new role
    const refreshed = await api.post("/api/v1/auth/refresh").set(bearer(refreshToken));
    const fresh = refreshed.body.data.tokens.accessToken;
    expect((await api.get("/api/v1/admin/users").set(bearer(fresh))).status).toBe(200);
  });
});

describe("cross-cutting HTTP behaviour", () => {
  it("returns the standard envelope for unknown routes", async () => {
    const res = await api.get("/api/v1/does-not-exist");
    expect(res.status).toBe(404);
    expectEnvelope(res.body, false);
    expect(res.body.error.code).toBe("ROUTE_NOT_FOUND");
  });

  it("marks API responses no-store and does not advertise Express", async () => {
    const res = await register(ctx);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});
