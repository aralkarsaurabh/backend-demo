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
