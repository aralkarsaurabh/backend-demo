import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { LeadListQuery } from "../../src/domain/repositories/LeadRepository";
import { createPrismaClient } from "../../src/infrastructure/database/prisma";
import { PrismaLeadRepository } from "../../src/infrastructure/database/repositories/PrismaLeadRepository";
import { resetDatabase } from "../helpers/integration";

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const leads = new PrismaLeadRepository(prisma);

beforeEach(() => resetDatabase(prisma));
afterAll(() => prisma.$disconnect());

const newOrg = (name = "Acme") =>
  prisma.organization.create({ data: { name, slug: `${name.toLowerCase()}-${randomUUID().slice(0, 8)}` } });

const query = (over: Partial<LeadListQuery> = {}): LeadListQuery => ({
  page: 1,
  limit: 20,
  sortBy: "createdAt",
  sortOrder: "desc",
  ...over,
});

const names = async (organizationId: string, over: Partial<LeadListQuery> = {}) =>
  (await leads.list(organizationId, query(over))).items.map((l) => l.name);

describe("PrismaLeadRepository: create and findById", () => {
  it("creates a NEW unassigned lead in the organization, with null for omitted fields", async () => {
    const org = await newOrg();
    const lead = await leads.create(org.id, { name: "Rahul" });
    expect(lead).toMatchObject({
      organizationId: org.id,
      name: "Rahul",
      status: "NEW",
      email: null,
      source: null,
      assignedToUserId: null,
      convertedAt: null,
      convertedCustomerId: null,
    });
  });

  it("findById() finds a lead only through its own organization", async () => {
    const a = await newOrg("a");
    const b = await newOrg("b");
    const lead = await leads.create(a.id, { name: "Rahul" });
    expect((await leads.findById(a.id, lead.id))?.name).toBe("Rahul");
    expect(await leads.findById(b.id, lead.id)).toBeNull();
  });

  it("deleting an organization deletes its leads (cascade)", async () => {
    const org = await newOrg();
    await leads.create(org.id, { name: "Rahul" });
    await prisma.organization.delete({ where: { id: org.id } });
    expect(await prisma.lead.count()).toBe(0);
  });

  it("deleting the assigned user unassigns the lead instead of deleting it", async () => {
    const org = await newOrg();
    const user = await prisma.user.create({
      data: { name: "U", email: "u@example.com", passwordHash: "x" },
    });
    const lead = await leads.create(org.id, { name: "Rahul" });
    await leads.update(org.id, lead.id, { assignedToUserId: user.id });
    await prisma.user.delete({ where: { id: user.id } });
    expect((await leads.findById(org.id, lead.id))?.assignedToUserId).toBeNull();
  });
});

describe("PrismaLeadRepository: update", () => {
  it("changes only the given fields; null clears", async () => {
    const org = await newOrg();
    const lead = await leads.create(org.id, { name: "Rahul", company: "ABC", notes: "x" });
    const updated = await leads.update(org.id, lead.id, { status: "CONTACTED", company: null });
    expect(updated).toMatchObject({ name: "Rahul", status: "CONTACTED", company: null, notes: "x" });
  });

  it("update() cannot reach another organization's lead", async () => {
    const a = await newOrg("a");
    const b = await newOrg("b");
    const lead = await leads.create(a.id, { name: "Rahul" });
    expect(await leads.update(b.id, lead.id, { name: "Hacked" })).toBeNull();
    expect((await leads.findById(a.id, lead.id))?.name).toBe("Rahul");
  });

  it("update() refuses a converted lead and changes nothing", async () => {
    const org = await newOrg();
    const lead = await leads.create(org.id, { name: "Rahul" });
    await leads.convert(org.id, lead.id);
    expect(await leads.update(org.id, lead.id, { name: "Changed" })).toBeNull();
    expect((await leads.findById(org.id, lead.id))?.name).toBe("Rahul");
  });
});

describe("PrismaLeadRepository: delete", () => {
  it("deletes within the organization only", async () => {
    const a = await newOrg("a");
    const b = await newOrg("b");
    const lead = await leads.create(a.id, { name: "Rahul" });
    expect(await leads.delete(b.id, lead.id)).toBe(false);
    expect(await prisma.lead.count()).toBe(1);
    expect(await leads.delete(a.id, lead.id)).toBe(true);
    expect(await leads.delete(a.id, lead.id)).toBe(false);
  });
});

