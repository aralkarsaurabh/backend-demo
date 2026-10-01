import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { OrganizationRole } from "../../src/domain/enums/OrganizationRole";
import { NewOrganizationInvitation } from "../../src/domain/repositories/OrganizationInvitationRepository";
import { createPrismaClient } from "../../src/infrastructure/database/prisma";
import { PrismaOrganizationInvitationRepository } from "../../src/infrastructure/database/repositories/PrismaOrganizationInvitationRepository";
import { PrismaOrganizationMembershipRepository } from "../../src/infrastructure/database/repositories/PrismaOrganizationMembershipRepository";
import { PrismaOrganizationRepository } from "../../src/infrastructure/database/repositories/PrismaOrganizationRepository";
import { PrismaUserRepository } from "../../src/infrastructure/database/repositories/PrismaUserRepository";
import { AppError } from "../../src/shared/errors/AppError";
import { resetDatabase } from "../helpers/integration";

const { OWNER, ADMIN, MEMBER } = OrganizationRole;

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const users = new PrismaUserRepository(prisma);
const organizations = new PrismaOrganizationRepository(prisma);
const memberships = new PrismaOrganizationMembershipRepository(prisma);
const invitations = new PrismaOrganizationInvitationRepository(prisma);

beforeEach(() => resetDatabase(prisma));
afterAll(() => prisma.$disconnect());

const newUser = (email = "owner@example.com") =>
  users.create({ name: email.split("@")[0], email, passwordHash: "hash" });

const newOrg = async (slug = "acme") => {
  const owner = await newUser();
  const org = await organizations.createWithOwner({ name: "Acme", slug }, owner.id);
  return { owner, org: org! };
};

const newInvitation = (
  organizationId: string,
  invitedBy: string,
  overrides: Partial<NewOrganizationInvitation> = {},
): NewOrganizationInvitation => ({
  id: randomUUID(),
  organizationId,
  email: "invitee@example.com",
  role: MEMBER,
  tokenHash: randomUUID(),
  expiresAt: new Date(Date.now() + 60_000),
  invitedBy,
  ...overrides,
});

const code = async (promise: Promise<unknown>) =>
  promise.then(
    () => "NO ERROR",
    (e) => (e instanceof AppError ? e.code : `NON-APP ERROR: ${String(e)}`),
  );

describe("PrismaOrganizationRepository", () => {
  it("createWithOwner() creates the organization and an OWNER membership", async () => {
    const { owner, org } = await newOrg();

    expect(await organizations.findById(org.id)).toMatchObject({ slug: "acme", name: "Acme" });
    expect(await organizations.findBySlug("acme")).toMatchObject({ id: org.id });
    expect(await memberships.findByOrganizationAndUser(org.id, owner.id)).toMatchObject({
      role: OWNER,
    });
    expect(await organizations.findById(randomUUID())).toBeNull();
  });

  it("createWithOwner() is atomic: a failing membership insert leaves no organization behind", async () => {
    // The owner does not exist, so the membership insert violates its foreign key.
    await expect(
      organizations.createWithOwner({ name: "Ghost", slug: "ghost" }, randomUUID()),
    ).rejects.toBeDefined();

    expect(await prisma.organization.count()).toBe(0);
    expect(await prisma.organizationMembership.count()).toBe(0);
  });

  it("createWithOwner() returns null for a taken slug and changes nothing", async () => {
    const { owner } = await newOrg("taken");
    const other = await newUser("other@example.com");

    expect(await organizations.createWithOwner({ name: "Again", slug: "taken" }, other.id)).toBeNull();
    expect(await prisma.organization.count()).toBe(1);
    expect(await prisma.organizationMembership.count()).toBe(1);
    expect(await memberships.findByOrganizationAndUser((await organizations.findBySlug("taken"))!.id, owner.id)).not.toBeNull();
  });

  it("listByUserId() returns the user's organizations with their role, oldest first", async () => {
    const { owner, org } = await newOrg("first");
    const second = await organizations.createWithOwner({ name: "Second", slug: "second" }, owner.id);
    const stranger = await newUser("stranger@example.com");
    await organizations.createWithOwner({ name: "Theirs", slug: "theirs" }, stranger.id);

    const list = await organizations.listByUserId(owner.id);
    expect(list.map((i) => [i.organization.id, i.role])).toEqual([
      [org.id, OWNER],
      [second!.id, OWNER],
    ]);
  });
});

