import { describe, expect, it } from "vitest";
import { updateCustomerRequestSchema } from "../../src/application/dto/customer/CustomerRequests";

const parse = (input: unknown) => updateCustomerRequestSchema.safeParse(input);

describe("updateCustomerRequestSchema", () => {
  it("accepts any one field on its own", () => {
    for (const body of [
      { name: "Acme" },
      { email: "a@b.io" },
      { phone: "123" },
      { company: "Acme" },
      { notes: "hi" },
    ]) {
      expect(parse(body).success, JSON.stringify(body)).toBe(true);
    }
  });

  it("trims, collapses the name and lowercases the email", () => {
    expect(parse({ name: "  Acme   Ltd ", email: " A@B.IO ", notes: " x " })).toMatchObject({
      success: true,
      data: { name: "Acme Ltd", email: "a@b.io", notes: "x" },
    });
  });

  it("lets null clear the optional fields", () => {
    expect(parse({ email: null, phone: null, company: null, notes: null })).toMatchObject({
      success: true,
      data: { email: null, phone: null, company: null, notes: null },
    });
  });

  it.each([
    ["empty body", {}],
    ["only undefined values", { name: undefined }],
    ["null name", { name: null }],
    ["empty name", { name: "  " }],
    ["name too long", { name: "x".repeat(101) }],
    ["bad email", { email: "nope" }],
    ["empty phone", { phone: "" }],
    ["notes too long", { notes: "n".repeat(1001) }],
    ["organizationId", { name: "A", organizationId: "x" }],
    ["id", { id: "x" }],
    ["createdAt", { createdAt: "2026-01-01" }],
    ["unknown key", { name: "A", extra: 1 }],
  ])("rejects %s", (_label, input) => {
    expect(parse(input).success).toBe(false);
  });
});
