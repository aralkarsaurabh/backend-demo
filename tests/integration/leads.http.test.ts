import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  bearer,
  buildIntegrationApp,
  createLead,
  createOrganization,
  joinOrganization,
  resetDatabase,
  signUp,
} from "../helpers/integration";

const ctx = buildIntegrationApp();
const { api, prisma } = ctx;

beforeEach(() => resetDatabase(prisma));
afterAll(() => prisma.$disconnect());

const BASE = "/api/v1";
const path = (orgId: string, leadId?: string, suffix = "") =>
  `${BASE}/organizations/${orgId}/leads${leadId ? `/${leadId}` : ""}${suffix}`;

function expectEnvelope(body: any, success: boolean) {
  expect(Object.keys(body).sort()).toEqual(["data", "error", "message", "meta", "success"]);
  expect(body.success).toBe(success);
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

/** Organization A (owner, admin, member) and organization B with its own owner. */
async function setup() {
  const owner = await signUp(ctx, "owner@example.com");
  const org = await createOrganization(ctx, owner, "Org A");
  const admin = await joinOrganization(ctx, owner, org.id, "admin@example.com", "ADMIN");
  const member = await joinOrganization(ctx, owner, org.id, "member@example.com", "MEMBER");
  const otherOwner = await signUp(ctx, "other@example.com");
  const otherOrg = await createOrganization(ctx, otherOwner, "Org B");
  return { owner, admin, member, org, otherOwner, otherOrg };
}

describe("POST /organizations/:organizationId/leads", () => {
  it("creates a NEW unassigned lead for every organization role", async () => {
    const { owner, admin, member, org } = await setup();
    for (const actor of [owner, admin, member]) {
      const res = await api
        .post(path(org.id))
        .set(bearer(actor.accessToken))
        .send({
          name: "Rahul Sharma",
          email: "rahul@example.com",
          phone: "+919876543210",
          company: "ABC Technologies",
          source: "WEBSITE",
          notes: "Interested in enterprise plan",
        });
      expect(res.status).toBe(201);
      expectEnvelope(res.body, true);
      expect(res.body.message).toBe("Lead created successfully.");
      expect(res.body.data.lead).toMatchObject({
        name: "Rahul Sharma",
        source: "WEBSITE",
        status: "NEW",
        assignedToUserId: null,
        convertedAt: null,
        convertedCustomerId: null,
      });
      expect(res.body.data.lead).not.toHaveProperty("organizationId");
    }
  });

  it("rejects invalid bodies and fields the server owns with 400 VALIDATION_ERROR", async () => {
    const { owner, org } = await setup();
    for (const body of [
      {},
      { name: "" },
      { name: "A", email: "nope" },
      { name: "A", source: "TELEPATHY" },
      { name: "A", organizationId: randomUUID() },
      { name: "A", status: "QUALIFIED" },
      { name: "A", assignedToUserId: randomUUID() },
    ]) {
      const res = await api.post(path(org.id)).set(bearer(owner.accessToken)).send(body);
      expectError(res, 400, "VALIDATION_ERROR");
    }
  });

  it("is 401 without a token, and 404 ORGANIZATION_NOT_FOUND for a non-member", async () => {
    const { otherOwner, org } = await setup();
    expectError(await api.post(path(org.id)).send({ name: "A" }), 401, "UNAUTHORIZED");
    expectError(
      await api.post(path(org.id)).set(bearer(otherOwner.accessToken)).send({ name: "A" }),
      404,
      "ORGANIZATION_NOT_FOUND",
    );
  });
});

describe("GET /organizations/:organizationId/leads", () => {
  it("lists the organization's leads with pagination and without notes", async () => {
    const { owner, member, org, otherOwner, otherOrg } = await setup();
    await createLead(ctx, owner, org, { name: "One", notes: "secret" });
    await createLead(ctx, member, org, { name: "Two" });
    await createLead(ctx, otherOwner, otherOrg, { name: "Elsewhere" });

    const res = await api.get(path(org.id)).query({ limit: 1 }).set(bearer(member.accessToken));
    expect(res.status).toBe(200);
    expectEnvelope(res.body, true);
    expect(res.body.data.leads).toHaveLength(1);
    expect(res.body.data.leads[0]).not.toHaveProperty("notes");
    expect(res.body.data.pagination).toEqual({
      page: 1,
      limit: 1,
      totalItems: 2,
      totalPages: 2,
      hasNextPage: true,
      hasPreviousPage: false,
    });
  });

  it("filters by status, source and assignee, and searches", async () => {
    const { owner, member, org } = await setup();
    const rahul = await createLead(ctx, owner, org, { name: "Rahul", source: "WEBSITE" });
    const priya = await createLead(ctx, owner, org, { name: "Priya", company: "Globex", source: "REFERRAL" });
    await api
      .patch(path(org.id, priya.id))
      .set(bearer(owner.accessToken))
      .send({ status: "QUALIFIED", assignedToUserId: member.user.id });

    const names = async (query: Record<string, string>) =>
      (await api.get(path(org.id)).query(query).set(bearer(owner.accessToken))).body.data.leads.map(
        (l: { name: string }) => l.name,
      );

    expect(await names({ status: "QUALIFIED" })).toEqual(["Priya"]);
    expect(await names({ source: "WEBSITE" })).toEqual(["Rahul"]);
    expect(await names({ assignedToUserId: member.user.id })).toEqual(["Priya"]);
    expect(await names({ search: "globex" })).toEqual(["Priya"]);
    expect(await names({ createdFrom: "2999-01-01" })).toEqual([]);
    expect(rahul.status).toBe("NEW");
  });

  it("rejects bad queries with 400 VALIDATION_ERROR", async () => {
    const { owner, org } = await setup();
    for (const query of [{ limit: "101" }, { sortBy: "password" }, { status: "CLOSED" }, { nope: "1" }]) {
      expectError(await api.get(path(org.id)).query(query).set(bearer(owner.accessToken)), 400, "VALIDATION_ERROR");
    }
  });
});

describe("GET /organizations/:organizationId/leads/:leadId", () => {
  it("returns the lead with its notes", async () => {
    const { member, org } = await setup();
    const lead = await createLead(ctx, member, org, { name: "Rahul", notes: "Hot" });
    const res = await api.get(path(org.id, lead.id)).set(bearer(member.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.lead).toMatchObject({ id: lead.id, notes: "Hot" });
  });

  it("is 404 LEAD_NOT_FOUND for an unknown id and 400 for a malformed one", async () => {
    const { owner, org } = await setup();
    expectError(await api.get(path(org.id, randomUUID())).set(bearer(owner.accessToken)), 404, "LEAD_NOT_FOUND");
    expectError(await api.get(path(org.id, "abc")).set(bearer(owner.accessToken)), 400, "VALIDATION_ERROR");
  });
});

describe("PATCH /organizations/:organizationId/leads/:leadId", () => {
  it("updates business data, status and assignment", async () => {
    const { member, org, owner } = await setup();
    const lead = await createLead(ctx, member, org, { name: "Rahul" });
    const res = await api
      .patch(path(org.id, lead.id))
      .set(bearer(member.accessToken))
      .send({ name: "Rahul S", status: "QUALIFIED", assignedToUserId: owner.user.id, notes: "Demo scheduled" });

    expect(res.status).toBe(200);
    expect(res.body.data.lead).toMatchObject({
      name: "Rahul S",
      status: "QUALIFIED",
      assignedToUserId: owner.user.id,
      notes: "Demo scheduled",
    });
    const unassigned = await api
      .patch(path(org.id, lead.id))
      .set(bearer(member.accessToken))
      .send({ assignedToUserId: null });
    expect(unassigned.body.data.lead.assignedToUserId).toBeNull();
  });

  it("rejects CONVERTED as a status, an empty body and unknown fields", async () => {
    const { owner, org } = await setup();
    const lead = await createLead(ctx, owner, org);
    for (const body of [{ status: "CONVERTED" }, {}, { organizationId: randomUUID() }, { convertedAt: null }]) {
      expectError(
        await api.patch(path(org.id, lead.id)).set(bearer(owner.accessToken)).send(body),
        400,
        "VALIDATION_ERROR",
      );
    }
  });

  it("is 400 ASSIGNED_USER_NOT_MEMBER for a user outside the organization", async () => {
    const { owner, org, otherOwner } = await setup();
    const lead = await createLead(ctx, owner, org);
    for (const userId of [otherOwner.user.id, randomUUID()]) {
      expectError(
        await api.patch(path(org.id, lead.id)).set(bearer(owner.accessToken)).send({ assignedToUserId: userId }),
        400,
        "ASSIGNED_USER_NOT_MEMBER",
      );
    }
    const fetched = await api.get(path(org.id, lead.id)).set(bearer(owner.accessToken));
    expect(fetched.body.data.lead.assignedToUserId).toBeNull();
  });

  it("is 409 LEAD_ALREADY_CONVERTED for a converted lead", async () => {
    const { owner, org } = await setup();
    const lead = await createLead(ctx, owner, org);
    await api.post(path(org.id, lead.id, "/convert")).set(bearer(owner.accessToken));
    expectError(
      await api.patch(path(org.id, lead.id)).set(bearer(owner.accessToken)).send({ name: "Changed" }),
      409,
      "LEAD_ALREADY_CONVERTED",
    );
  });
});

describe("DELETE /organizations/:organizationId/leads/:leadId", () => {
  it("lets OWNER and ADMIN delete, then the lead is gone", async () => {
    const { owner, admin, org } = await setup();
    for (const actor of [owner, admin]) {
      const lead = await createLead(ctx, actor, org);
      const res = await api.delete(path(org.id, lead.id)).set(bearer(actor.accessToken));
      expect(res.status).toBe(200);
      expectEnvelope(res.body, true);
      expect(res.body.data).toBeNull();
      expectError(await api.get(path(org.id, lead.id)).set(bearer(actor.accessToken)), 404, "LEAD_NOT_FOUND");
    }
  });

  it("is 403 for a MEMBER, who can still see the lead afterwards", async () => {
    const { member, org } = await setup();
    const lead = await createLead(ctx, member, org);
    expectError(
      await api.delete(path(org.id, lead.id)).set(bearer(member.accessToken)),
      403,
      "INSUFFICIENT_ORGANIZATION_PERMISSION",
    );
    expect((await api.get(path(org.id, lead.id)).set(bearer(member.accessToken))).status).toBe(200);
  });

  it("is 404 LEAD_NOT_FOUND for an unknown lead", async () => {
    const { owner, org } = await setup();
    expectError(await api.delete(path(org.id, randomUUID())).set(bearer(owner.accessToken)), 404, "LEAD_NOT_FOUND");
  });
});

describe("POST /organizations/:organizationId/leads/:leadId/convert", () => {
  it("creates the customer, marks the lead converted and links them, for every role", async () => {
    const { owner, admin, member, org } = await setup();
    for (const actor of [owner, admin, member]) {
      const lead = await createLead(ctx, actor, org, {
        name: "Rahul Sharma",
        email: "rahul@example.com",
        company: "ABC Technologies",
        notes: "Interested",
      });
      const res = await api.post(path(org.id, lead.id, "/convert")).set(bearer(actor.accessToken));

      expect(res.status).toBe(200);
      expectEnvelope(res.body, true);
      expect(res.body.message).toBe("Lead converted successfully.");
      expect(res.body.data.lead).toMatchObject({
        id: lead.id,
        status: "CONVERTED",
        convertedCustomerId: res.body.data.customer.id,
        convertedAt: expect.any(String),
      });
      expect(res.body.data.customer).toMatchObject({
        name: "Rahul Sharma",
        email: "rahul@example.com",
        company: "ABC Technologies",
        notes: "Interested",
      });

      const row = await prisma.customer.findUnique({ where: { id: res.body.data.customer.id } });
      expect(row?.organizationId).toBe(org.id);
    }
  });

  it("is 409 the second time and creates only one customer", async () => {
    const { owner, org } = await setup();
    const lead = await createLead(ctx, owner, org);
    await api.post(path(org.id, lead.id, "/convert")).set(bearer(owner.accessToken));
    expectError(
      await api.post(path(org.id, lead.id, "/convert")).set(bearer(owner.accessToken)),
      409,
      "LEAD_ALREADY_CONVERTED",
    );
    expect(await prisma.customer.count({ where: { organizationId: org.id } })).toBe(1);
  });

  it("two simultaneous conversions create exactly one customer", async () => {
    const { owner, org } = await setup();
    const lead = await createLead(ctx, owner, org);
    const results = await Promise.all([
      api.post(path(org.id, lead.id, "/convert")).set(bearer(owner.accessToken)),
      api.post(path(org.id, lead.id, "/convert")).set(bearer(owner.accessToken)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.customer.count({ where: { organizationId: org.id } })).toBe(1);
  });

  it("a converted lead can be deleted, and the customer stays", async () => {
    const { owner, org } = await setup();
    const lead = await createLead(ctx, owner, org);
    await api.post(path(org.id, lead.id, "/convert")).set(bearer(owner.accessToken));
    expect((await api.delete(path(org.id, lead.id)).set(bearer(owner.accessToken))).status).toBe(200);
    expect(await prisma.customer.count({ where: { organizationId: org.id } })).toBe(1);
  });

  it("deleting the customer leaves the lead CONVERTED with no customer link", async () => {
    const { owner, org } = await setup();
    const lead = await createLead(ctx, owner, org);
    const res = await api.post(path(org.id, lead.id, "/convert")).set(bearer(owner.accessToken));
    await api
      .delete(`${BASE}/organizations/${org.id}/customers/${res.body.data.customer.id}`)
      .set(bearer(owner.accessToken));

    const fetched = await api.get(path(org.id, lead.id)).set(bearer(owner.accessToken));
    expect(fetched.body.data.lead).toMatchObject({ status: "CONVERTED", convertedCustomerId: null });
  });

  it("rejects a body with 400", async () => {
    const { owner, org } = await setup();
    const lead = await createLead(ctx, owner, org);
    expectError(
      await api.post(path(org.id, lead.id, "/convert")).set(bearer(owner.accessToken)).send({ status: "LOST" }),
      400,
      "VALIDATION_ERROR",
    );
  });
});

describe("tenant isolation and membership", () => {
  it("an owner of organization B cannot reach organization A's leads, in any way", async () => {
    const { owner, org, otherOwner, otherOrg } = await setup();
    const lead = await createLead(ctx, owner, org, { name: "Rahul" });
    const token = bearer(otherOwner.accessToken);

    // Through organization A: not a member.
    for (const res of [
      await api.get(path(org.id)).set(token),
      await api.get(path(org.id, lead.id)).set(token),
      await api.patch(path(org.id, lead.id)).set(token).send({ name: "Hacked" }),
      await api.delete(path(org.id, lead.id)).set(token),
      await api.post(path(org.id, lead.id, "/convert")).set(token),
    ]) {
      expectError(res, 404, "ORGANIZATION_NOT_FOUND");
    }

    // Through their own organization with A's lead id: the lead is simply not found.
    expectError(await api.get(path(otherOrg.id, lead.id)).set(token), 404, "LEAD_NOT_FOUND");
    expectError(
      await api.patch(path(otherOrg.id, lead.id)).set(token).send({ name: "Hacked" }),
      404,
      "LEAD_NOT_FOUND",
    );
    expectError(await api.delete(path(otherOrg.id, lead.id)).set(token), 404, "LEAD_NOT_FOUND");
    expectError(await api.post(path(otherOrg.id, lead.id, "/convert")).set(token), 404, "LEAD_NOT_FOUND");

    const row = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(row).toMatchObject({ organizationId: org.id, name: "Rahul", status: "NEW" });
    expect(await prisma.customer.count()).toBe(0);
  });

  it("organization A cannot assign its lead to a member of organization B", async () => {
    const { owner, org, otherOwner } = await setup();
    const lead = await createLead(ctx, owner, org);
    expectError(
      await api
        .patch(path(org.id, lead.id))
        .set(bearer(owner.accessToken))
        .send({ assignedToUserId: otherOwner.user.id }),
      400,
      "ASSIGNED_USER_NOT_MEMBER",
    );
  });

  it("a platform ADMIN who is not a member gets 404 (D10)", async () => {
    const { org } = await setup();
    const admin = await signUp(ctx, "platform-admin@example.com");
    await prisma.user.update({ where: { id: admin.user.id }, data: { role: "ADMIN" } });
    const login = await api
      .post(`${BASE}/auth/login`)
      .send({ email: "platform-admin@example.com", password: "StrongPass123!" });
    expectError(
      await api.get(path(org.id)).set(bearer(login.body.data.tokens.accessToken)),
      404,
      "ORGANIZATION_NOT_FOUND",
    );
  });
});
