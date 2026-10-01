import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  PASSWORD,
  bearer,
  buildIntegrationApp,
  createOrganization,
  invite,
  joinOrganization,
  login,
  register,
  resetDatabase,
  signUp,
} from "../helpers/integration";

const ctx = buildIntegrationApp();
const { api, prisma } = ctx;

beforeEach(() => resetDatabase(prisma));
afterAll(() => prisma.$disconnect());

const BASE = "/api/v1";

function expectEnvelope(body: any, success: boolean) {
  expect(Object.keys(body).sort()).toEqual(["data", "error", "message", "meta", "success"]);
  expect(body.success).toBe(success);
  expect(new Date(body.meta.timestamp).toISOString()).toBe(body.meta.timestamp);
  if (success) expect(body.error).toBeNull();
  else {
    expect(body.data).toBeNull();
    expect(Object.keys(body.error).sort()).toEqual(["code", "details"]);
  }
}

function expectError(res: any, status: number, code: string) {
  expect(res.status).toBe(status);
  expectEnvelope(res.body, false);
  expect(res.body.error.code).toBe(code);
}

/** An organization owned by `owner`, with an ADMIN and a MEMBER already in it. */
async function setup() {
  const owner = await signUp(ctx, "owner@example.com");
  const org = await createOrganization(ctx, owner);
  const admin = await joinOrganization(ctx, owner, org.id, "admin@example.com", "ADMIN");
  const member = await joinOrganization(ctx, owner, org.id, "member@example.com", "MEMBER");
  return { owner, admin, member, org };
}

describe("lifecycle", () => {
  it("create, invite, accept, list, change role, remove", async () => {
    const owner = await signUp(ctx, "owner@example.com");

    const created = await api
      .post(`${BASE}/organizations`)
      .set(bearer(owner.accessToken))
      .send({ name: "Acme Technologies" });
    expect(created.status).toBe(201);
    expectEnvelope(created.body, true);
    expect(created.body.message).toBe("Organization created successfully.");
    expect(created.body.data.organization).toEqual({
      id: expect.any(String),
      name: "Acme Technologies",
      slug: "acme-technologies",
      role: "OWNER",
    });
    const orgId = created.body.data.organization.id as string;

    const invitee = await signUp(ctx, "invitee@example.com");
    const invited = await api
      .post(`${BASE}/organizations/${orgId}/invitations`)
      .set(bearer(owner.accessToken))
      .send({ email: "Invitee@Example.com" });
    expect(invited.status).toBe(201);
    expectEnvelope(invited.body, true);
    expect(invited.body.data.invitation).toEqual({
      id: expect.any(String),
      email: "invitee@example.com",
      role: "MEMBER",
      expiresAt: expect.any(String),
    });
    const token = invited.body.data.token as string;
    expect(token.length).toBeGreaterThanOrEqual(40);

    const accepted = await api
      .post(`${BASE}/organization-invitations/accept`)
      .set(bearer(invitee.accessToken))
      .send({ token });
    expect(accepted.status).toBe(200);
    expectEnvelope(accepted.body, true);
    expect(accepted.body.data).toEqual({
      organization: { id: orgId, name: "Acme Technologies", slug: "acme-technologies" },
      role: "MEMBER",
    });

    const mine = await api.get(`${BASE}/organizations`).set(bearer(invitee.accessToken));
    expect(mine.status).toBe(200);
    expect(mine.body.data.organizations).toEqual([
      { id: orgId, name: "Acme Technologies", slug: "acme-technologies", role: "MEMBER" },
    ]);

    const detail = await api.get(`${BASE}/organizations/${orgId}`).set(bearer(invitee.accessToken));
    expect(detail.status).toBe(200);
    expect(detail.body.data.organization).toMatchObject({ id: orgId, role: "MEMBER" });

    const members = await api
      .get(`${BASE}/organizations/${orgId}/members`)
      .set(bearer(invitee.accessToken));
    expect(members.status).toBe(200);
    expect(members.body.data.members.map((m: any) => [m.email, m.role])).toEqual([
      ["owner@example.com", "OWNER"],
      ["invitee@example.com", "MEMBER"],
    ]);
    expect(JSON.stringify(members.body)).not.toMatch(/password|hash/i);

    const promoted = await api
      .patch(`${BASE}/organizations/${orgId}/members/${invitee.user.id}`)
      .set(bearer(owner.accessToken))
      .send({ role: "ADMIN" });
    expect(promoted.status).toBe(200);
    expectEnvelope(promoted.body, true);
    expect(promoted.body.data.member).toEqual({ userId: invitee.user.id, role: "ADMIN" });

    const removed = await api
      .delete(`${BASE}/organizations/${orgId}/members/${invitee.user.id}`)
      .set(bearer(owner.accessToken));
    expect(removed.status).toBe(200);
    expectEnvelope(removed.body, true);
    expect(removed.body.data).toBeNull();

    expect((await api.get(`${BASE}/organizations`).set(bearer(invitee.accessToken))).body.data.organizations).toEqual([]);
  });

  it("gives a second organization with the same name a different slug", async () => {
    const a = await signUp(ctx, "a@example.com");
    const b = await signUp(ctx, "b@example.com");
    const first = await createOrganization(ctx, a, "Acme");
    const second = await createOrganization(ctx, b, "Acme");

    expect(first.slug).toBe("acme");
    expect(second.slug).toMatch(/^acme-[0-9a-f]{4}$/);
  });
});

