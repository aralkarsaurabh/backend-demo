import { describe, expect, it } from "vitest";
import { customerListQuerySchema } from "../../src/application/dto/customer/CustomerRequests";

const parse = (input: unknown) => customerListQuerySchema.safeParse(input);

describe("customerListQuerySchema", () => {
  it("applies the defaults", () => {
    expect(parse({})).toMatchObject({
      success: true,
      data: { page: 1, limit: 20, sortBy: "createdAt", sortOrder: "desc" },
    });
  });

  it("turns query strings into numbers and trims text", () => {
    const res = parse({ page: "2", limit: "50", search: "  acme ", company: " Acme " });
    expect(res).toMatchObject({ success: true, data: { page: 2, limit: 50, search: "acme", company: "Acme" } });
  });

  it("reads the date range as whole UTC days, both ends inclusive", () => {
    const res = parse({ createdFrom: "2026-09-01", createdTo: "2026-09-30" });
    expect(res.success && res.data.createdFrom?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(res.success && res.data.createdTo?.toISOString()).toBe("2026-09-30T23:59:59.999Z");
  });

  it("accepts a single-day range", () => {
    expect(parse({ createdFrom: "2026-09-01", createdTo: "2026-09-01" }).success).toBe(true);
  });

  it.each([
    ["page 0", { page: "0" }],
    ["page not a number", { page: "abc" }],
    ["page fractional", { page: "1.5" }],
    ["limit 0", { limit: "0" }],
    ["limit 101", { limit: "101" }],
    ["empty search", { search: "" }],
    ["blank search", { search: "   " }],
    ["search too long", { search: "x".repeat(101) }],
    ["company too long", { company: "x".repeat(151) }],
    ["bad date", { createdFrom: "2026-02-30" }],
    ["date with time", { createdFrom: "2026-09-01T10:00:00Z" }],
    ["from after to", { createdFrom: "2026-09-30", createdTo: "2026-09-01" }],
    ["unlisted sort field", { sortBy: "passwordHash" }],
    ["bad sort order", { sortOrder: "up" }],
    ["unknown key", { organizationId: "x" }],
    ["repeated key", { search: ["a", "b"] }],
  ])("rejects %s", (_label, input) => {
    expect(parse(input).success).toBe(false);
  });
});
