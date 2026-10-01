import { describe, expect, it } from "vitest";
import { UserRole } from "../../src/domain/enums/UserRole";
import { buildApp, errorCode, registerAndLogin } from "../helpers/fakes";

describe("GetCurrentUser", () => {
  it("returns the user without password data", async () => {
    const app = buildApp();
    const { user } = await registerAndLogin(app);
    const result = await app.getCurrentUser.execute(user.id);

    expect(result.user).toEqual({
      id: user.id,
      name: "Asha",
      email: "asha@example.com",
      role: "USER",
      status: "ACTIVE",
      createdAt: app.users.users[0].createdAt.toISOString(),
      updatedAt: app.users.users[0].updatedAt.toISOString(),
    });
    expect(JSON.stringify(result)).not.toMatch(/password/i);
  });

  it("reflects a role change immediately, even though the token's role is stale", async () => {
    const app = buildApp();
    const { user } = await registerAndLogin(app);
    app.users.users[0].role = UserRole.ADMIN;
    expect((await app.getCurrentUser.execute(user.id)).user.role).toBe("ADMIN");
  });

  it("throws USER_NOT_FOUND for a deleted user", async () => {
    const app = buildApp();
    expect(await errorCode(app.getCurrentUser.execute("missing"))).toBe("USER_NOT_FOUND");
  });
});

describe("ListUsers", () => {
  it("returns every user with createdAt and no password data", async () => {
    const app = buildApp();
    await registerAndLogin(app, "one@example.com");
    await registerAndLogin(app, "two@example.com");

    const { users } = await app.listUsers.execute();

    expect(users.map((u) => u.email)).toEqual(["one@example.com", "two@example.com"]);
    expect(users[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(JSON.stringify(users)).not.toMatch(/password/i);
  });
});