describe("tenant isolation", () => {
  it("answers a non-member exactly as it answers an organization that does not exist", async () => {
    const a = await signUp(ctx, "a@example.com");
    const b = await signUp(ctx, "b@example.com");
    const orgB = await createOrganization(ctx, b, "Beta");

    const paths: Array<[string, string, object?]> = [
      ["get", ""],
      ["get", "/members"],
      ["post", "/invitations", { email: "x@example.com" }],
      ["patch", `/members/${b.user.id}`, { role: "ADMIN" }],
      ["delete", `/members/${b.user.id}`],
    ];

    for (const [method, suffix, body] of paths) {
      const foreign = await (api as any)[method](`${BASE}/organizations/${orgB.id}${suffix}`)
        .set(bearer(a.accessToken))
        .send(body);
      const missing = await (api as any)[method](`${BASE}/organizations/${randomUUID()}${suffix}`)
        .set(bearer(a.accessToken))
        .send(body);

      expectError(foreign, 404, "ORGANIZATION_NOT_FOUND");
      expect(foreign.body.message).toBe(missing.body.message);
      expect(foreign.body.error).toEqual(missing.body.error);
      expect(foreign.status).toBe(missing.status);
    }

    // Nothing was changed by those attempts.
    expect(await prisma.organizationMembership.count({ where: { organizationId: orgB.id } })).toBe(1);
    expect(await prisma.organizationInvitation.count()).toBe(0);
  });

  it("does not list another tenant's organizations", async () => {
    const a = await signUp(ctx, "a@example.com");
    const b = await signUp(ctx, "b@example.com");
    await createOrganization(ctx, a, "Alpha");
    await createOrganization(ctx, b, "Beta");

    const res = await api.get(`${BASE}/organizations`).set(bearer(a.accessToken));
    expect(res.body.data.organizations.map((o: any) => o.name)).toEqual(["Alpha"]);
  });

  it("gives a platform ADMIN who is not a member no special access", async () => {
    const owner = await signUp(ctx, "owner@example.com");
    const org = await createOrganization(ctx, owner);

    await register(ctx, "root@example.com");
    await prisma.user.update({ where: { email: "root@example.com" }, data: { role: "ADMIN" } });
    const root = (await login(ctx, "root@example.com")).body.data.tokens.accessToken as string;

    expectError(
      await api.get(`${BASE}/organizations/${org.id}`).set(bearer(root)),
      404,
      "ORGANIZATION_NOT_FOUND",
    );
    expectError(
      await api.get(`${BASE}/organizations/${org.id}/members`).set(bearer(root)),
      404,
      "ORGANIZATION_NOT_FOUND",
    );
  });

  it("applies membership changes on the very next request with the same access token", async () => {
    const { owner, member, org } = await setup();
    const members = () =>
      api.get(`${BASE}/organizations/${org.id}/members`).set(bearer(member.accessToken));

    expect((await members()).status).toBe(200);

    await api
      .delete(`${BASE}/organizations/${org.id}/members/${member.user.id}`)
      .set(bearer(owner.accessToken));

    expectError(await members(), 404, "ORGANIZATION_NOT_FOUND");
  });

  it("applies a role change on the very next request with the same access token", async () => {
    const { owner, member, org } = await setup();
    const inviteAsMember = () =>
      api
        .post(`${BASE}/organizations/${org.id}/invitations`)
        .set(bearer(member.accessToken))
        .send({ email: "someone@example.com" });

    expectError(await inviteAsMember(), 403, "INSUFFICIENT_ORGANIZATION_PERMISSION");

    await api
      .patch(`${BASE}/organizations/${org.id}/members/${member.user.id}`)
      .set(bearer(owner.accessToken))
      .send({ role: "ADMIN" });

    expect((await inviteAsMember()).status).toBe(201);
  });
});

