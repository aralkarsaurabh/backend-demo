import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createLeadRequestSchema,
  leadListQuerySchema,
  updateLeadRequestSchema,
} from "../../src/application/dto/lead/LeadRequests";

describe("createLeadRequestSchema", () => {
  it("accepts a name alone and trims and collapses it", () => {
    expect(createLeadRequestSchema.parse({ name: "  Rahul   Sharma " })).toEqual({ name: "Rahul Sharma" });
  });

  it("rejects an empty name, a bad email, a bad source and a too long note", () => {
    for (const body of [
      { name: "  " },
      { name: "A", email: "nope" },
      { name: "A", source: "TELEPATHY" },
      { name: "A", notes: "x".repeat(1001) },
    ]) {
      expect(createLeadRequestSchema.safeParse(body).success).toBe(false);
    }
  });

  it("rejects fields the server owns", () => {
    for (const extra of [
      { organizationId: randomUUID() },
      { id: randomUUID() },
      { status: "QUALIFIED" },
      { assignedToUserId: randomUUID() },
      { convertedAt: new Date().toISOString() },
      { convertedCustomerId: randomUUID() },
    ]) {
      expect(createLeadRequestSchema.safeParse({ name: "A", ...extra }).success).toBe(false);
    }
  });
});

describe("updateLeadRequestSchema", () => {
  it("needs at least one field", () => {
    expect(updateLeadRequestSchema.safeParse({}).success).toBe(false);
  });

  it("accepts status changes among the open statuses, and null to clear or unassign", () => {
    for (const status of ["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED", "LOST"]) {
      expect(updateLeadRequestSchema.safeParse({ status }).success).toBe(true);
    }
    expect(
      updateLeadRequestSchema.safeParse({ email: null, source: null, assignedToUserId: null }).success,
    ).toBe(true);
  });

  it("never accepts CONVERTED as a status, only the convert endpoint sets it", () => {
    expect(updateLeadRequestSchema.safeParse({ status: "CONVERTED" }).success).toBe(false);
  });

  it("rejects a null name, a bad assignee id and unknown fields", () => {
    expect(updateLeadRequestSchema.safeParse({ name: null }).success).toBe(false);
    expect(updateLeadRequestSchema.safeParse({ assignedToUserId: "abc" }).success).toBe(false);
    expect(updateLeadRequestSchema.safeParse({ name: "A", organizationId: randomUUID() }).success).toBe(false);
  });
});

describe("leadListQuerySchema", () => {
  it("applies the defaults", () => {
    expect(leadListQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 20,
      sortBy: "createdAt",
      sortOrder: "desc",
    });
  });

  it("coerces numbers and turns dates into inclusive day bounds", () => {
    const query = leadListQuerySchema.parse({
      page: "2",
      limit: "50",
      createdFrom: "2026-09-01",
      createdTo: "2026-09-30",
      status: "QUALIFIED",
      source: "WEBSITE",
    });
    expect(query).toMatchObject({ page: 2, limit: 50, status: "QUALIFIED", source: "WEBSITE" });
    expect(query.createdFrom?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(query.createdTo?.toISOString()).toBe("2026-09-30T23:59:59.999Z");
  });

  it("rejects a limit over 100, a bad sort field, a reversed date range and unknown keys", () => {
    for (const query of [
      { limit: "101" },
      { page: "0" },
      { sortBy: "password" },
      { createdFrom: "2026-09-30", createdTo: "2026-09-01" },
      { assignedToUserId: "abc" },
      { status: "CLOSED" },
      { company: "Acme" },
    ]) {
      expect(leadListQuerySchema.safeParse(query).success).toBe(false);
    }
  });
});
