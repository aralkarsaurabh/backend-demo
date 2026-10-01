import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../src/infrastructure/database/prisma";
import { CustomerListQuery } from "../../src/domain/repositories/CustomerRepository";
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

const query = (over: Partial<CustomerListQuery> = {}): CustomerListQuery => ({
  page: 1,
  limit: 20,
  sortBy: "createdAt",
  sortOrder: "desc",
  ...over,
});

const names = async (organizationId: string, over: Partial<CustomerListQuery> = {}) =>
  (await customers.list(organizationId, query(over))).items.map((c) => c.name);

describe("PrismaCustomerRepository.list: tenant isolation", () => {
  it("lists and counts only the organization's own customers", async () => {
    const a = await newOrg("a");
    const b = await newOrg("b");
    await customers.create(a.id, { name: "A1" });
    await customers.create(a.id, { name: "A2" });
    await customers.create(b.id, { name: "B1" });

    const result = await customers.list(a.id, query());
    expect(result.totalItems).toBe(2);
    expect(result.items.map((c) => c.name).sort()).toEqual(["A1", "A2"]);
  });

  it("keeps search and filters inside the organization too", async () => {
    const a = await newOrg("a");
    const b = await newOrg("b");
    await customers.create(a.id, { name: "Acme", company: "Acme" });
    await customers.create(b.id, { name: "Acme", company: "Acme" });

    expect((await customers.list(a.id, query({ search: "acme" }))).totalItems).toBe(1);
    expect((await customers.list(a.id, query({ company: "acme" }))).totalItems).toBe(1);
  });
});

describe("PrismaCustomerRepository.list: search and filters", () => {
  it("searches name, email, phone and company, ignoring case", async () => {
    const org = await newOrg();
    await customers.create(org.id, { name: "Zed" });
    await customers.create(org.id, { name: "Byname Acme" });
    await customers.create(org.id, { name: "Bymail", email: "sales@acme.io" });
    await customers.create(org.id, { name: "Byphone", phone: "+91 ACME 1" });
    await customers.create(org.id, { name: "Bycompany", company: "The AcMe Co" });

    expect((await names(org.id, { search: "acme", sortBy: "name", sortOrder: "asc" }))).toEqual([
      "Bycompany", "Bymail", "Byname Acme", "Byphone",
    ]);
    expect(await names(org.id, { search: "nothing-matches" })).toEqual([]);
  });

  it("treats % and _ in the search text as plain characters", async () => {
    const org = await newOrg();
    await customers.create(org.id, { name: "100% Organic" });
    await customers.create(org.id, { name: "Plain" });
    await customers.create(org.id, { name: "snake_case" });
    await customers.create(org.id, { name: "snakeXcase" });

    expect(await names(org.id, { search: "%" })).toEqual(["100% Organic"]);
    expect(await names(org.id, { search: "e_c" })).toEqual(["snake_case"]);
    await customers.create(org.id, { name: "back\\slash" });
    expect(await names(org.id, { search: "k\\s" })).toEqual(["back\\slash"]);
  });

  it("filters by company, case-insensitive and exact", async () => {
    const org = await newOrg();
    await customers.create(org.id, { name: "One", company: "Acme" });
    await customers.create(org.id, { name: "Two", company: "ACME" });
    await customers.create(org.id, { name: "Three", company: "Acme Labs" });
    await customers.create(org.id, { name: "Four" });

    expect((await names(org.id, { company: "acme", sortBy: "name", sortOrder: "asc" }))).toEqual(["One", "Two"]);
  });

  it("filters by created date, both ends inclusive", async () => {
    const org = await newOrg();
    const at = (iso: string) => new Date(iso);
    for (const [name, iso] of [
      ["before", "2026-08-31T23:59:59.999Z"],
      ["start", "2026-09-01T00:00:00.000Z"],
      ["middle", "2026-09-15T12:00:00.000Z"],
      ["end", "2026-09-30T23:59:59.999Z"],
      ["after", "2026-10-01T00:00:00.000Z"],
    ] as const) {
      await prisma.customer.create({ data: { organizationId: org.id, name, createdAt: at(iso) } });
    }

    const range = { createdFrom: at("2026-09-01T00:00:00.000Z"), createdTo: at("2026-09-30T23:59:59.999Z") };
    expect(await names(org.id, { ...range, sortOrder: "asc" })).toEqual(["start", "middle", "end"]);
    expect(await names(org.id, { createdFrom: range.createdFrom, sortOrder: "asc" })).toEqual([
      "start", "middle", "end", "after",
    ]);
    expect(await names(org.id, { createdTo: range.createdTo, sortOrder: "asc" })).toEqual([
      "before", "start", "middle", "end",
    ]);
  });

  it("combines search, company and dates with AND", async () => {
    const org = await newOrg();
    await customers.create(org.id, { name: "Acme North", company: "Acme" });
    await customers.create(org.id, { name: "Acme South", company: "Other" });
    await customers.create(org.id, { name: "Beta", company: "Acme" });

    expect(await names(org.id, { search: "north", company: "acme" })).toEqual(["Acme North"]);
    expect(await names(org.id, { search: "south", company: "acme" })).toEqual([]);
  });
});