describe("permissions", () => {
  it("lets every role read the organization and the member list", async () => {
    const { owner, admin, member, org } = await setup();
    for (const who of [owner, admin, member]) {
      expect((await api.get(`${BASE}/organizations/${org.id}`).set(bearer(who.accessToken))).status).toBe(200);
      expect(
        (await api.get(`${BASE}/organizations/${org.id}/members`).set(bearer(who.accessToken))).status,
      ).toBe(200);
    }
  });

  it("invitations: OWNER may invite ADMIN, ADMIN only MEMBER, MEMBER nobody, nobody OWNER", async () => {
    const { owner, admin, member, org } = await setup();
    const send = (who: { accessToken: string }, email: string, role: string) =>
      api
        .post(`${BASE}/organizations/${org.id}/invitations`)
        .set(bearer(who.accessToken))
        .send({ email, role });

    expect((await send(owner, "a@example.com", "ADMIN")).status).toBe(201);
    expect((await send(admin, "b@example.com", "MEMBER")).status).toBe(201);
    expectError(await send(admin, "c@example.com", "ADMIN"), 403, "INSUFFICIENT_ORGANIZATION_PERMISSION");
    expectError(await send(member, "d@example.com", "MEMBER"), 403, "INSUFFICIENT_ORGANIZATION_PERMISSION");
    expectError(await send(owner, "e@example.com", "OWNER"), 400, "VALIDATION_ERROR");
  });

  it("removal: OWNER removes ADMIN/MEMBER, ADMIN only MEMBER, nobody removes the OWNER", async () => {
    const { owner, admin, member, org } = await setup();
    const remove = (who: { accessToken: string }, userId: string) =>
      api.delete(`${BASE}/organizations/${org.id}/members/${userId}`).set(bearer(who.accessToken));
    const admin2 = await joinOrganization(ctx, owner, org.id, "admin2@example.com", "ADMIN");

    expectError(await remove(member, admin.user.id), 403, "INSUFFICIENT_ORGANIZATION_PERMISSION");
    expectError(await remove(admin, admin2.user.id), 403, "INSUFFICIENT_ORGANIZATION_PERMISSION");
    expectError(await remove(admin, admin.user.id), 403, "INSUFFICIENT_ORGANIZATION_PERMISSION");
    expectError(await remove(admin, owner.user.id), 403, "CANNOT_REMOVE_OWNER");
    expectError(await remove(owner, owner.user.id), 403, "CANNOT_REMOVE_OWNER");

    expect((await remove(admin, member.user.id)).status).toBe(200);
    expect((await remove(owner, admin2.user.id)).status).toBe(200);
    expectError(await remove(owner, member.user.id), 404, "MEMBERSHIP_NOT_FOUND");
    expect(await prisma.organizationMembership.count({ where: { role: "OWNER" } })).toBe(1);
  });

  it("role change: OWNER only, never on the OWNER, never to OWNER", async () => {
    const { owner, admin, member, org } = await setup();
    const patch = (who: { accessToken: string }, userId: string, role: string) =>
      api
        .patch(`${BASE}/organizations/${org.id}/members/${userId}`)
        .set(bearer(who.accessToken))
        .send({ role });

    expectError(await patch(admin, member.user.id, "ADMIN"), 403, "INSUFFICIENT_ORGANIZATION_PERMISSION");
    expectError(await patch(member, member.user.id, "ADMIN"), 403, "INSUFFICIENT_ORGANIZATION_PERMISSION");
    expectError(await patch(owner, owner.user.id, "MEMBER"), 403, "CANNOT_CHANGE_OWNER_ROLE");
    expectError(await patch(owner, member.user.id, "OWNER"), 400, "VALIDATION_ERROR");
    expectError(await patch(owner, randomUUID(), "ADMIN"), 404, "MEMBERSHIP_NOT_FOUND");

    expect((await patch(owner, member.user.id, "ADMIN")).status).toBe(200);
    expect((await patch(owner, member.user.id, "ADMIN")).status).toBe(200); // no-op
    expect((await patch(owner, admin.user.id, "MEMBER")).status).toBe(200);
    expect(await prisma.organizationMembership.count({ where: { role: "OWNER" } })).toBe(1);
  });
});

