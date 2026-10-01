import { describe, expect, it } from "vitest";
import { UserRole } from "../../src/domain/enums/UserRole";
import { buildApp, errorCode, registerAndLogin } from "../helpers/fakes";

describe("RegisterUser", () => {
  it("creates a USER, stores a hash and returns no password data", async () => {
    const app = buildApp();
    const result = await app.register.execute({
      name: "Asha",
      email: "asha@example.com",
      password: "StrongPass123!",
    });

    expect(result.user).toMatchObject({
      name: "Asha",
      email: "asha@example.com",
      role: "USER",
    });
    expect(JSON.stringify(result)).not.toMatch(/password/i);
    expect(app.users.users[0].passwordHash).toBe("hashed:StrongPass123!");
    expect(app.users.users[0].passwordHash).not.toBe("StrongPass123!");
  });

  it("returns no tokens (the client logs in afterwards)", async () => {
    const result = await buildApp().register.execute({
      name: "A",
      email: "a@example.com",
      password: "StrongPass123!",
    });
    expect(Object.keys(result)).toEqual(["user"]);
  });

  it("rejects a taken email with EMAIL_ALREADY_EXISTS", async () => {
    const app = buildApp();
    const request = { name: "A", email: "a@example.com", password: "StrongPass123!" };
    await app.register.execute(request);
    expect(await errorCode(app.register.execute(request))).toBe("EMAIL_ALREADY_EXISTS");
    expect(app.users.users).toHaveLength(1);
  });

  it("maps the repository's unique-violation to EMAIL_ALREADY_EXISTS when two registrations race", async () => {
    const app = buildApp();
    const request = { name: "A", email: "a@example.com", password: "StrongPass123!" };
    const results = await Promise.all([
      errorCode(app.register.execute(request)),
      errorCode(app.register.execute(request)),
    ]);
    expect(results.sort()).toEqual(["EMAIL_ALREADY_EXISTS", "NO ERROR"]);
  });
});

describe("LoginUser", () => {
  it("returns the user and a Bearer token pair", async () => {
    const app = buildApp();
    const { user, tokens } = await registerAndLogin(app);

    expect(user.email).toBe("asha@example.com");
    expect(tokens.tokenType).toBe("Bearer");
    expect(tokens.expiresIn).toBe(900);

    const access = app.tokens.verifyAccessToken(tokens.accessToken);
    expect(access.sub).toBe(user.id);
    expect(access.role).toBe("USER");
  });

  it("stores only a hash of the refresh token, linked by jti, starting a new family", async () => {
    const app = buildApp();
    const { tokens } = await registerAndLogin(app);

    const jti = app.tokens.verifyRefreshToken(tokens.refreshToken).jti;
    const row = await app.refreshTokens.findById(jti);

    expect(row).not.toBeNull();
    expect(row!.tokenHash).toBe(app.tokens.hashToken(tokens.refreshToken));
    expect(row!.tokenHash).not.toBe(tokens.refreshToken);
    expect(row!.revokedAt).toBeNull();
    expect(row!.replacedBy).toBeNull();
  });

  it("starts a separate family for every login", async () => {
    const app = buildApp();
    await registerAndLogin(app);
    await app.login.execute({ email: "asha@example.com", password: "StrongPass123!" });
    const families = new Set([...app.refreshTokens.rows.values()].map((r) => r.familyId));
    expect(families.size).toBe(2);
  });

  it("puts an ADMIN's role in the access token", async () => {
    const app = buildApp();
    await app.users.create({
      name: "Root",
      email: "root@example.com",
      passwordHash: "hashed:RootPass123!",
      role: UserRole.ADMIN,
    });
    const { tokens } = await app.login.execute({
      email: "root@example.com",
      password: "RootPass123!",
    });
    expect(app.tokens.verifyAccessToken(tokens.accessToken).role).toBe("ADMIN");
  });

  it("rejects a wrong password with INVALID_CREDENTIALS and issues nothing", async () => {
    const app = buildApp();
    await registerAndLogin(app);
    const before = app.refreshTokens.rows.size;
    expect(
      await errorCode(app.login.execute({ email: "asha@example.com", password: "wrong" })),
    ).toBe("INVALID_CREDENTIALS");
    expect(app.refreshTokens.rows.size).toBe(before);
  });

  it("rejects an unknown email with the same error, and still does a password comparison", async () => {
    const app = buildApp();
    const compareBefore = app.passwords.compareCalls;
    const error = await app.login
      .execute({ email: "nobody@example.com", password: "whatever123" })
      .catch((e) => e);

    expect(error.code).toBe("INVALID_CREDENTIALS");
    expect(error.message).toBe("The email or password is incorrect.");
    expect(app.passwords.compareCalls).toBe(compareBefore + 1);
  });

  it("gives identical error code and message for unknown email and wrong password", async () => {
    const app = buildApp();
    await registerAndLogin(app);
    const wrongPassword = await app.login
      .execute({ email: "asha@example.com", password: "wrong" })
      .catch((e) => e);
    const unknownEmail = await app.login
      .execute({ email: "nobody@example.com", password: "wrong" })
      .catch((e) => e);

    expect(wrongPassword.code).toBe(unknownEmail.code);
    expect(wrongPassword.message).toBe(unknownEmail.message);
    expect(wrongPassword.httpStatus).toBe(unknownEmail.httpStatus);
  });
});
