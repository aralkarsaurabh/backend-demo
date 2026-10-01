import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../src/infrastructure/database/prisma";
import { PrismaCustomerRepository } from "../../src/infrastructure/database/repositories/PrismaCustomerRepository";
import { resetDatabase } from "../helpers/integration";

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const customers = new PrismaCustomerRepository(prisma);

beforeEach(() => resetDatabase(prisma));
afterAll(() => prisma.$disconnect());

const newOrg = (name = "Acme") =>
  prisma.organization.create({ data: { name, slug: `${name.toLowerCase()}-${randomUUID().slice(0, 8)}` } });

describe("PrismaCustomerRepository: create and findById", () => {
  it("creates a customer in the organization, with null for omitted fields", async () => {
    const org = await newOrg();
    const customer = await customers.create(org.id, { name: "Acme" });

    expect(customer).toMatchObject({
      organizationId: org.id,
      name: "Acme",
      email: null,
      phone: null,
      company: null,
      notes: null,
    });
    expect(await prisma.customer.count({ where: { organizationId: org.id } })).toBe(1);
  });

  it("findById() finds a customer only through its own organization", async () => {
    const a = await newOrg("a");
    const b = await newOrg("b");
    const customer = await customers.create(a.id, { name: "Acme", notes: "VIP" });

    expect((await customers.findById(a.id, customer.id))?.notes).toBe("VIP");
    expect(await customers.findById(b.id, customer.id)).toBeNull();
    expect(await customers.findById(a.id, randomUUID())).toBeNull();
  });

  it("deleting an organization deletes its customers (cascade)", async () => {
    const org = await newOrg();
    await customers.create(org.id, { name: "Acme" });
    await prisma.organization.delete({ where: { id: org.id } });
    expect(await prisma.customer.count()).toBe(0);
  });
});
