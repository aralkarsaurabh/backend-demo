import { describe, expect, it } from "vitest";
import { UserRole } from "../../src/domain/enums/UserRole";
import { JwtTokenService } from "../../src/infrastructure/authentication/JwtTokenService";
import { TEST_SECRETS, buildApp, errorCode, registerAndLogin } from "../helpers/fakes";

const bearer = (refreshToken: string) => ({ refreshToken });

describe("RefreshTokens", () => {
  it("returns a new pair in the same family and revokes + links the old token", async () => {
    const app = buildApp();
    const { tokens: first } = await registerAndLogin(app);
    const oldId = app.tokens.verifyRefreshToken(first.refreshToken).jti;

    const { tokens: second } = await app.refresh.execute(bearer(first.refreshToken));
    const newId = app.tokens.verifyRefreshToken(second.refreshToken).jti;

    // Refresh tokens are unique (own jti). Access tokens have no jti, so two
    // issued in the same second for the same user can be identical; that's fine.
    expect(second.refreshToken).not.toBe(first.refreshToken);

    const oldRow = (await app.refreshTokens.findById(oldId))!;
    const newRow = (await app.refreshTokens.findById(newId))!;
    expect(oldRow.revokedAt).not.toBeNull();
    expect(oldRow.replacedBy).toBe(newId);
    expect(newRow.revokedAt).toBeNull();
    expect(newRow.familyId).toBe(oldRow.familyId);
  });

  it("can be chained: each new refresh token works once", async () => {
    const app = buildApp();
    let { tokens } = await registerAndLogin(app);
    for (let i = 0; i < 3; i++) {
      ({ tokens } = await app.refresh.execute(bearer(tokens.refreshToken)));
    }
    expect(app.refreshTokens.rows.size).toBe(4);
    expect([...app.refreshTokens.rows.values()].filter((r) => !r.revokedAt)).toHaveLength(1);
  });

  it("reads the user's CURRENT role from the database for the new access token", async () => {
    const app = buildApp();
    const { user, tokens: first } = await registerAndLogin(app);
    expect(app.tokens.verifyAccessToken(first.accessToken).role).toBe("USER");

    app.users.users.find((u) => u.id === user.id)!.role = UserRole.ADMIN;
    const { tokens: second } = await app.refresh.execute(bearer(first.refreshToken));

    expect(app.tokens.verifyAccessToken(second.accessToken).role).toBe("ADMIN");
    // the old access token is unchanged until it expires
    expect(app.tokens.verifyAccessToken(first.accessToken).role).toBe("USER");
  });

  it("detects reuse: an already-rotated token gets REFRESH_TOKEN_REUSED and the whole family is revoked", async () => {
    const app = buildApp();
    const { tokens: a } = await registerAndLogin(app);
    const { tokens: b } = await app.refresh.execute(bearer(a.refreshToken));

    expect(await errorCode(app.refresh.execute(bearer(a.refreshToken)))).toBe(
      "REFRESH_TOKEN_REUSED",
    );

    // B was never used, but its family is now dead
    expect(await errorCode(app.refresh.execute(bearer(b.refreshToken)))).toBe(
      "REFRESH_TOKEN_REVOKED",
    );
    expect([...app.refreshTokens.rows.values()].every((r) => r.revokedAt)).toBe(true);
  });

  it("does not touch other families when reuse is detected", async () => {
    const app = buildApp();
    const { tokens: a } = await registerAndLogin(app);
    const other = await app.login.execute({
      email: "asha@example.com",
      password: "StrongPass123!",
    });
    await app.refresh.execute(bearer(a.refreshToken));
    await errorCode(app.refresh.execute(bearer(a.refreshToken)));

    await expect(app.refresh.execute(bearer(other.tokens.refreshToken))).resolves.toBeDefined();
  });

  it("lets exactly one of two simultaneous refreshes win; the loser is treated as reuse and the family is revoked", async () => {
    const app = buildApp();
    const { tokens } = await registerAndLogin(app);

    const outcomes = await Promise.all([
      errorCode(app.refresh.execute(bearer(tokens.refreshToken))),
      errorCode(app.refresh.execute(bearer(tokens.refreshToken))),
    ]);

    expect(outcomes.sort()).toEqual(["NO ERROR", "REFRESH_TOKEN_REUSED"]);
    expect([...app.refreshTokens.rows.values()].every((r) => r.revokedAt)).toBe(true);
  });

  it("rejects a token revoked by logout with REFRESH_TOKEN_REVOKED (not REUSED)", async () => {
    const app = buildApp();
    const { tokens } = await registerAndLogin(app);
    await app.logout.execute(bearer(tokens.refreshToken));
    expect(await errorCode(app.refresh.execute(bearer(tokens.refreshToken)))).toBe(
      "REFRESH_TOKEN_REVOKED",
    );
  });

  it("rejects an expired refresh token with REFRESH_TOKEN_EXPIRED", async () => {
    const app = buildApp({ access: 900, refresh: -10 });
    const { tokens } = await registerAndLogin(app);
    expect(await errorCode(app.refresh.execute(bearer(tokens.refreshToken)))).toBe(
      "REFRESH_TOKEN_EXPIRED",
    );
  });

  it("rejects garbage with INVALID_REFRESH_TOKEN", async () => {
    const app = buildApp();
    expect(await errorCode(app.refresh.execute(bearer("not-a-jwt")))).toBe(
      "INVALID_REFRESH_TOKEN",
    );
  });

  it("rejects an access token used as a refresh token", async () => {
    const app = buildApp();
    const { tokens } = await registerAndLogin(app);
    expect(await errorCode(app.refresh.execute(bearer(tokens.accessToken)))).toBe(
      "INVALID_REFRESH_TOKEN",
    );
  });

  it("rejects a validly signed token whose row does not exist", async () => {
    const app = buildApp();
    const forged = app.tokens.generateRefreshToken({ sub: "u1", jti: "no-such-row" });
    expect(await errorCode(app.refresh.execute(bearer(forged.token)))).toBe(
      "INVALID_REFRESH_TOKEN",
    );
  });

  it("rejects when the stored hash does not match the presented token", async () => {
    const app = buildApp();
    const { user, tokens } = await registerAndLogin(app);
    const jti = app.tokens.verifyRefreshToken(tokens.refreshToken).jti;
    // Same secret, user and jti, but a different expiry, so a different token string.
    const lookalike = new JwtTokenService(TEST_SECRETS, { access: 900, refresh: 1234 })
      .generateRefreshToken({ sub: user.id, jti });
    expect(lookalike.token).not.toBe(tokens.refreshToken);
    expect(await errorCode(app.refresh.execute(bearer(lookalike.token)))).toBe(
      "INVALID_REFRESH_TOKEN",
    );
  });

  it("rejects a token for a user that no longer exists as INVALID_REFRESH_TOKEN", async () => {
    const app = buildApp();
    const { tokens } = await registerAndLogin(app);
    app.users.users = [];
    expect(await errorCode(app.refresh.execute(bearer(tokens.refreshToken)))).toBe(
      "INVALID_REFRESH_TOKEN",
    );
  });
});

