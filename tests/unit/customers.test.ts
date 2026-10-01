import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildApp } from "../helpers/fakes";

const orgA: string = randomUUID();
const orgB: string = randomUUID();

describe("CreateCustomer", () => {
  it("stores the customer in the given organization, with null for omitted fields", async () => {
    const app = buildApp();
    const { customer } = await app.createCustomer.execute(orgA, { name: "Acme" });

    expect(customer).toEqual({
      id: expect.any(String),
      name: "Acme",
      email: null,
      phone: null,
      company: null,
      notes: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(app.customers.customers).toHaveLength(1);
    expect(app.customers.customers[0].organizationId).toBe(orgA);
  });

  it("keeps every optional field it is given", async () => {
    const app = buildApp();
    const { customer } = await app.createCustomer.execute(orgA, {
      name: "Acme",
      email: "contact@acme.com",
      phone: "+911234567890",
      company: "Acme Technologies",
      notes: "Enterprise customer",
    });
    expect(customer).toMatchObject({
      email: "contact@acme.com",
      phone: "+911234567890",
      company: "Acme Technologies",
      notes: "Enterprise customer",
    });
  });

  it("does not response-leak the organization id", async () => {
    const app = buildApp();
    const { customer } = await app.createCustomer.execute(orgA, { name: "Acme" });
    expect(customer).not.toHaveProperty("organizationId");
  });
});

describe("GetCustomer", () => {
  it("returns the customer with its notes", async () => {
    const app = buildApp();
    const { customer } = await app.createCustomer.execute(orgA, { name: "Acme", notes: "VIP" });
    expect((await app.getCustomer.execute(orgA, customer.id)).customer).toEqual(customer);
  });

  it("is CUSTOMER_NOT_FOUND for an unknown id", async () => {
    const app = buildApp();
    await expect(app.getCustomer.execute(orgA, randomUUID())).rejects.toMatchObject({
      code: "CUSTOMER_NOT_FOUND",
    });
  });

  it("is CUSTOMER_NOT_FOUND for a customer of another organization", async () => {
    const app = buildApp();
    const { customer } = await app.createCustomer.execute(orgA, { name: "Acme" });
    await expect(app.getCustomer.execute(orgB, customer.id)).rejects.toMatchObject({
      code: "CUSTOMER_NOT_FOUND",
    });
  });
});

const defaults = { page: 1, limit: 20, sortBy: "createdAt", sortOrder: "desc" } as const;

async function seed(app: ReturnType<typeof buildApp>, organizationId: string, count: number) {
  for (let i = 1; i <= count; i++) {
    await app.createCustomer.execute(organizationId, {
      name: `Customer ${String(i).padStart(2, "0")}`,
      notes: "private",
    });
  }
}

describe("ListCustomers", () => {
  it("returns an empty page with totalPages 0 for an organization with no customers", async () => {
    const app = buildApp();
    expect(await app.listCustomers.execute(orgA, defaults)).toEqual({
      customers: [],
      pagination: { page: 1, limit: 20, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    });
  });

  it("works out the pagination fields", async () => {
    const app = buildApp();
    await seed(app, orgA, 25);

    const first = await app.listCustomers.execute(orgA, { ...defaults, limit: 10 });
    expect(first.customers).toHaveLength(10);
    expect(first.pagination).toEqual({
      page: 1, limit: 10, totalItems: 25, totalPages: 3, hasNextPage: true, hasPreviousPage: false,
    });

    const last = await app.listCustomers.execute(orgA, { ...defaults, limit: 10, page: 3 });
    expect(last.customers).toHaveLength(5);
    expect(last.pagination).toMatchObject({ page: 3, hasNextPage: false, hasPreviousPage: true });
  });

  it("returns an empty page, with the real totals, past the last page", async () => {
    const app = buildApp();
    await seed(app, orgA, 3);
    const res = await app.listCustomers.execute(orgA, { ...defaults, page: 9 });
    expect(res.customers).toEqual([]);
    expect(res.pagination).toMatchObject({ totalItems: 3, totalPages: 1, hasNextPage: false, hasPreviousPage: true });
  });

  it("leaves notes and the organization id out of list items", async () => {
    const app = buildApp();
    await seed(app, orgA, 1);
    const [item] = (await app.listCustomers.execute(orgA, defaults)).customers;
    expect(Object.keys(item).sort()).toEqual(
      ["company", "createdAt", "email", "id", "name", "phone", "updatedAt"],
    );
  });

  it("never lists another organization's customers", async () => {
    const app = buildApp();
    await seed(app, orgA, 2);
    await seed(app, orgB, 5);
    const res = await app.listCustomers.execute(orgA, defaults);
    expect(res.pagination.totalItems).toBe(2);
    expect(res.customers).toHaveLength(2);
  });
});

describe("UpdateCustomer", () => {
  it("changes only the fields it is given and leaves the rest alone", async () => {
    const app = buildApp();
    const { customer } = await app.createCustomer.execute(orgA, {
      name: "Acme",
      email: "a@acme.io",
      company: "Acme",
      notes: "VIP",
    });

    const { customer: updated } = await app.updateCustomer.execute(orgA, customer.id, {
      name: "Acme Pvt Ltd",
    });
    expect(updated).toMatchObject({
      id: customer.id,
      name: "Acme Pvt Ltd",
      email: "a@acme.io",
      company: "Acme",
      notes: "VIP",
    });
  });

  it("clears an optional field when it is null", async () => {
    const app = buildApp();
    const { customer } = await app.createCustomer.execute(orgA, { name: "Acme", notes: "VIP" });
    const { customer: updated } = await app.updateCustomer.execute(orgA, customer.id, { notes: null });
    expect(updated.notes).toBeNull();
  });

  it("is CUSTOMER_NOT_FOUND for an unknown id", async () => {
    const app = buildApp();
    await expect(app.updateCustomer.execute(orgA, randomUUID(), { name: "X" })).rejects.toMatchObject({
      code: "CUSTOMER_NOT_FOUND",
    });
  });

  it("is CUSTOMER_NOT_FOUND for another organization's customer, and changes nothing", async () => {
    const app = buildApp();
    const { customer } = await app.createCustomer.execute(orgA, { name: "Acme" });

    await expect(app.updateCustomer.execute(orgB, customer.id, { name: "Hijacked" })).rejects.toMatchObject({
      code: "CUSTOMER_NOT_FOUND",
    });
    expect((await app.getCustomer.execute(orgA, customer.id)).customer.name).toBe("Acme");
  });
});

describe("DeleteCustomer", () => {
  it("removes the customer and nothing else", async () => {
    const app = buildApp();
    const { customer } = await app.createCustomer.execute(orgA, { name: "Gone" });
    const { customer: keep } = await app.createCustomer.execute(orgA, { name: "Keep" });

    await app.deleteCustomer.execute(orgA, customer.id);

    await expect(app.getCustomer.execute(orgA, customer.id)).rejects.toMatchObject({ code: "CUSTOMER_NOT_FOUND" });
    expect((await app.getCustomer.execute(orgA, keep.id)).customer.name).toBe("Keep");
  });

  it("is CUSTOMER_NOT_FOUND the second time, and for an unknown id", async () => {
    const app = buildApp();
    const { customer } = await app.createCustomer.execute(orgA, { name: "Gone" });
    await app.deleteCustomer.execute(orgA, customer.id);

    await expect(app.deleteCustomer.execute(orgA, customer.id)).rejects.toMatchObject({ code: "CUSTOMER_NOT_FOUND" });
    await expect(app.deleteCustomer.execute(orgA, randomUUID())).rejects.toMatchObject({ code: "CUSTOMER_NOT_FOUND" });
  });

  it("is CUSTOMER_NOT_FOUND for another organization's customer, which stays", async () => {
    const app = buildApp();
    const { customer } = await app.createCustomer.execute(orgA, { name: "Acme" });
    await expect(app.deleteCustomer.execute(orgB, customer.id)).rejects.toMatchObject({ code: "CUSTOMER_NOT_FOUND" });
    expect((await app.getCustomer.execute(orgA, customer.id)).customer.id).toBe(customer.id);
  });
});