describe("invitations", () => {
  it("stores only the token's hash, never the token", async () => {
    const owner = await signUp(ctx, "owner@example.com");
    const org = await createOrganization(ctx, owner);
    const token = await invite(ctx, owner, org.id, "new@example.com");

    const row = await prisma.organizationInvitation.findFirstOrThrow();
    expect(row.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it("does not create a user for an unregistered email", async () => {
    const owner = await signUp(ctx, "owner@example.com");
    const org = await createOrganization(ctx, owner);
    await invite(ctx, owner, org.id, "stranger@example.com");

    expect(await prisma.user.findUnique({ where: { email: "stranger@example.com" } })).toBeNull();
  });

  it("works for an invitee who registers after being invited", async () => {
    const owner = await signUp(ctx, "owner@example.com");
    const org = await createOrganization(ctx, owner);
    const token = await invite(ctx, owner, org.id, "late@example.com");

    const late = await signUp(ctx, "late@example.com");
    const res = await api
      .post(`${BASE}/organization-invitations/accept`)
      .set(bearer(late.accessToken))
      .send({ token });
    expect(res.status).toBe(200);
  });

  it("rejects a duplicate open invitation and an invitation to an existing member", async () => {
    const { owner, member, org } = await setup();
    const send = (email: string) =>
      api
        .post(`${BASE}/organizations/${org.id}/invitations`)
        .set(bearer(owner.accessToken))
        .send({ email });

    expect((await send("new@example.com")).status).toBe(201);
    expectError(await send("new@example.com"), 409, "INVITATION_ALREADY_EXISTS");
    expectError(await send("NEW@example.com"), 409, "INVITATION_ALREADY_EXISTS");
    expectError(await send("member@example.com"), 409, "MEMBERSHIP_ALREADY_EXISTS");
    expect(member.user.email).toBe("member@example.com");
  });

  it("cannot be accepted by someone else, and stays usable by the invitee", async () => {
    const owner = await signUp(ctx, "owner@example.com");
    const org = await createOrganization(ctx, owner);
    const token = await invite(ctx, owner, org.id, "invitee@example.com");
    const thief = await signUp(ctx, "thief@example.com");
    const invitee = await signUp(ctx, "invitee@example.com");
    const accept = (who: { accessToken: string }) =>
      api.post(`${BASE}/organization-invitations/accept`).set(bearer(who.accessToken)).send({ token });

    expectError(await accept(thief), 400, "INVALID_INVITATION");
    expect(await prisma.organizationMembership.count({ where: { userId: thief.user.id } })).toBe(0);
    expect((await accept(invitee)).status).toBe(200);
  });

  it("cannot be accepted twice", async () => {
    const owner = await signUp(ctx, "owner@example.com");
    const org = await createOrganization(ctx, owner);
    const token = await invite(ctx, owner, org.id, "invitee@example.com");
    const invitee = await signUp(ctx, "invitee@example.com");
    const accept = () =>
      api
        .post(`${BASE}/organization-invitations/accept`)
        .set(bearer(invitee.accessToken))
        .send({ token });

    expect((await accept()).status).toBe(200);
    expectError(await accept(), 400, "INVALID_INVITATION");
  });

  it("gives INVALID_INVITATION for an unknown token", async () => {
    const user = await signUp(ctx, "user@example.com");
    expectError(
      await api
        .post(`${BASE}/organization-invitations/accept`)
        .set(bearer(user.accessToken))
        .send({ token: "not-a-real-token" }),
      400,
      "INVALID_INVITATION",
    );
  });

  it("gives 410 INVITATION_EXPIRED to the invitee and lets the inviter issue a new one", async () => {
    const owner = await signUp(ctx, "owner@example.com");
    const org = await createOrganization(ctx, owner);
    const token = await invite(ctx, owner, org.id, "invitee@example.com");
    const invitee = await signUp(ctx, "invitee@example.com");
    await prisma.organizationInvitation.updateMany({ data: { expiresAt: new Date(Date.now() - 1_000) } });

    expectError(
      await api
        .post(`${BASE}/organization-invitations/accept`)
        .set(bearer(invitee.accessToken))
        .send({ token }),
      410,
      "INVITATION_EXPIRED",
    );
    expect(await prisma.organizationMembership.count({ where: { userId: invitee.user.id } })).toBe(0);

    const fresh = await invite(ctx, owner, org.id, "invitee@example.com");
    const res = await api
      .post(`${BASE}/organization-invitations/accept`)
      .set(bearer(invitee.accessToken))
      .send({ token: fresh });
    expect(res.status).toBe(200);
    expect(await prisma.organizationInvitation.count()).toBe(1);
  });
});

describe("validation", () => {
  it("rejects bad organization names with per-field details", async () => {
    const owner = await signUp(ctx, "owner@example.com");
    const create = (body: object) =>
      api.post(`${BASE}/organizations`).set(bearer(owner.accessToken)).send(body);

    for (const body of [{}, { name: "" }, { name: " a " }, { name: "x".repeat(101) }, { name: 5 }]) {
      const res = await create(body);
      expectError(res, 400, "VALIDATION_ERROR");
      expect(res.body.error.details).toHaveProperty("name");
    }
    expect(await prisma.organization.count()).toBe(0);
  });

  it("trims and collapses whitespace in the name", async () => {
    const owner = await signUp(ctx, "owner@example.com");
    const res = await api
      .post(`${BASE}/organizations`)
      .set(bearer(owner.accessToken))
      .send({ name: "  Acme    Technologies  " });
    expect(res.body.data.organization.name).toBe("Acme Technologies");
  });

  it("rejects non-UUID path parameters", async () => {
    const owner = await signUp(ctx, "owner@example.com");
    const res = await api.get(`${BASE}/organizations/not-a-uuid`).set(bearer(owner.accessToken));
    expectError(res, 400, "VALIDATION_ERROR");
    expect(res.body.error.details).toHaveProperty("organizationId");

    const org = await createOrganization(ctx, owner);
    const bad = await api
      .delete(`${BASE}/organizations/${org.id}/members/not-a-uuid`)
      .set(bearer(owner.accessToken));
    expectError(bad, 400, "VALIDATION_ERROR");
    expect(bad.body.error.details).toHaveProperty("userId");
  });

  it("rejects bad invitation and role-change bodies", async () => {
    const { owner, member, org } = await setup();
    const inviteBody = (body: object) =>
      api.post(`${BASE}/organizations/${org.id}/invitations`).set(bearer(owner.accessToken)).send(body);

    expectError(await inviteBody({}), 400, "VALIDATION_ERROR");
    expectError(await inviteBody({ email: "nope" }), 400, "VALIDATION_ERROR");
    expectError(await inviteBody({ email: "a@example.com", role: "SUPERUSER" }), 400, "VALIDATION_ERROR");

    const patch = (body: object) =>
      api
        .patch(`${BASE}/organizations/${org.id}/members/${member.user.id}`)
        .set(bearer(owner.accessToken))
        .send(body);
    expectError(await patch({}), 400, "VALIDATION_ERROR");
    expectError(await patch({ role: "OWNER" }), 400, "VALIDATION_ERROR");

    const accept = await api
      .post(`${BASE}/organization-invitations/accept`)
      .set(bearer(owner.accessToken))
      .send({});
    expectError(accept, 400, "VALIDATION_ERROR");
  });

  it("defaults the invited role to MEMBER", async () => {
    const owner = await signUp(ctx, "owner@example.com");
    const org = await createOrganization(ctx, owner);
    const res = await api
      .post(`${BASE}/organizations/${org.id}/invitations`)
      .set(bearer(owner.accessToken))
      .send({ email: "new@example.com" });
    expect(res.body.data.invitation.role).toBe("MEMBER");
  });
});

describe("authentication", () => {
  const id = randomUUID();
  const endpoints: Array<[string, string]> = [
    ["post", `${BASE}/organizations`],
    ["get", `${BASE}/organizations`],
    ["get", `${BASE}/organizations/${id}`],
    ["post", `${BASE}/organizations/${id}/invitations`],
    ["get", `${BASE}/organizations/${id}/members`],
    ["patch", `${BASE}/organizations/${id}/members/${id}`],
    ["delete", `${BASE}/organizations/${id}/members/${id}`],
    ["post", `${BASE}/organization-invitations/accept`],
  ];

  it.each(endpoints)("%s %s needs an access token", async (method, path) => {
    expectError(await (api as any)[method](path), 401, "UNAUTHORIZED");
  });

  it.each(endpoints)("%s %s rejects a garbage token", async (method, path) => {
    expectError(await (api as any)[method](path).set(bearer("garbage")), 401, "INVALID_ACCESS_TOKEN");
  });

  it("does not accept a refresh token as an access token", async () => {
    const user = await signUp(ctx, "user@example.com");
    expectError(
      await api.get(`${BASE}/organizations`).set(bearer(user.refreshToken)),
      401,
      "INVALID_ACCESS_TOKEN",
    );
  });
});

describe("existing behaviour is unchanged", () => {
  it("keeps the JWT free of organization data", async () => {
    const owner = await signUp(ctx, "owner@example.com");
    await createOrganization(ctx, owner);
    const relogin = await login(ctx, "owner@example.com");
    const payload = JSON.parse(
      Buffer.from(relogin.body.data.tokens.accessToken.split(".")[1], "base64url").toString(),
    );

    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "nbf", "role", "sub", "type"]);
    expect(payload.role).toBe("USER");
    expect(PASSWORD).toBeDefined();
  });
});
