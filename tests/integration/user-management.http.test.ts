import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { bearer, buildIntegrationApp, login, PASSWORD, resetDatabase, signUp } from "../helpers/integration";

const ctx = buildIntegrationApp();
const { api, prisma } = ctx;

beforeEach(() => resetDatabase(prisma));
afterAll(() => prisma.$disconnect());

const refresh = (token: string) => api.post("/api/v1/auth/refresh").set(bearer(token));

/** Signs up a user, promotes them to platform ADMIN and logs in again so the token carries the role. */
async function signUpAdmin(email = "admin@example.com") {
  const first = await signUp(ctx, email);
  await prisma.user.update({ where: { id: first.user.id }, data: { role: "ADMIN" } });
  const res = await login(ctx, email);
  return { ...first, accessToken: res.body.data.tokens.accessToken as string };
}

const setStatus = (admin: { accessToken: string }, userId: string, body: unknown) =>
  api.patch(`/api/v1/users/${userId}/status`).set(bearer(admin.accessToken)).send(body as object);

describe("GET /api/v1/users/me", () => {
  it("returns status, createdAt and updatedAt", async () => {
    const { accessToken } = await signUp(ctx);
    const res = await api.get("/api/v1/users/me").set(bearer(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Profile retrieved successfully.");
    expect(res.body.data.user).toEqual({
      id: expect.any(String),
      name: "Asha",
      email: "asha@example.com",
      role: "USER",
      status: "ACTIVE",
      createdAt: expect.stringMatching(/^\d{4}-/),
      updatedAt: expect.stringMatching(/^\d{4}-/),
    });
  });
});

describe("PATCH /api/v1/users/me", () => {
  it("updates the name", async () => {
    const { accessToken } = await signUp(ctx);
    const res = await api.patch("/api/v1/users/me").set(bearer(accessToken)).send({ name: "  Asha Rao " });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Account updated successfully.");
    expect(res.body.data.user.name).toBe("Asha Rao");
  });

  it.each([
    [{ name: "x", role: "ADMIN" }],
    [{ name: "x", status: "ACTIVE" }],
    [{ name: "x", email: "new@example.com" }],
    [{}],
    [{ name: "   " }],
  ])("rejects %j with VALIDATION_ERROR and changes nothing", async (body) => {
    const { accessToken, user } = await signUp(ctx);
    const res = await api.patch("/api/v1/users/me").set(bearer(accessToken)).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row).toMatchObject({ name: "Asha", role: "USER", status: "ACTIVE", email: "asha@example.com" });
  });

  it("requires authentication", async () => {
    const res = await api.patch("/api/v1/users/me").send({ name: "x" });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/users/me/password", () => {
  it("changes the password, ends all sessions and allows login only with the new one", async () => {
    const a = await signUp(ctx);
    const secondLogin = await login(ctx);
    const res = await api
      .post("/api/v1/users/me/password")
      .set(bearer(a.accessToken))
      .send({ currentPassword: PASSWORD, newPassword: "BrandNewPass456!" });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
    expect((await refresh(a.refreshToken)).body.error.code).toBe("REFRESH_TOKEN_REVOKED");
    expect((await refresh(secondLogin.body.data.tokens.refreshToken)).body.error.code).toBe(
      "REFRESH_TOKEN_REVOKED",
    );
    expect((await login(ctx)).status).toBe(401);
    expect((await login(ctx, "asha@example.com", "BrandNewPass456!")).status).toBe(200);
  });

  it("rejects a wrong current password with INVALID_CURRENT_PASSWORD (400, not 401)", async () => {
    const a = await signUp(ctx);
    const res = await api
      .post("/api/v1/users/me/password")
      .set(bearer(a.accessToken))
      .send({ currentPassword: "WrongPass123!", newPassword: "BrandNewPass456!" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_CURRENT_PASSWORD");
    expect((await refresh(a.refreshToken)).status).toBe(200);
  });

  it.each([
    [{ newPassword: "BrandNewPass456!" }],
    [{ currentPassword: PASSWORD }],
    [{ currentPassword: PASSWORD, newPassword: "short" }],
    [{ currentPassword: PASSWORD, newPassword: "x".repeat(73) }],
  ])("validates %j", async (body) => {
    const a = await signUp(ctx);
    const res = await api.post("/api/v1/users/me/password").set(bearer(a.accessToken)).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("PATCH /api/v1/users/:userId/status", () => {
  it("suspends a user: refresh and login are denied with distinct codes, and reactivation restores access", async () => {
    const admin = await signUpAdmin();
    const target = await signUp(ctx, "target@example.com");

    const res = await setStatus(admin, target.user.id, { status: "SUSPENDED" });
    expect(res.status).toBe(200);
    expect(res.body.data.user.status).toBe("SUSPENDED");

    expect((await refresh(target.refreshToken)).body.error.code).toBe("REFRESH_TOKEN_REVOKED");
    const blocked = await login(ctx, "target@example.com");
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("ACCOUNT_SUSPENDED");
    expect((await login(ctx, "target@example.com", "WrongPass123!")).body.error.code).toBe(
      "INVALID_CREDENTIALS",
    );

    await setStatus(admin, target.user.id, { status: "ACTIVE" });
    expect((await login(ctx, "target@example.com")).status).toBe(200);
  });

  it("deactivating gives ACCOUNT_DEACTIVATED on login", async () => {
    const admin = await signUpAdmin();
    const target = await signUp(ctx, "target@example.com");
    await setStatus(admin, target.user.id, { status: "DEACTIVATED" });
    expect((await login(ctx, "target@example.com")).body.error.code).toBe("ACCOUNT_DEACTIVATED");
  });

  it("is ADMIN only: a plain user gets 403, and 401 without a token", async () => {
    const user = await signUp(ctx);
    const other = await signUp(ctx, "other@example.com");
    expect((await setStatus(user, other.user.id, { status: "SUSPENDED" })).status).toBe(403);
    const anon = await api.patch(`/api/v1/users/${other.user.id}/status`).send({ status: "SUSPENDED" });
    expect(anon.status).toBe(401);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: other.user.id } })).status).toBe("ACTIVE");
  });

  it("an organization OWNER has no power over platform status", async () => {
    const owner = await signUp(ctx);
    await api.post("/api/v1/organizations").set(bearer(owner.accessToken)).send({ name: "Acme Technologies" });
    const other = await signUp(ctx, "other@example.com");
    expect((await setStatus(owner, other.user.id, { status: "SUSPENDED" })).status).toBe(403);
  });

  it("maps validation, self-change, unknown user and bad transitions", async () => {
    const admin = await signUpAdmin();
    const target = await signUp(ctx, "target@example.com");

    expect((await setStatus(admin, target.user.id, { status: "BANNED" })).body.error.code).toBe("VALIDATION_ERROR");
    expect((await setStatus(admin, "not-a-uuid", { status: "SUSPENDED" })).body.error.code).toBe("VALIDATION_ERROR");
    const self = await setStatus(admin, admin.user.id, { status: "SUSPENDED" });
    expect(self.status).toBe(403);
    expect(self.body.error.code).toBe("CANNOT_CHANGE_OWN_STATUS");
    const missing = await setStatus(admin, "00000000-0000-4000-8000-000000000000", { status: "SUSPENDED" });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("USER_NOT_FOUND");

    expect((await setStatus(admin, target.user.id, { status: "ACTIVE" })).body.error.code).toBe("INVALID_USER_STATUS");
    await setStatus(admin, target.user.id, { status: "SUSPENDED" });
    const again = await setStatus(admin, target.user.id, { status: "SUSPENDED" });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("USER_ALREADY_SUSPENDED");
  });

  it("D1: an access token issued before the suspension keeps working until it expires", async () => {
    const admin = await signUpAdmin();
    const target = await signUp(ctx, "target@example.com");
    await setStatus(admin, target.user.id, { status: "SUSPENDED" });
    expect((await api.get("/api/v1/users/me").set(bearer(target.accessToken))).status).toBe(200);
  });
});