describe("OrganizationMembership constraints", () => {
  it("allows only one OWNER per organization (partial unique index)", async () => {
    const { org } = await newOrg();
    const other = await newUser("other@example.com");

    await expect(
      prisma.organizationMembership.create({
        data: { organizationId: org.id, userId: other.id, role: OWNER },
      }),
    ).rejects.toBeDefined();

    // ...while any number of non-owners is fine.
    await prisma.organizationMembership.create({
      data: { organizationId: org.id, userId: other.id, role: ADMIN },
    });
    expect(await prisma.organizationMembership.count({ where: { role: OWNER } })).toBe(1);
  });

  it("allows one membership per user per organization", async () => {
    const { org, owner } = await newOrg();
    await expect(
      prisma.organizationMembership.create({
        data: { organizationId: org.id, userId: owner.id, role: MEMBER },
      }),
    ).rejects.toBeDefined();
  });
});

describe("PrismaOrganizationMembershipRepository", () => {
  const addMember = async (organizationId: string, email: string, role: OrganizationRole) => {
    const user = await newUser(email);
    await prisma.organizationMembership.create({ data: { organizationId, userId: user.id, role } });
    return user;
  };

  it("lists members with their user fields, oldest first", async () => {
    const { org } = await newOrg();
    await addMember(org.id, "member@example.com", MEMBER);

    const members = await memberships.listByOrganization(org.id);
    expect(members.map((m) => [m.email, m.role])).toEqual([
      ["owner@example.com", OWNER],
      ["member@example.com", MEMBER],
    ]);
  });

  it("updateRole() changes a non-owner's role", async () => {
    const { org } = await newOrg();
    const member = await addMember(org.id, "member@example.com", MEMBER);

    expect(await memberships.updateRole(org.id, member.id, ADMIN)).toBe(true);
    expect((await memberships.findByOrganizationAndUser(org.id, member.id))!.role).toBe(ADMIN);
  });

  it("updateRole() never touches an OWNER row", async () => {
    const { org, owner } = await newOrg();

    expect(await memberships.updateRole(org.id, owner.id, MEMBER)).toBe(false);
    expect((await memberships.findByOrganizationAndUser(org.id, owner.id))!.role).toBe(OWNER);
    expect(await memberships.updateRole(org.id, randomUUID(), ADMIN)).toBe(false);
  });

  it("remove() deletes a non-owner", async () => {
    const { org } = await newOrg();
    const member = await addMember(org.id, "member@example.com", MEMBER);

    expect(await memberships.remove(org.id, member.id)).toBe(true);
    expect(await memberships.findByOrganizationAndUser(org.id, member.id)).toBeNull();
  });

  it("remove() never touches an OWNER row", async () => {
    const { org, owner } = await newOrg();

    expect(await memberships.remove(org.id, owner.id)).toBe(false);
    expect(await memberships.findByOrganizationAndUser(org.id, owner.id)).not.toBeNull();
  });
});

describe("PrismaOrganizationInvitationRepository.create()", () => {
  it("stores the invitation and finds it by token hash", async () => {
    const { org, owner } = await newOrg();
    const data = newInvitation(org.id, owner.id);
    await invitations.create(data);

    expect(await invitations.findByTokenHash(data.tokenHash)).toMatchObject({
      id: data.id,
      email: "invitee@example.com",
      role: MEMBER,
      acceptedAt: null,
    });
    expect(await invitations.findByTokenHash("unknown")).toBeNull();
  });

  it("rejects a second open invitation for the same organization and email", async () => {
    const { org, owner } = await newOrg();
    await invitations.create(newInvitation(org.id, owner.id));

    expect(await code(invitations.create(newInvitation(org.id, owner.id)))).toBe(
      "INVITATION_ALREADY_EXISTS",
    );
    expect(await prisma.organizationInvitation.count()).toBe(1);
  });

  it("allows the same email in a different organization", async () => {
    const { org, owner } = await newOrg();
    const other = await organizations.createWithOwner({ name: "Other", slug: "other" }, owner.id);
    await invitations.create(newInvitation(org.id, owner.id));

    expect(await code(invitations.create(newInvitation(other!.id, owner.id)))).toBe("NO ERROR");
  });

  it("replaces an expired unaccepted invitation", async () => {
    const { org, owner } = await newOrg();
    const stale = newInvitation(org.id, owner.id, { expiresAt: new Date(Date.now() - 1_000) });
    await invitations.create(stale);

    const fresh = newInvitation(org.id, owner.id);
    expect(await code(invitations.create(fresh))).toBe("NO ERROR");
    expect(await invitations.findByTokenHash(stale.tokenHash)).toBeNull();
    expect(await invitations.findByTokenHash(fresh.tokenHash)).not.toBeNull();
  });

  it("allows a new invitation after the earlier one was accepted", async () => {
    const { org, owner } = await newOrg();
    const invitee = await newUser("invitee@example.com");
    const first = newInvitation(org.id, owner.id);
    await invitations.create(first);
    await invitations.accept((await invitations.findByTokenHash(first.tokenHash))!, invitee.id, new Date());

    expect(await code(invitations.create(newInvitation(org.id, owner.id)))).toBe("NO ERROR");
  });
});

