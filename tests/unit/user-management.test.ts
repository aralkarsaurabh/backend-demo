import { describe, expect, it } from "vitest";
import { UserStatus } from "../../src/domain/enums/UserStatus";
import { canTransitionStatus } from "../../src/domain/policies/UserStatusTransitions";
import { buildApp, errorCode, registerAndLogin, TestApp } from "../helpers/fakes";

async function adminAndUser(app: TestApp) {
  const admin = await registerAndLogin(app, "admin@example.com");
  const target = await registerAndLogin(app, "target@example.com");
  return { admin, target };
}

const familyOf = (app: TestApp, userId: string) =>
  [...app.refreshTokens.rows.values()].filter((r) => r.userId === userId);

describe("UpdateCurrentUser", () => {
  it("updates the name and returns the profile", async () => {
    const app = buildApp();
    const { user } = await registerAndLogin(app);
    const result = await app.updateCurrentUser.execute(user.id, { name: "Asha Rao" });
    expect(result.user.name).toBe("Asha Rao");
    expect(app.users.users[0].name).toBe("Asha Rao");
    expect(result.user.email).toBe("asha@example.com");
  });

  it("throws USER_NOT_FOUND for a missing user", async () => {
    const app = buildApp();
    expect(await errorCode(app.updateCurrentUser.execute("missing", { name: "x" }))).toBe(
      "USER_NOT_FOUND",
    );
  });
});

describe("ChangePassword", () => {
  it("changes the hash and revokes every refresh token of the user", async () => {
    const app = buildApp();
    const first = await registerAndLogin(app);
    await app.login.execute({ email: "asha@example.com", password: "StrongPass123!" });

    await app.changePassword.execute(first.user.id, {
      currentPassword: "StrongPass123!",
      newPassword: "BrandNewPass456!",
    });

    expect(app.users.users[0].passwordHash).toBe("hashed:BrandNewPass456!");
    const rows = familyOf(app, first.user.id);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.revokedAt)).toBe(true);
    expect(
      await errorCode(app.refresh.execute({ refreshToken: first.tokens.refreshToken })),
    ).toBe("REFRESH_TOKEN_REVOKED");
  });

  it("rejects a wrong current password and changes nothing", async () => {
    const app = buildApp();
    const { user } = await registerAndLogin(app);
    expect(
      await errorCode(
        app.changePassword.execute(user.id, {
          currentPassword: "WrongPass123!",
          newPassword: "BrandNewPass456!",
        }),
      ),
    ).toBe("INVALID_CURRENT_PASSWORD");
    expect(app.users.users[0].passwordHash).toBe("hashed:StrongPass123!");
    expect(familyOf(app, user.id).every((r) => !r.revokedAt)).toBe(true);
  });

  it("throws USER_NOT_FOUND for a missing user", async () => {
    const app = buildApp();
    expect(
      await errorCode(
        app.changePassword.execute("missing", { currentPassword: "a", newPassword: "b" }),
      ),
    ).toBe("USER_NOT_FOUND");
  });
});

describe("UpdateUserStatus", () => {
  it.each([UserStatus.SUSPENDED, UserStatus.DEACTIVATED])(
    "%s sets the status and revokes the target's refresh tokens only",
    async (status) => {
      const app = buildApp();
      const { admin, target } = await adminAndUser(app);

      const result = await app.updateUserStatus.execute(admin.user.id, target.user.id, { status });

      expect(result.user.status).toBe(status);
      expect(familyOf(app, target.user.id).every((r) => r.revokedAt)).toBe(true);
      expect(familyOf(app, admin.user.id).every((r) => !r.revokedAt)).toBe(true);
    },
  );

  it("reactivating restores login", async () => {
    const app = buildApp();
    const { admin, target } = await adminAndUser(app);
    await app.updateUserStatus.execute(admin.user.id, target.user.id, { status: "SUSPENDED" });
    await app.updateUserStatus.execute(admin.user.id, target.user.id, { status: "ACTIVE" });
    expect(
      await errorCode(app.login.execute({ email: "target@example.com", password: "StrongPass123!" })),
    ).toBe("NO ERROR");
  });

  it("blocks changing your own status", async () => {
    const app = buildApp();
    const { admin } = await adminAndUser(app);
    expect(
      await errorCode(
        app.updateUserStatus.execute(admin.user.id, admin.user.id, { status: "SUSPENDED" }),
      ),
    ).toBe("CANNOT_CHANGE_OWN_STATUS");
    expect(app.users.users[0].status).toBe("ACTIVE");
  });

  it("throws USER_NOT_FOUND for an unknown target", async () => {
    const app = buildApp();
    const { admin } = await adminAndUser(app);
    expect(
      await errorCode(app.updateUserStatus.execute(admin.user.id, "missing", { status: "SUSPENDED" })),
    ).toBe("USER_NOT_FOUND");
  });

  it("maps repeated and disallowed transitions to their codes", async () => {
    const app = buildApp();
    const { admin, target } = await adminAndUser(app);
    const set = (status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED") =>
      errorCode(app.updateUserStatus.execute(admin.user.id, target.user.id, { status }));

    expect(await set("ACTIVE")).toBe("INVALID_USER_STATUS");
    expect(await set("SUSPENDED")).toBe("NO ERROR");
    expect(await set("SUSPENDED")).toBe("USER_ALREADY_SUSPENDED");
    expect(await set("DEACTIVATED")).toBe("NO ERROR");
    expect(await set("DEACTIVATED")).toBe("USER_ALREADY_DEACTIVATED");
    expect(await set("SUSPENDED")).toBe("INVALID_USER_STATUS");
  });
});

describe("status gate on login and refresh", () => {
  it.each([
    ["SUSPENDED", "ACCOUNT_SUSPENDED"],
    ["DEACTIVATED", "ACCOUNT_DEACTIVATED"],
  ] as const)("%s account cannot log in (%s)", async (status, code) => {
    const app = buildApp();
    await registerAndLogin(app);
    app.users.users[0].status = status;
    expect(
      await errorCode(app.login.execute({ email: "asha@example.com", password: "StrongPass123!" })),
    ).toBe(code);
  });

  it("login checks the password before the status, so a blocked state is not revealed without it", async () => {
    const app = buildApp();
    await registerAndLogin(app);
    app.users.users[0].status = "SUSPENDED";
    expect(
      await errorCode(app.login.execute({ email: "asha@example.com", password: "WrongPass123!" })),
    ).toBe("INVALID_CREDENTIALS");
  });

  it("a suspended account cannot refresh even if its token was not revoked", async () => {
    const app = buildApp();
    const { user, tokens } = await registerAndLogin(app);
    app.users.users[0].status = "SUSPENDED";
    expect(await errorCode(app.refresh.execute({ refreshToken: tokens.refreshToken }))).toBe(
      "ACCOUNT_SUSPENDED",
    );
    expect(familyOf(app, user.id).filter((r) => r.replacedBy)).toHaveLength(0);
  });
});

describe("canTransitionStatus", () => {
  it("allows exactly the documented transitions", () => {
    const all = Object.values(UserStatus);
    const allowed = all.flatMap((a) => all.filter((b) => canTransitionStatus(a, b)).map((b) => `${a}>${b}`));
    expect(allowed.sort()).toEqual(
      [
        "ACTIVE>SUSPENDED",
        "ACTIVE>DEACTIVATED",
        "SUSPENDED>ACTIVE",
        "SUSPENDED>DEACTIVATED",
        "DEACTIVATED>ACTIVE",
      ].sort(),
    );
  });
});