describe("LogoutUser", () => {
  it("revokes the whole family, so even the newest token stops working", async () => {
    const app = buildApp();
    const { tokens: a } = await registerAndLogin(app);
    const { tokens: b } = await app.refresh.execute(bearer(a.refreshToken));

    await app.logout.execute(bearer(b.refreshToken));

    expect([...app.refreshTokens.rows.values()].every((r) => r.revokedAt)).toBe(true);
    expect(await errorCode(app.refresh.execute(bearer(b.refreshToken)))).toBe(
      "REFRESH_TOKEN_REVOKED",
    );
  });

  it("is idempotent", async () => {
    const app = buildApp();
    const { tokens } = await registerAndLogin(app);
    await app.logout.execute(bearer(tokens.refreshToken));
    await expect(app.logout.execute(bearer(tokens.refreshToken))).resolves.toBeUndefined();
  });

  it("succeeds silently for garbage, access tokens and unknown tokens", async () => {
    const app = buildApp();
    const { tokens } = await registerAndLogin(app);
    const unknown = app.tokens.generateRefreshToken({ sub: "u1", jti: "no-such-row" });

    for (const token of ["garbage", tokens.accessToken, unknown.token]) {
      await expect(app.logout.execute(bearer(token))).resolves.toBeUndefined();
    }
    // none of that revoked the real session
    await expect(app.refresh.execute(bearer(tokens.refreshToken))).resolves.toBeDefined();
  });

  it("only revokes its own family", async () => {
    const app = buildApp();
    const { tokens: phone } = await registerAndLogin(app);
    const laptop = await app.login.execute({
      email: "asha@example.com",
      password: "StrongPass123!",
    });

    await app.logout.execute(bearer(phone.refreshToken));

    await expect(app.refresh.execute(bearer(laptop.tokens.refreshToken))).resolves.toBeDefined();
  });

  it("does not invalidate an access token that was already issued (documented behaviour of design choice D1)", async () => {
    const app = buildApp();
    const { tokens } = await registerAndLogin(app);
    await app.logout.execute(bearer(tokens.refreshToken));
    expect(() => app.tokens.verifyAccessToken(tokens.accessToken)).not.toThrow();
  });

  it("propagates real infrastructure failures instead of swallowing them", async () => {
    const app = buildApp();
    const { tokens } = await registerAndLogin(app);
    app.refreshTokens.findById = async () => {
      throw new Error("db down");
    };
    await expect(app.logout.execute(bearer(tokens.refreshToken))).rejects.toThrow("db down");
  });
});