describe("PrismaOrganizationInvitationRepository.accept()", () => {
  it("marks the invitation accepted and creates the membership with the invited role", async () => {
    const { org, owner } = await newOrg();
    const invitee = await newUser("invitee@example.com");
    const data = newInvitation(org.id, owner.id, { role: ADMIN });
    await invitations.create(data);

    const now = new Date();
    expect(
      await invitations.accept((await invitations.findByTokenHash(data.tokenHash))!, invitee.id, now),
    ).toBe(true);

    expect((await invitations.findByTokenHash(data.tokenHash))!.acceptedAt).toEqual(now);
    expect(await memberships.findByOrganizationAndUser(org.id, invitee.id)).toMatchObject({
      role: ADMIN,
    });
  });

  it("lets exactly one of two simultaneous accepts win", async () => {
    const { org, owner } = await newOrg();
    const a = await newUser("a@example.com");
    const b = await newUser("b@example.com");
    const data = newInvitation(org.id, owner.id);
    await invitations.create(data);
    const invitation = (await invitations.findByTokenHash(data.tokenHash))!;

    const results = await Promise.all([
      invitations.accept(invitation, a.id, new Date()),
      invitations.accept(invitation, b.id, new Date()),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    // The owner plus the single winner.
    expect(await prisma.organizationMembership.count({ where: { organizationId: org.id } })).toBe(2);
  });

  it("refuses an expired invitation and creates no membership", async () => {
    const { org, owner } = await newOrg();
    const invitee = await newUser("invitee@example.com");
    const data = newInvitation(org.id, owner.id, { expiresAt: new Date(Date.now() + 1_000) });
    await invitations.create(data);
    const invitation = (await invitations.findByTokenHash(data.tokenHash))!;

    expect(await invitations.accept(invitation, invitee.id, new Date(Date.now() + 5_000))).toBe(false);
    expect(await memberships.findByOrganizationAndUser(org.id, invitee.id)).toBeNull();
    expect((await invitations.findByTokenHash(data.tokenHash))!.acceptedAt).toBeNull();
  });

  it("rolls back the acceptance if the membership already exists", async () => {
    const { org, owner } = await newOrg();
    const invitee = await newUser("invitee@example.com");
    await prisma.organizationMembership.create({
      data: { organizationId: org.id, userId: invitee.id, role: MEMBER },
    });
    const data = newInvitation(org.id, owner.id);
    await invitations.create(data);
    const invitation = (await invitations.findByTokenHash(data.tokenHash))!;

    expect(await code(invitations.accept(invitation, invitee.id, new Date()))).toBe(
      "MEMBERSHIP_ALREADY_EXISTS",
    );
    expect((await invitations.findByTokenHash(data.tokenHash))!.acceptedAt).toBeNull();
  });

  it("never lets an invitation create a second OWNER", async () => {
    const { org, owner } = await newOrg();
    const invitee = await newUser("invitee@example.com");
    const data = newInvitation(org.id, owner.id, { role: OWNER });
    await invitations.create(data);
    const invitation = (await invitations.findByTokenHash(data.tokenHash))!;

    await expect(invitations.accept(invitation, invitee.id, new Date())).rejects.toBeDefined();
    expect(await prisma.organizationMembership.count({ where: { role: OWNER } })).toBe(1);
    expect((await invitations.findByTokenHash(data.tokenHash))!.acceptedAt).toBeNull();
  });
});
