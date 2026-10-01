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

describe("GET /organizations/:organizationId/customers", () => {
  const list = (token: string, orgId: string, query = "") =>
    api.get(`${path(orgId)}${query}`).set(bearer(token));

  it("returns the first page, newest first, with pagination and without notes", async () => {
    const { owner, member, org } = await setup();
    for (const name of ["First", "Second", "Third"]) {
      await createCustomer(ctx, owner, org, { name, notes: "private", company: "Acme" });
    }

    const res = await list(member.accessToken, org.id);
    expect(res.status).toBe(200);
    expectEnvelope(res.body, true);
    expect(res.body.message).toBe("Customers retrieved successfully.");
    expect(res.body.data.customers.map((c: any) => c.name)).toEqual(["Third", "Second", "First"]);
    expect(res.body.data.customers[0]).toEqual({
      id: expect.any(String),
      name: "Third",
      email: null,
      phone: null,
      company: "Acme",
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(res.body.data.pagination).toEqual({
      page: 1, limit: 20, totalItems: 3, totalPages: 1, hasNextPage: false, hasPreviousPage: false,
    });
  });

  it("returns an empty list for an organization with no customers", async () => {
    const { owner, org } = await setup();
    const res = await list(owner.accessToken, org.id);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      customers: [],
      pagination: { page: 1, limit: 20, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    });
  });

  it("pages through every customer once", async () => {
    const { owner, org } = await setup();
    for (let i = 1; i <= 5; i++) await createCustomer(ctx, owner, org, { name: `C${i}` });

    const seen: string[] = [];
    for (const page of [1, 2, 3]) {
      const res = await list(owner.accessToken, org.id, `?page=${page}&limit=2`);
      seen.push(...res.body.data.customers.map((c: any) => c.name));
      expect(res.body.data.pagination).toMatchObject({
        page, limit: 2, totalItems: 5, totalPages: 3, hasNextPage: page < 3, hasPreviousPage: page > 1,
      });
    }
    expect([...seen].sort()).toEqual(["C1", "C2", "C3", "C4", "C5"]);
  });

  it("searches, filters by company and combines them", async () => {
    const { owner, org } = await setup();
    await createCustomer(ctx, owner, org, { name: "Acme North", company: "Acme", email: "n@x.io" });
    await createCustomer(ctx, owner, org, { name: "Acme South", company: "Other" });
    await createCustomer(ctx, owner, org, { name: "Beta", company: "Acme", phone: "555" });

    const names = (res: any) => res.body.data.customers.map((c: any) => c.name).sort();
    expect(names(await list(owner.accessToken, org.id, "?search=ACME"))).toEqual(["Acme North", "Acme South", "Beta"]);
    expect(names(await list(owner.accessToken, org.id, "?search=555"))).toEqual(["Beta"]);
    expect(names(await list(owner.accessToken, org.id, "?company=acme"))).toEqual(["Acme North", "Beta"]);
    expect(names(await list(owner.accessToken, org.id, "?search=north&company=acme"))).toEqual(["Acme North"]);
    expect(names(await list(owner.accessToken, org.id, "?search=south&company=acme"))).toEqual([]);
  });

  it("filters by created date", async () => {
    const { owner, org } = await setup();
    const old = await createCustomer(ctx, owner, org, { name: "Old" });
    await createCustomer(ctx, owner, org, { name: "Recent" });
    await prisma.customer.update({ where: { id: old.id }, data: { createdAt: new Date("2026-01-15T10:00:00Z") } });

    const only = async (query: string) =>
      (await list(owner.accessToken, org.id, query)).body.data.customers.map((c: any) => c.name);
    expect(await only("?createdFrom=2026-01-15&createdTo=2026-01-15")).toEqual(["Old"]);
    expect(await only("?createdTo=2026-01-31")).toEqual(["Old"]);
    expect(await only("?createdFrom=2026-02-01")).toEqual(["Recent"]);
  });

  it("sorts by a whitelisted field and direction", async () => {
    const { owner, org } = await setup();
    for (const name of ["b", "c", "a"]) await createCustomer(ctx, owner, org, { name });

    const order = async (query: string) =>
      (await list(owner.accessToken, org.id, query)).body.data.customers.map((c: any) => c.name);
    expect(await order("?sortBy=name&sortOrder=asc")).toEqual(["a", "b", "c"]);
    expect(await order("?sortBy=name&sortOrder=desc")).toEqual(["c", "b", "a"]);
  });

  it.each([
    ["page=0"],
    ["page=abc"],
    ["limit=0"],
    ["limit=101"],
    ["search="],
    ["sortBy=passwordHash"],
    ["sortBy=organizationId"],
    ["sortOrder=up"],
    ["createdFrom=yesterday"],
    ["createdFrom=2026-09-30&createdTo=2026-09-01"],
    ["organizationId=x"],
    ["search=a&search=b"],
  ])("rejects the query ?%s with VALIDATION_ERROR", async (query) => {
    const { owner, org } = await setup();
    expectError(await list(owner.accessToken, org.id, `?${query}`), 400, "VALIDATION_ERROR");
  });

  it("isolates organizations: B never sees A's customers, in any page, search or filter", async () => {
    const { owner, org, otherOwner, otherOrg } = await setup();
    await createCustomer(ctx, owner, org, { name: "Secret Acme", company: "Acme" });
    await createCustomer(ctx, otherOwner, otherOrg, { name: "Visible" });

    for (const query of ["", "?search=secret", "?company=acme", "?limit=100"]) {
      const res = await list(otherOwner.accessToken, otherOrg.id, query);
      expect(res.body.data.customers.map((c: any) => c.name).every((n: string) => n === "Visible")).toBe(true);
      expect(JSON.stringify(res.body)).not.toContain("Secret");
    }
    expectError(await list(otherOwner.accessToken, org.id), 404, "ORGANIZATION_NOT_FOUND");
  });

  it("requires a token and a membership", async () => {
    const { org, otherOwner } = await setup();
    expectError(await api.get(path(org.id)), 401, "UNAUTHORIZED");
    expectError(await list(otherOwner.accessToken, org.id), 404, "ORGANIZATION_NOT_FOUND");
  });
});

describe("PATCH /organizations/:organizationId/customers/:customerId", () => {
  const patch = (token: string, orgId: string, customerId: string) =>
    api.patch(path(orgId, customerId)).set(bearer(token));

  it("updates some fields and returns the whole customer", async () => {
    const { owner, org } = await setup();
    const created = await createCustomer(ctx, owner, org, {
      name: "Acme",
      email: "a@acme.io",
      notes: "VIP",
    });

    const res = await patch(owner.accessToken, org.id, created.id).send({
      name: "Acme Technologies Pvt Ltd",
      phone: "+911234567890",
    });

    expect(res.status).toBe(200);
    expectEnvelope(res.body, true);
    expect(res.body.message).toBe("Customer updated successfully.");
    expect(res.body.data.customer).toEqual({
      ...created,
      name: "Acme Technologies Pvt Ltd",
      phone: "+911234567890",
      updatedAt: expect.any(String),
    });
    const row = await prisma.customer.findUniqueOrThrow({ where: { id: created.id } });
    expect(row).toMatchObject({ name: "Acme Technologies Pvt Ltd", email: "a@acme.io", notes: "VIP" });
  });

  it("allows OWNER, ADMIN and MEMBER to update", async () => {
    const { owner, admin, member, org } = await setup();
    const created = await createCustomer(ctx, owner, org);
    for (const [i, who] of [owner, admin, member].entries()) {
      const res = await patch(who.accessToken, org.id, created.id).send({ notes: `by ${i}` });
      expect(res.status).toBe(200);
    }
  });

  it("clears an optional field with null", async () => {
    const { owner, org } = await setup();
    const created = await createCustomer(ctx, owner, org, { name: "Acme", notes: "VIP", company: "Acme" });
    const res = await patch(owner.accessToken, org.id, created.id).send({ notes: null, company: null });
    expect(res.body.data.customer).toMatchObject({ notes: null, company: null, name: "Acme" });
  });

  it("trims and lowercases like create does", async () => {
    const { owner, org } = await setup();
    const created = await createCustomer(ctx, owner, org);
    const res = await patch(owner.accessToken, org.id, created.id).send({
      name: "  New   Name ",
      email: " Mixed@Case.IO ",
    });
    expect(res.body.data.customer).toMatchObject({ name: "New Name", email: "mixed@case.io" });
  });

  it.each([
    ["empty body", {}],
    ["null name", { name: null }],
    ["empty name", { name: " " }],
    ["bad email", { email: "nope" }],
    ["notes too long", { notes: "n".repeat(1001) }],
    ["organizationId", { organizationId: "00000000-0000-4000-8000-000000000000" }],
    ["id", { id: "00000000-0000-4000-8000-000000000000" }],
    ["createdAt", { createdAt: "2020-01-01T00:00:00Z" }],
    ["unknown field", { name: "A", extra: true }],
  ])("rejects %s with VALIDATION_ERROR and changes nothing", async (_label, body) => {
    const { owner, org } = await setup();
    const created = await createCustomer(ctx, owner, org, { name: "Acme", notes: "VIP" });
    expectError(await patch(owner.accessToken, org.id, created.id).send(body), 400, "VALIDATION_ERROR");
    const row = await prisma.customer.findUniqueOrThrow({ where: { id: created.id } });
    expect(row).toMatchObject({ name: "Acme", notes: "VIP", organizationId: org.id });
  });

  it("is CUSTOMER_NOT_FOUND for an unknown id and VALIDATION_ERROR for a malformed one", async () => {
    const { owner, org } = await setup();
    expectError(
      await patch(owner.accessToken, org.id, randomUUID()).send({ name: "X" }),
      404,
      "CUSTOMER_NOT_FOUND",
    );
    expectError(await patch(owner.accessToken, org.id, "nope").send({ name: "X" }), 400, "VALIDATION_ERROR");
  });

  it("isolates organizations: B cannot change A's customer, and A's data stays as it was", async () => {
    const { owner, org, otherOwner, otherOrg } = await setup();
    const created = await createCustomer(ctx, owner, org, { name: "Acme" });

    expectError(
      await patch(otherOwner.accessToken, otherOrg.id, created.id).send({ name: "Hijacked" }),
      404,
      "CUSTOMER_NOT_FOUND",
    );
    expectError(
      await patch(otherOwner.accessToken, org.id, created.id).send({ name: "Hijacked" }),
      404,
      "ORGANIZATION_NOT_FOUND",
    );
    const row = await prisma.customer.findUniqueOrThrow({ where: { id: created.id } });
    expect(row).toMatchObject({ name: "Acme", organizationId: org.id });
  });

  it("requires a token", async () => {
    const { owner, org } = await setup();
    const created = await createCustomer(ctx, owner, org);
    expectError(await api.patch(path(org.id, created.id)).send({ name: "X" }), 401, "UNAUTHORIZED");
  });
});

describe("DELETE /organizations/:organizationId/customers/:customerId", () => {
  const remove = (token: string, orgId: string, customerId: string) =>
    api.delete(path(orgId, customerId)).set(bearer(token));

  it.each(["owner", "admin"] as const)("lets the %s delete a customer for good", async (role) => {
    const ctxData = await setup();
    const created = await createCustomer(ctx, ctxData.member, ctxData.org, { name: "Acme" });
    const other = await createCustomer(ctx, ctxData.owner, ctxData.org, { name: "Keep" });

    const res = await remove(ctxData[role].accessToken, ctxData.org.id, created.id);

    expect(res.status).toBe(200);
    expectEnvelope(res.body, true);
    expect(res.body.message).toBe("Customer deleted successfully.");
    expect(res.body.data).toBeNull();
    expect(await prisma.customer.findUnique({ where: { id: created.id } })).toBeNull(); // hard delete
    expect(await prisma.customer.findUnique({ where: { id: other.id } })).not.toBeNull();
    expectError(
      await api.get(path(ctxData.org.id, created.id)).set(bearer(ctxData.owner.accessToken)),
      404,
      "CUSTOMER_NOT_FOUND",
    );
  });

  it("refuses a MEMBER with INSUFFICIENT_ORGANIZATION_PERMISSION and keeps the customer", async () => {
    const { owner, member, org } = await setup();
    const created = await createCustomer(ctx, owner, org);
    expectError(
      await remove(member.accessToken, org.id, created.id),
      403,
      "INSUFFICIENT_ORGANIZATION_PERMISSION",
    );
    expect(await prisma.customer.count({ where: { id: created.id } })).toBe(1);
  });

  it("is CUSTOMER_NOT_FOUND the second time and for an unknown id", async () => {
    const { owner, org } = await setup();
    const created = await createCustomer(ctx, owner, org);
    expect((await remove(owner.accessToken, org.id, created.id)).status).toBe(200);
    expectError(await remove(owner.accessToken, org.id, created.id), 404, "CUSTOMER_NOT_FOUND");
    expectError(await remove(owner.accessToken, org.id, randomUUID()), 404, "CUSTOMER_NOT_FOUND");
  });

  it("rejects a malformed customer id", async () => {
    const { owner, org } = await setup();
    expectError(await remove(owner.accessToken, org.id, "nope"), 400, "VALIDATION_ERROR");
  });

  it("isolates organizations: B's owner cannot delete A's customer", async () => {
    const { owner, org, otherOwner, otherOrg } = await setup();
    const created = await createCustomer(ctx, owner, org, { name: "Acme" });

    expectError(await remove(otherOwner.accessToken, otherOrg.id, created.id), 404, "CUSTOMER_NOT_FOUND");
    expectError(await remove(otherOwner.accessToken, org.id, created.id), 404, "ORGANIZATION_NOT_FOUND");
    expect(await prisma.customer.count({ where: { id: created.id } })).toBe(1);
  });

  it("requires a token", async () => {
    const { owner, org } = await setup();
    const created = await createCustomer(ctx, owner, org);
    expectError(await api.delete(path(org.id, created.id)), 401, "UNAUTHORIZED");
  });
});