describe("PrismaCustomerRepository.list: sorting and pagination", () => {
  it("sorts by name and company in both directions, with empty companies last", async () => {
    const org = await newOrg();
    await customers.create(org.id, { name: "b", company: "Zeta" });
    await customers.create(org.id, { name: "a" });
    await customers.create(org.id, { name: "c", company: "Alpha" });

    expect(await names(org.id, { sortBy: "name", sortOrder: "asc" })).toEqual(["a", "b", "c"]);
    expect(await names(org.id, { sortBy: "name", sortOrder: "desc" })).toEqual(["c", "b", "a"]);
    expect(await names(org.id, { sortBy: "company", sortOrder: "asc" })).toEqual(["c", "b", "a"]);
    expect(await names(org.id, { sortBy: "company", sortOrder: "desc" })).toEqual(["b", "c", "a"]);
  });

  it("lists newest first by default", async () => {
    const org = await newOrg();
    for (const [name, day] of [["old", 1], ["new", 3], ["mid", 2]] as const) {
      await prisma.customer.create({
        data: { organizationId: org.id, name, createdAt: new Date(Date.UTC(2026, 8, day)) },
      });
    }
    expect(await names(org.id)).toEqual(["new", "mid", "old"]);
  });

  it("pages are stable when many rows share one timestamp: no repeats, no gaps", async () => {
    const org = await newOrg();
    const sameTime = new Date("2026-09-01T10:00:00.000Z");
    await prisma.customer.createMany({
      data: Array.from({ length: 10 }, (_, i) => ({
        organizationId: org.id,
        name: `C${i}`,
        createdAt: sameTime,
      })),
    });

    const seen: string[] = [];
    for (let page = 1; page <= 4; page++) {
      const { items } = await customers.list(org.id, query({ page, limit: 3 }));
      seen.push(...items.map((c) => c.id));
    }
    expect(new Set(seen).size).toBe(10);
    expect(seen).toEqual([...seen].sort().reverse()); // id DESC is the tie-breaker
  });

  it("applies skip and take, and counts the whole match", async () => {
    const org = await newOrg();
    for (let i = 0; i < 7; i++) await customers.create(org.id, { name: `N${i}` });

    const page2 = await customers.list(org.id, query({ page: 2, limit: 3, sortBy: "name", sortOrder: "asc" }));
    expect(page2.items.map((c) => c.name)).toEqual(["N3", "N4", "N5"]);
    expect(page2.totalItems).toBe(7);
    expect((await customers.list(org.id, query({ page: 5, limit: 3 }))).items).toEqual([]);
  });
});

describe("PrismaCustomerRepository.update", () => {
  it("changes the given fields only, clears on null and bumps updatedAt", async () => {
    const org = await newOrg();
    const created = await customers.create(org.id, { name: "Acme", email: "a@acme.io", notes: "VIP" });

    const updated = await customers.update(org.id, created.id, { name: "Acme Ltd", notes: null });

    expect(updated).toMatchObject({
      id: created.id,
      organizationId: org.id,
      name: "Acme Ltd",
      email: "a@acme.io",
      notes: null,
    });
    expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
    expect(updated!.createdAt).toEqual(created.createdAt);
  });

  it("returns null and changes nothing for another organization's customer", async () => {
    const a = await newOrg("a");
    const b = await newOrg("b");
    const created = await customers.create(a.id, { name: "Acme" });

    expect(await customers.update(b.id, created.id, { name: "Hijacked" })).toBeNull();
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: created.id } })).name).toBe("Acme");
  });

  it("returns null for an unknown id", async () => {
    const org = await newOrg();
    expect(await customers.update(org.id, randomUUID(), { name: "X" })).toBeNull();
  });
});

describe("PrismaCustomerRepository.delete", () => {
  it("deletes only the named customer and returns true", async () => {
    const org = await newOrg();
    const gone = await customers.create(org.id, { name: "Gone" });
    const keep = await customers.create(org.id, { name: "Keep" });

    expect(await customers.delete(org.id, gone.id)).toBe(true);
    expect(await customers.findById(org.id, gone.id)).toBeNull();
    expect(await customers.findById(org.id, keep.id)).not.toBeNull();
  });

  it("returns false and deletes nothing for another organization's customer", async () => {
    const a = await newOrg("a");
    const b = await newOrg("b");
    const created = await customers.create(a.id, { name: "Acme" });

    expect(await customers.delete(b.id, created.id)).toBe(false);
    expect(await prisma.customer.count({ where: { id: created.id } })).toBe(1);
  });

  it("returns false for an unknown id, and when called twice", async () => {
    const org = await newOrg();
    const created = await customers.create(org.id, { name: "Gone" });
    expect(await customers.delete(org.id, randomUUID())).toBe(false);
    expect(await customers.delete(org.id, created.id)).toBe(true);
    expect(await customers.delete(org.id, created.id)).toBe(false);
  });
});
