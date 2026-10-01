import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CreateOrganization } from "../../src/application/use-cases/organization/CreateOrganization";
import { OrganizationRole } from "../../src/domain/enums/OrganizationRole";
import { TestApp, buildApp, errorCode } from "../helpers/fakes";

const { OWNER, ADMIN, MEMBER } = OrganizationRole;

async function newUser(app: TestApp, email: string) {
  const { user } = await app.register.execute({
    name: email.split("@")[0],
    email,
    password: "StrongPass123!",
  });
  return user;
}

/** An organization with an OWNER, an ADMIN and a MEMBER already in it. */
async function setup() {
  const app = buildApp();
  const owner = await newUser(app, "owner@example.com");
  const admin = await newUser(app, "admin@example.com");
  const member = await newUser(app, "member@example.com");
  const outsider = await newUser(app, "outsider@example.com");

  const { organization } = await app.createOrganization.execute({ name: "Acme" }, owner.id);
  const addMember = (userId: string, role: OrganizationRole) =>
    app.orgData.memberships.push({
      id: randomUUID(),
      organizationId: organization.id,
      userId,
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  addMember(admin.id, ADMIN);
  addMember(member.id, MEMBER);

  const invite = (actorRole: OrganizationRole, email: string, role: OrganizationRole = MEMBER) =>
    app.inviteOrganizationMember.execute({
      organizationId: organization.id,
      actorRole,
      invitedBy: owner.id,
      email,
      role,
    });

  return { app, owner, admin, member, outsider, organization, addMember, invite };
}

describe("CreateOrganization", () => {
  it("creates the organization with the creator as its OWNER", async () => {
    const app = buildApp();
    const owner = await newUser(app, "owner@example.com");

    const { organization } = await app.createOrganization.execute(
      { name: "Acme Technologies" },
      owner.id,
    );

    expect(organization).toEqual({
      id: expect.any(String),
      name: "Acme Technologies",
      slug: "acme-technologies",
      role: "OWNER",
    });
    expect(app.orgData.memberships).toHaveLength(1);
    expect(app.orgData.memberships[0]).toMatchObject({ userId: owner.id, role: "OWNER" });
  });

  it("appends a suffix when the slug is taken", async () => {
    const app = buildApp();
    const owner = await newUser(app, "owner@example.com");
    const create = new CreateOrganization(app.organizations, () => "ab12");

    const first = await create.execute({ name: "Acme" }, owner.id);
    const second = await create.execute({ name: "Acme" }, owner.id);

    expect(first.organization.slug).toBe("acme");
    expect(second.organization.slug).toBe("acme-ab12");
  });

  it("gives up with INTERNAL_SERVER_ERROR after 5 retries", async () => {
    const app = buildApp();
    const owner = await newUser(app, "owner@example.com");
    const create = new CreateOrganization(app.organizations, () => "same");
    await create.execute({ name: "Acme" }, owner.id);
    await create.execute({ name: "Acme" }, owner.id); // takes "acme-same"

    expect(await errorCode(create.execute({ name: "Acme" }, owner.id))).toBe(
      "INTERNAL_SERVER_ERROR",
    );
    expect(app.orgData.organizations).toHaveLength(2);
  });
});

describe("ListUserOrganizations and GetOrganization", () => {
  it("lists only the caller's organizations with their role in each", async () => {
    const { app, owner, member, organization } = await setup();
    await app.createOrganization.execute({ name: "Other" }, member.id);

    const mine = await app.listUserOrganizations.execute(member.id);
    expect(mine.organizations.map((o) => [o.slug, o.role])).toEqual([
      ["acme", "MEMBER"],
      ["other", "OWNER"],
    ]);

    const owners = await app.listUserOrganizations.execute(owner.id);
    expect(owners.organizations.map((o) => o.id)).toEqual([organization.id]);
  });

  it("returns the organization with the caller's role", async () => {
    const { app, organization } = await setup();
    const result = await app.getOrganization.execute(organization.id, ADMIN);
    expect(result.organization).toMatchObject({ id: organization.id, role: "ADMIN" });
    expect(result.organization.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("throws ORGANIZATION_NOT_FOUND for an unknown id", async () => {
    const { app } = await setup();
    expect(await errorCode(app.getOrganization.execute(randomUUID(), OWNER))).toBe(
      "ORGANIZATION_NOT_FOUND",
    );
  });
});

describe("InviteOrganizationMember", () => {
  it("stores only the token's SHA-256 hash and returns the raw token once", async () => {
    const { app, invite } = await setup();
    const { invitation, token } = await invite(OWNER, "new@example.com");

    const row = app.orgData.invitations[0];
    expect(row.tokenHash).toBe(app.tokens.hashToken(token));
    expect(row.tokenHash).not.toBe(token);
    expect(JSON.stringify(row)).not.toContain(token);
    expect(JSON.stringify(invitation)).not.toMatch(/token/i);
    expect(invitation).toMatchObject({ email: "new@example.com", role: "MEMBER" });
  });

  it("expires 7 days after creation", async () => {
    const { invite } = await setup();
    const before = Date.now();
    const { invitation } = await invite(OWNER, "new@example.com");
    const ttl = new Date(invitation.expiresAt).getTime() - before;
    expect(ttl).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 * 1000);
    expect(ttl).toBeLessThan(7 * 24 * 60 * 60 * 1000 + 5_000);
  });

  it("lets OWNER invite ADMIN and MEMBER, and ADMIN invite MEMBER only", async () => {
    const { invite } = await setup();
    expect(await errorCode(invite(OWNER, "a@example.com", ADMIN))).toBe("NO ERROR");
    expect(await errorCode(invite(OWNER, "b@example.com", MEMBER))).toBe("NO ERROR");
    expect(await errorCode(invite(ADMIN, "c@example.com", MEMBER))).toBe("NO ERROR");
    expect(await errorCode(invite(ADMIN, "d@example.com", ADMIN))).toBe(
      "INSUFFICIENT_ORGANIZATION_PERMISSION",
    );
  });

  it("never lets anyone invite an OWNER", async () => {
    const { invite } = await setup();
    expect(await errorCode(invite(OWNER, "x@example.com", OWNER))).toBe(
      "INSUFFICIENT_ORGANIZATION_PERMISSION",
    );
  });

  it("rejects a MEMBER inviting anyone", async () => {
    const { invite } = await setup();
    expect(await errorCode(invite(MEMBER, "x@example.com", MEMBER))).toBe(
      "INSUFFICIENT_ORGANIZATION_PERMISSION",
    );
  });

  it("throws MEMBERSHIP_ALREADY_EXISTS for someone who is already a member", async () => {
    const { invite, member } = await setup();
    expect(await errorCode(invite(OWNER, member.email))).toBe("MEMBERSHIP_ALREADY_EXISTS");
  });

  it("does not create a user for an unregistered email", async () => {
    const { app, invite } = await setup();
    const usersBefore = app.users.users.length;
    await invite(OWNER, "stranger@example.com");
    expect(app.users.users).toHaveLength(usersBefore);
  });

  it("throws INVITATION_ALREADY_EXISTS while one is open, and replaces an expired one", async () => {
    const { app, invite } = await setup();
    await invite(OWNER, "new@example.com");
    expect(await errorCode(invite(OWNER, "new@example.com"))).toBe("INVITATION_ALREADY_EXISTS");

    app.orgData.invitations[0].expiresAt = new Date(Date.now() - 1_000);
    expect(await errorCode(invite(OWNER, "new@example.com"))).toBe("NO ERROR");
    expect(app.orgData.invitations).toHaveLength(1);
  });
});

describe("AcceptOrganizationInvitation", () => {
  it("creates the membership with the invited role and marks the invitation accepted", async () => {
    const { app, outsider, organization, invite } = await setup();
    const { token } = await invite(OWNER, outsider.email, ADMIN);

    const result = await app.acceptOrganizationInvitation.execute({
      token,
      userId: outsider.id,
    });

    expect(result).toEqual({
      organization: { id: organization.id, name: "Acme", slug: "acme" },
      role: "ADMIN",
    });
    expect(
      await app.memberships.findByOrganizationAndUser(organization.id, outsider.id),
    ).toMatchObject({ role: "ADMIN" });
    expect(app.orgData.invitations[0].acceptedAt).toBeInstanceOf(Date);
  });

  it("gives INVALID_INVITATION for an unknown token", async () => {
    const { app, outsider } = await setup();
    expect(
      await errorCode(
        app.acceptOrganizationInvitation.execute({ token: "nope", userId: outsider.id }),
      ),
    ).toBe("INVALID_INVITATION");
  });

  it("gives INVALID_INVITATION when the caller's email is not the invited one", async () => {
    const { app, outsider, member, invite } = await setup();
    const { token } = await invite(OWNER, outsider.email);
    expect(
      await errorCode(app.acceptOrganizationInvitation.execute({ token, userId: member.id })),
    ).toBe("INVALID_INVITATION");
    expect(app.orgData.invitations[0].acceptedAt).toBeNull();
  });

  it("gives INVALID_INVITATION the second time", async () => {
    const { app, outsider, invite } = await setup();
    const { token } = await invite(OWNER, outsider.email);
    await app.acceptOrganizationInvitation.execute({ token, userId: outsider.id });
    expect(
      await errorCode(app.acceptOrganizationInvitation.execute({ token, userId: outsider.id })),
    ).toBe("INVALID_INVITATION");
  });

  it("gives INVITATION_EXPIRED to the invitee, but INVALID_INVITATION to anyone else", async () => {
    const { app, outsider, member, invite } = await setup();
    const { token } = await invite(OWNER, outsider.email);
    app.orgData.invitations[0].expiresAt = new Date(Date.now() - 1_000);

    expect(
      await errorCode(app.acceptOrganizationInvitation.execute({ token, userId: outsider.id })),
    ).toBe("INVITATION_EXPIRED");
    // A token holder who is not the invitee must not learn that it expired.
    expect(
      await errorCode(app.acceptOrganizationInvitation.execute({ token, userId: member.id })),
    ).toBe("INVALID_INVITATION");
    expect(app.orgData.memberships.some((m) => m.userId === outsider.id)).toBe(false);
  });

  it("gives MEMBERSHIP_ALREADY_EXISTS and leaves the invitation open if they joined meanwhile", async () => {
    const { app, outsider, addMember, invite } = await setup();
    const { token } = await invite(OWNER, outsider.email);
    addMember(outsider.id, MEMBER);

    expect(
      await errorCode(app.acceptOrganizationInvitation.execute({ token, userId: outsider.id })),
    ).toBe("MEMBERSHIP_ALREADY_EXISTS");
    expect(app.orgData.invitations[0].acceptedAt).toBeNull();
  });
});

describe("ListOrganizationMembers", () => {
  it("lists members with their user fields and no password data", async () => {
    const { app, organization } = await setup();
    const { members } = await app.listOrganizationMembers.execute(organization.id);

    expect(members.map((m) => [m.email, m.role])).toEqual([
      ["owner@example.com", "OWNER"],
      ["admin@example.com", "ADMIN"],
      ["member@example.com", "MEMBER"],
    ]);
    expect(members[0].joinedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(JSON.stringify(members)).not.toMatch(/password|hash/i);
  });
});

describe("UpdateOrganizationMemberRole", () => {
  it("promotes and demotes between ADMIN and MEMBER", async () => {
    const { app, organization, member } = await setup();
    const update = (role: OrganizationRole) =>
      app.updateOrganizationMemberRole.execute({
        organizationId: organization.id,
        targetUserId: member.id,
        role,
      });

    expect(await update(ADMIN)).toEqual({
      member: { userId: member.id, role: "ADMIN" },
      previousRole: "MEMBER",
    });
    expect(await update(MEMBER)).toMatchObject({ previousRole: "ADMIN" });
  });

  it("treats setting the current role as a successful no-op", async () => {
    const { app, organization, member } = await setup();
    const result = await app.updateOrganizationMemberRole.execute({
      organizationId: organization.id,
      targetUserId: member.id,
      role: MEMBER,
    });
    expect(result.member.role).toBe("MEMBER");
  });

  it("refuses to change the OWNER's role", async () => {
    const { app, organization, owner } = await setup();
    expect(
      await errorCode(
        app.updateOrganizationMemberRole.execute({
          organizationId: organization.id,
          targetUserId: owner.id,
          role: MEMBER,
        }),
      ),
    ).toBe("CANNOT_CHANGE_OWNER_ROLE");
    expect(app.orgData.memberships[0].role).toBe("OWNER");
  });

  it("throws MEMBERSHIP_NOT_FOUND for someone who is not a member", async () => {
    const { app, organization, outsider } = await setup();
    expect(
      await errorCode(
        app.updateOrganizationMemberRole.execute({
          organizationId: organization.id,
          targetUserId: outsider.id,
          role: ADMIN,
        }),
      ),
    ).toBe("MEMBERSHIP_NOT_FOUND");
  });
});

describe("RemoveOrganizationMember", () => {
  const remove = (
    s: Awaited<ReturnType<typeof setup>>,
    actorRole: OrganizationRole,
    targetUserId: string,
  ) =>
    s.app.removeOrganizationMember.execute({
      organizationId: s.organization.id,
      actorRole,
      targetUserId,
    });

  it("lets OWNER remove an ADMIN and a MEMBER", async () => {
    const s = await setup();
    expect(await remove(s, OWNER, s.admin.id)).toEqual({ removedRole: "ADMIN" });
    expect(await remove(s, OWNER, s.member.id)).toEqual({ removedRole: "MEMBER" });
    expect(s.app.orgData.memberships.map((m) => m.role)).toEqual(["OWNER"]);
  });

  it("lets ADMIN remove a MEMBER only", async () => {
    const s = await setup();
    const otherAdmin = await newUser(s.app, "admin2@example.com");
    s.addMember(otherAdmin.id, ADMIN);

    expect(await errorCode(remove(s, ADMIN, s.member.id))).toBe("NO ERROR");
    expect(await errorCode(remove(s, ADMIN, otherAdmin.id))).toBe(
      "INSUFFICIENT_ORGANIZATION_PERMISSION",
    );
    expect(await errorCode(remove(s, ADMIN, s.owner.id))).toBe("CANNOT_REMOVE_OWNER");
  });

  it("never removes the OWNER, including the OWNER themselves", async () => {
    const s = await setup();
    expect(await errorCode(remove(s, OWNER, s.owner.id))).toBe("CANNOT_REMOVE_OWNER");
    expect(s.app.orgData.memberships.some((m) => m.role === "OWNER")).toBe(true);
  });

  it("does not let an ADMIN or MEMBER remove themselves (no leaving in v1)", async () => {
    const s = await setup();
    expect(await errorCode(remove(s, ADMIN, s.admin.id))).toBe(
      "INSUFFICIENT_ORGANIZATION_PERMISSION",
    );
    expect(await errorCode(remove(s, MEMBER, s.member.id))).toBe(
      "INSUFFICIENT_ORGANIZATION_PERMISSION",
    );
  });

  it("throws MEMBERSHIP_NOT_FOUND for someone who is not a member", async () => {
    const s = await setup();
    expect(await errorCode(remove(s, OWNER, s.outsider.id))).toBe("MEMBERSHIP_NOT_FOUND");
  });
});
