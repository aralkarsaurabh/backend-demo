import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  bearer,
  buildIntegrationApp,
  createCustomer,
  createOrganization,
  joinOrganization,
  login,
  resetDatabase,
  signUp,
} from "../helpers/integration";

const ctx = buildIntegrationApp();
const { api, prisma } = ctx;

beforeEach(() => resetDatabase(prisma));
afterAll(() => prisma.$disconnect());

const BASE = "/api/v1";
const path = (orgId: string, customerId?: string) =>
  `${BASE}/organizations/${orgId}/customers${customerId ? `/${customerId}` : ""}`;

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

describe("POST /organizations/:organizationId/customers", () => {
  it("creates a customer and returns it in the envelope", async () => {
    const { owner, org } = await setup();
    const res = await api.post(path(org.id)).set(bearer(owner.accessToken)).send({
      name: "Acme Technologies",
      email: "contact@acme.com",
      phone: "+911234567890",
      company: "Acme Technologies",
      notes: "Enterprise customer",
    });

    expect(res.status).toBe(201);
    expectEnvelope(res.body, true);
    expect(res.body.message).toBe("Customer created successfully.");
    expect(res.body.data.customer).toEqual({
      id: expect.any(String),
      name: "Acme Technologies",
      email: "contact@acme.com",
      phone: "+911234567890",
      company: "Acme Technologies",
      notes: "Enterprise customer",
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    const row = await prisma.customer.findUniqueOrThrow({ where: { id: res.body.data.customer.id } });
    expect(row.organizationId).toBe(org.id);
  });

  it("allows OWNER, ADMIN and MEMBER to create", async () => {
    const { owner, admin, member, org } = await setup();
    for (const who of [owner, admin, member]) {
      const res = await api.post(path(org.id)).set(bearer(who.accessToken)).send({ name: "C" });
      expect(res.status).toBe(201);
    }
  });

  it("trims, collapses spaces in the name and lowercases the email", async () => {
    const { owner, org } = await setup();
    const res = await api
      .post(path(org.id))
      .set(bearer(owner.accessToken))
      .send({ name: "  Acme   Technologies ", email: " Contact@ACME.com ", company: "  Acme " });
    expect(res.body.data.customer).toMatchObject({
      name: "Acme Technologies",
      email: "contact@acme.com",
      company: "Acme",
    });
  });

  it("returns null for omitted optional fields", async () => {
    const { owner, org } = await setup();
    const res = await api.post(path(org.id)).set(bearer(owner.accessToken)).send({ name: "Acme" });
    expect(res.body.data.customer).toMatchObject({ email: null, phone: null, company: null, notes: null });
  });

  it.each([
    ["missing name", {}],
    ["empty name", { name: "   " }],
    ["name too long", { name: "x".repeat(101) }],
    ["bad email", { name: "A", email: "nope" }],
    ["empty email", { name: "A", email: "" }],
    ["phone too long", { name: "A", phone: "1".repeat(31) }],
    ["company too long", { name: "A", company: "c".repeat(151) }],
    ["notes too long", { name: "A", notes: "n".repeat(1001) }],
    ["name not a string", { name: 5 }],
  ])("rejects %s with VALIDATION_ERROR", async (_label, body) => {
    const { owner, org } = await setup();
    const res = await api.post(path(org.id)).set(bearer(owner.accessToken)).send(body);
    expectError(res, 400, "VALIDATION_ERROR");
    expect(await prisma.customer.count()).toBe(0);
  });

  it.each(["organizationId", "id", "createdAt", "updatedAt", "extra"])(
    "rejects the unknown or server-owned field %s",
    async (field) => {
      const { owner, org, otherOrg } = await setup();
      const res = await api
        .post(path(org.id))
        .set(bearer(owner.accessToken))
        .send({ name: "A", [field]: field === "organizationId" ? otherOrg.id : "x" });
      expectError(res, 400, "VALIDATION_ERROR");
      expect(res.body.error.details).toBeDefined();
      expect(await prisma.customer.count()).toBe(0);
    },
  );

  it("rejects a malformed organization id", async () => {
    const { owner } = await setup();
    const res = await api.post(path("not-a-uuid")).set(bearer(owner.accessToken)).send({ name: "A" });
    expectError(res, 400, "VALIDATION_ERROR");
  });

  it("requires a token", async () => {
    const { org } = await setup();
    expectError(await api.post(path(org.id)).send({ name: "A" }), 401, "UNAUTHORIZED");
  });

  it("is ORGANIZATION_NOT_FOUND for a non-member, and nothing is created", async () => {
    const { otherOwner, org } = await setup();
    const res = await api.post(path(org.id)).set(bearer(otherOwner.accessToken)).send({ name: "A" });
    expectError(res, 404, "ORGANIZATION_NOT_FOUND");
    expect(await prisma.customer.count()).toBe(0);
  });

  it("gives a platform ADMIN who is not a member no access (D10)", async () => {
    const { org } = await setup();
    const staff = await signUp(ctx, "staff@example.com");
    await prisma.user.update({ where: { id: staff.user.id }, data: { role: "ADMIN" } });
    const token = (await login(ctx, "staff@example.com")).body.data.tokens.accessToken as string;
    const res = await api.post(path(org.id)).set(bearer(token)).send({ name: "A" });
    expectError(res, 404, "ORGANIZATION_NOT_FOUND");
  });
});

describe("GET /organizations/:organizationId/customers/:customerId", () => {
  it("returns the full customer, including notes, to any member", async () => {
    const { owner, member, org } = await setup();
    const created = await createCustomer(ctx, owner, org, { name: "Acme", notes: "VIP", company: "Acme" });

    const res = await api.get(path(org.id, created.id)).set(bearer(member.accessToken));
    expect(res.status).toBe(200);
    expectEnvelope(res.body, true);
    expect(res.body.message).toBe("Customer retrieved successfully.");
    expect(res.body.data.customer).toEqual(created);
    expect(res.body.data.customer.notes).toBe("VIP");
  });

  it("is CUSTOMER_NOT_FOUND for an unknown id", async () => {
    const { owner, org } = await setup();
    expectError(
      await api.get(path(org.id, randomUUID())).set(bearer(owner.accessToken)),
      404,
      "CUSTOMER_NOT_FOUND",
    );
  });

  it("rejects a malformed customer id", async () => {
    const { owner, org } = await setup();
    expectError(
      await api.get(path(org.id, "nope")).set(bearer(owner.accessToken)),
      400,
      "VALIDATION_ERROR",
    );
  });

  it("isolates organizations: B's owner cannot read A's customer by any route", async () => {
    const { owner, org, otherOwner, otherOrg } = await setup();
    const created = await createCustomer(ctx, owner, org, { name: "Secret" });

    // through their own organization: the customer is not theirs
    expectError(
      await api.get(path(otherOrg.id, created.id)).set(bearer(otherOwner.accessToken)),
      404,
      "CUSTOMER_NOT_FOUND",
    );
    // through A's organization: they are not a member
    expectError(
      await api.get(path(org.id, created.id)).set(bearer(otherOwner.accessToken)),
      404,
      "ORGANIZATION_NOT_FOUND",
    );
  });

  it("requires a token", async () => {
    const { owner, org } = await setup();
    const created = await createCustomer(ctx, owner, org);
    expectError(await api.get(path(org.id, created.id)), 401, "UNAUTHORIZED");
  });
});