describe("PrismaLeadRepository: convert", () => {
  it("creates the customer and updates the lead in the same organization", async () => {
    const org = await newOrg();
    const lead = await leads.create(org.id, {
      name: "Rahul",
      email: "r@example.com",
      phone: "1",
      company: "ABC",
      notes: "n",
    });
    const result = await leads.convert(org.id, lead.id);

    expect(result?.customer).toMatchObject({
      organizationId: org.id,
      name: "Rahul",
      email: "r@example.com",
      phone: "1",
      company: "ABC",
      notes: "n",
    });
    expect(result?.lead).toMatchObject({ status: "CONVERTED", convertedCustomerId: result?.customer.id });
    expect(result?.lead.convertedAt).toBeInstanceOf(Date);
  });

  it("convert() cannot reach another organization's lead and creates no customer", async () => {
    const a = await newOrg("a");
    const b = await newOrg("b");
    const lead = await leads.create(a.id, { name: "Rahul" });
    expect(await leads.convert(b.id, lead.id)).toBeNull();
    expect(await prisma.customer.count()).toBe(0);
    expect((await leads.findById(a.id, lead.id))?.status).toBe("NEW");
  });

  it("converting an already converted lead throws and rolls back the customer it just created", async () => {
    const org = await newOrg();
    const lead = await leads.create(org.id, { name: "Rahul" });
    await leads.convert(org.id, lead.id);
    expect(await prisma.customer.count()).toBe(1);

    await expect(leads.convert(org.id, lead.id)).rejects.toMatchObject({ code: "LEAD_ALREADY_CONVERTED" });
    expect(await prisma.customer.count()).toBe(1);
  });

  it("two simultaneous conversions create one customer", async () => {
    const org = await newOrg();
    const lead = await leads.create(org.id, { name: "Rahul" });
    const outcomes = await Promise.allSettled([leads.convert(org.id, lead.id), leads.convert(org.id, lead.id)]);
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.customer.count()).toBe(1);
  });
});

describe("PrismaLeadRepository: list", () => {
  it("returns only the organization's leads, with the total before paging", async () => {
    const a = await newOrg("a");
    const b = await newOrg("b");
    await leads.create(a.id, { name: "A1" });
    await leads.create(a.id, { name: "A2" });
    await leads.create(b.id, { name: "B1" });
    const page = await leads.list(a.id, query({ limit: 1 }));
    expect(page.items).toHaveLength(1);
    expect(page.totalItems).toBe(2);
  });

  it("filters by status, source, assignee and created range", async () => {
    const org = await newOrg();
    const user = await prisma.user.create({ data: { name: "U", email: "u@example.com", passwordHash: "x" } });
    const one = await leads.create(org.id, { name: "One", source: "WEBSITE" });
    await leads.create(org.id, { name: "Two", source: "EVENT" });
    await leads.update(org.id, one.id, { status: "QUALIFIED", assignedToUserId: user.id });

    expect(await names(org.id, { status: "QUALIFIED" })).toEqual(["One"]);
    expect(await names(org.id, { source: "EVENT" })).toEqual(["Two"]);
    expect(await names(org.id, { assignedToUserId: user.id })).toEqual(["One"]);
    expect(await names(org.id, { createdFrom: new Date(Date.now() + 86_400_000) })).toEqual([]);
    expect(await names(org.id, { createdTo: new Date(Date.now() - 86_400_000) })).toEqual([]);
  });

  it("searches name, email, phone and company, ignoring case", async () => {
    const org = await newOrg();
    await leads.create(org.id, { name: "Alpha" });
    await leads.create(org.id, { name: "B", email: "beta@x.com" });
    await leads.create(org.id, { name: "C", phone: "555-GAMMA" });
    await leads.create(org.id, { name: "D", company: "Delta Corp" });
    for (const [search, name] of [["ALPHA", "Alpha"], ["BETA", "B"], ["gamma", "C"], ["delta", "D"]]) {
      expect(await names(org.id, { search })).toEqual([name]);
    }
  });

  it("treats % and _ in the search as literal characters", async () => {
    const org = await newOrg();
    await leads.create(org.id, { name: "100% sure" });
    await leads.create(org.id, { name: "snake_case" });
    await leads.create(org.id, { name: "plain" });
    expect(await names(org.id, { search: "%" })).toEqual(["100% sure"]);
    expect(await names(org.id, { search: "_" })).toEqual(["snake_case"]);
  });

  it("orders equal sort values by id, so pages neither overlap nor skip", async () => {
    const org = await newOrg();
    const sameTime = new Date("2026-01-01T00:00:00.000Z");
    await prisma.lead.createMany({
      data: Array.from({ length: 7 }, (_, i) => ({
        organizationId: org.id,
        name: `Lead ${i}`,
        createdAt: sameTime,
      })),
    });
    const seen: string[] = [];
    for (const page of [1, 2, 3, 4]) {
      const result = await leads.list(org.id, query({ page, limit: 2 }));
      seen.push(...result.items.map((l) => l.id));
    }
    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
    expect(seen).toEqual([...seen].sort().reverse());
  });
});
