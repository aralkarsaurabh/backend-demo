import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { OrganizationRole } from "../../src/domain/enums/OrganizationRole";
import {
  OrganizationPermission,
  hasPermission,
} from "../../src/domain/policies/OrganizationPermissions";
import { buildApp, TestApp } from "../helpers/fakes";

const orgA: string = randomUUID();
const orgB: string = randomUUID();

function addMember(app: TestApp, organizationId: string, userId: string = randomUUID()) {
  const now = new Date();
  app.orgData.memberships.push({
    id: randomUUID(),
    organizationId,
    userId,
    role: OrganizationRole.MEMBER,
    createdAt: now,
    updatedAt: now,
  });
  return userId;
}

const listQuery = (over: Record<string, unknown> = {}) => ({
  page: 1,
  limit: 20,
  sortBy: "createdAt" as const,
  sortOrder: "desc" as const,
  ...over,
});

describe("CreateLead", () => {
  it("stores an unassigned NEW lead in the given organization, with null for omitted fields", async () => {
    const app = buildApp();
    const { lead } = await app.createLead.execute(orgA, { name: "Rahul Sharma" });

    expect(lead).toEqual({
      id: expect.any(String),
      name: "Rahul Sharma",
      email: null,
      phone: null,
      company: null,
      source: null,
      status: "NEW",
      assignedToUserId: null,
      notes: null,
      convertedAt: null,
      convertedCustomerId: null,
      pipelineStageId: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(app.leads.leads[0].organizationId).toBe(orgA);
  });

  it("does not leak the organization id", async () => {
    const app = buildApp();
    const { lead } = await app.createLead.execute(orgA, { name: "Rahul" });
    expect(lead).not.toHaveProperty("organizationId");
  });
});

describe("GetLead", () => {
  it("returns the lead with its notes", async () => {
    const app = buildApp();
    const { lead } = await app.createLead.execute(orgA, { name: "Rahul", notes: "Hot" });
    expect((await app.getLead.execute(orgA, lead.id)).lead).toEqual(lead);
  });

  it("is LEAD_NOT_FOUND for an unknown id and for a lead of another organization", async () => {
    const app = buildApp();
    const { lead } = await app.createLead.execute(orgA, { name: "Rahul" });
    await expect(app.getLead.execute(orgA, randomUUID())).rejects.toMatchObject({ code: "LEAD_NOT_FOUND" });
    await expect(app.getLead.execute(orgB, lead.id)).rejects.toMatchObject({ code: "LEAD_NOT_FOUND" });
  });
});

describe("ListLeads", () => {
  it("lists only the organization's leads, without notes, with pagination", async () => {
    const app = buildApp();
    await app.createLead.execute(orgA, { name: "One", notes: "secret" });
    await app.createLead.execute(orgA, { name: "Two" });
    await app.createLead.execute(orgB, { name: "Other org" });

    const result = await app.listLeads.execute(orgA, listQuery({ limit: 1 }));
    expect(result.leads).toHaveLength(1);
    expect(result.leads[0]).not.toHaveProperty("notes");
    expect(result.pagination).toEqual({
      page: 1,
      limit: 1,
      totalItems: 2,
      totalPages: 2,
      hasNextPage: true,
      hasPreviousPage: false,
    });
  });

  it("filters by status, source and assignee, and searches name, email, phone and company", async () => {
    const app = buildApp();
    const assignee = addMember(app, orgA);
    await app.createLead.execute(orgA, { name: "Rahul", source: "WEBSITE" });
    const { lead: other } = await app.createLead.execute(orgA, {
      name: "Priya",
      email: "priya@acme.com",
      company: "Globex",
      source: "REFERRAL",
    });
    await app.updateLead.execute(orgA, other.id, { status: "QUALIFIED", assignedToUserId: assignee });

    const names = async (over: Record<string, unknown>) =>
      (await app.listLeads.execute(orgA, listQuery(over))).leads.map((l) => l.name);

    expect(await names({ status: "QUALIFIED" })).toEqual(["Priya"]);
    expect(await names({ source: "WEBSITE" })).toEqual(["Rahul"]);
    expect(await names({ assignedToUserId: assignee })).toEqual(["Priya"]);
    expect(await names({ search: "ACME" })).toEqual(["Priya"]);
    expect(await names({ search: "globex" })).toEqual(["Priya"]);
    expect(await names({ search: "nobody" })).toEqual([]);
  });
});

describe("UpdateLead", () => {
  it("changes the given fields, clears a field with null, and leaves the rest", async () => {
    const app = buildApp();
    const { lead } = await app.createLead.execute(orgA, { name: "Rahul", company: "ABC", notes: "x" });
    const { lead: updated } = await app.updateLead.execute(orgA, lead.id, {
      name: "Rahul S",
      status: "CONTACTED",
      company: null,
    });
    expect(updated).toMatchObject({ name: "Rahul S", status: "CONTACTED", company: null, notes: "x" });
  });

  it("is LEAD_NOT_FOUND for another organization's lead", async () => {
    const app = buildApp();
    const { lead } = await app.createLead.execute(orgA, { name: "Rahul" });
    await expect(app.updateLead.execute(orgB, lead.id, { name: "Hacked" })).rejects.toMatchObject({
      code: "LEAD_NOT_FOUND",
    });
    expect(app.leads.leads[0].name).toBe("Rahul");
  });

  it("assigns a member of the organization and unassigns with null", async () => {
    const app = buildApp();
    const member = addMember(app, orgA);
    const { lead } = await app.createLead.execute(orgA, { name: "Rahul" });

    const assigned = await app.updateLead.execute(orgA, lead.id, { assignedToUserId: member });
    expect(assigned.lead.assignedToUserId).toBe(member);

    const unassigned = await app.updateLead.execute(orgA, lead.id, { assignedToUserId: null });
    expect(unassigned.lead.assignedToUserId).toBeNull();
  });

  it("rejects an assignee who is not a member, or is a member of another organization only", async () => {
    const app = buildApp();
    const { lead } = await app.createLead.execute(orgA, { name: "Rahul" });
    const orgBMember = addMember(app, orgB);

    for (const userId of [randomUUID(), orgBMember]) {
      await expect(app.updateLead.execute(orgA, lead.id, { assignedToUserId: userId })).rejects.toMatchObject({
        code: "ASSIGNED_USER_NOT_MEMBER",
      });
    }
    expect(app.leads.leads[0].assignedToUserId).toBeNull();
  });

  it("is LEAD_ALREADY_CONVERTED for a converted lead, and changes nothing", async () => {
    const app = buildApp();
    const { lead } = await app.createLead.execute(orgA, { name: "Rahul" });
    await app.convertLead.execute(orgA, lead.id);

    await expect(app.updateLead.execute(orgA, lead.id, { name: "Changed" })).rejects.toMatchObject({
      code: "LEAD_ALREADY_CONVERTED",
    });
    expect(app.leads.leads[0].name).toBe("Rahul");
  });
});

describe("DeleteLead", () => {
  it("deletes the lead, and not the customer it was converted into", async () => {
    const app = buildApp();
    const { lead } = await app.createLead.execute(orgA, { name: "Rahul" });
    await app.convertLead.execute(orgA, lead.id);

    await app.deleteLead.execute(orgA, lead.id);
    expect(app.leads.leads).toHaveLength(0);
    expect(app.customers.customers).toHaveLength(1);
  });

  it("is LEAD_NOT_FOUND for another organization's lead", async () => {
    const app = buildApp();
    const { lead } = await app.createLead.execute(orgA, { name: "Rahul" });
    await expect(app.deleteLead.execute(orgB, lead.id)).rejects.toMatchObject({ code: "LEAD_NOT_FOUND" });
    expect(app.leads.leads).toHaveLength(1);
  });
});

describe("ConvertLead", () => {
  it("creates a customer in the same organization from the lead and marks the lead converted", async () => {
    const app = buildApp();
    const { lead } = await app.createLead.execute(orgA, {
      name: "Rahul Sharma",
      email: "rahul@example.com",
      phone: "+919876543210",
      company: "ABC Technologies",
      notes: "Interested",
    });

    const result = await app.convertLead.execute(orgA, lead.id);

    expect(app.customers.customers).toHaveLength(1);
    expect(app.customers.customers[0]).toMatchObject({
      organizationId: orgA,
      name: "Rahul Sharma",
      email: "rahul@example.com",
      phone: "+919876543210",
      company: "ABC Technologies",
      notes: "Interested",
    });
    expect(result.customer).toMatchObject({ id: app.customers.customers[0].id, name: "Rahul Sharma" });
    expect(result.lead).toMatchObject({
      status: "CONVERTED",
      convertedAt: expect.any(String),
      convertedCustomerId: result.customer.id,
    });
  });

  it("is LEAD_ALREADY_CONVERTED the second time, and creates no second customer", async () => {
    const app = buildApp();
    const { lead } = await app.createLead.execute(orgA, { name: "Rahul" });
    await app.convertLead.execute(orgA, lead.id);

    await expect(app.convertLead.execute(orgA, lead.id)).rejects.toMatchObject({
      code: "LEAD_ALREADY_CONVERTED",
    });
    expect(app.customers.customers).toHaveLength(1);
  });

  it("is LEAD_NOT_FOUND for another organization's lead, and creates no customer", async () => {
    const app = buildApp();
    const { lead } = await app.createLead.execute(orgA, { name: "Rahul" });
    await expect(app.convertLead.execute(orgB, lead.id)).rejects.toMatchObject({ code: "LEAD_NOT_FOUND" });
    expect(app.customers.customers).toHaveLength(0);
  });
});

describe("lead permissions", () => {
  it("lets every role do everything with leads except a MEMBER deleting", () => {
    const actions = [
      OrganizationPermission.LEAD_READ,
      OrganizationPermission.LEAD_CREATE,
      OrganizationPermission.LEAD_UPDATE,
      OrganizationPermission.LEAD_ASSIGN,
      OrganizationPermission.LEAD_CONVERT,
    ];
    for (const role of [OrganizationRole.OWNER, OrganizationRole.ADMIN, OrganizationRole.MEMBER]) {
      for (const action of actions) expect(hasPermission(role, action)).toBe(true);
    }
    expect(hasPermission(OrganizationRole.OWNER, OrganizationPermission.LEAD_DELETE)).toBe(true);
    expect(hasPermission(OrganizationRole.ADMIN, OrganizationPermission.LEAD_DELETE)).toBe(true);
    expect(hasPermission(OrganizationRole.MEMBER, OrganizationPermission.LEAD_DELETE)).toBe(false);
  });
});
