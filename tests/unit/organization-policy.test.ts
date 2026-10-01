import { describe, expect, it } from "vitest";
import { slugify } from "../../src/application/use-cases/organization/slugify";
import { OrganizationRole } from "../../src/domain/enums/OrganizationRole";
import {
  OrganizationPermission,
  canInviteRole,
  hasPermission,
  outranks,
} from "../../src/domain/policies/OrganizationPermissions";

const { OWNER, ADMIN, MEMBER } = OrganizationRole;
const P = OrganizationPermission;

describe("role to permission mapping", () => {
  const matrix: Array<[OrganizationRole, OrganizationPermission, boolean]> = [
    [OWNER, P.ORGANIZATION_READ, true],
    [OWNER, P.MEMBER_READ, true],
    [OWNER, P.MEMBER_INVITE, true],
    [OWNER, P.MEMBER_REMOVE, true],
    [OWNER, P.MEMBER_UPDATE_ROLE, true],
    [ADMIN, P.ORGANIZATION_READ, true],
    [ADMIN, P.MEMBER_READ, true],
    [ADMIN, P.MEMBER_INVITE, true],
    [ADMIN, P.MEMBER_REMOVE, true],
    [ADMIN, P.MEMBER_UPDATE_ROLE, false],
    [MEMBER, P.ORGANIZATION_READ, true],
    [MEMBER, P.MEMBER_READ, true],
    [MEMBER, P.MEMBER_INVITE, false],
    [MEMBER, P.MEMBER_REMOVE, false],
    [MEMBER, P.MEMBER_UPDATE_ROLE, false],
  ];

  it.each(matrix)("%s / %s -> %s", (role, permission, expected) => {
    expect(hasPermission(role, permission)).toBe(expected);
  });
});

describe("rank rules", () => {
  it("outranks is strict", () => {
    expect(outranks(OWNER, ADMIN)).toBe(true);
    expect(outranks(OWNER, MEMBER)).toBe(true);
    expect(outranks(ADMIN, MEMBER)).toBe(true);
    expect(outranks(ADMIN, ADMIN)).toBe(false);
    expect(outranks(MEMBER, MEMBER)).toBe(false);
    expect(outranks(ADMIN, OWNER)).toBe(false);
    expect(outranks(MEMBER, ADMIN)).toBe(false);
  });

  it("OWNER can invite ADMIN and MEMBER, ADMIN only MEMBER, MEMBER nobody, and nobody OWNER", () => {
    expect(canInviteRole(OWNER, ADMIN)).toBe(true);
    expect(canInviteRole(OWNER, MEMBER)).toBe(true);
    expect(canInviteRole(ADMIN, MEMBER)).toBe(true);
    expect(canInviteRole(ADMIN, ADMIN)).toBe(false);
    expect(canInviteRole(MEMBER, MEMBER)).toBe(false);
    expect(canInviteRole(OWNER, OWNER)).toBe(false);
    expect(canInviteRole(ADMIN, OWNER)).toBe(false);
  });
});

describe("slugify", () => {
  it.each([
    ["Acme Technologies", "acme-technologies"],
    ["  Busy   Brains.AI  ", "busy-brains-ai"],
    ["Café Münchën", "cafe-munchen"],
    ["---Hello---", "hello"],
    ["!!!", "org"],
    ["日本語", "org"],
  ])("%j -> %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("cuts at 48 characters without leaving a trailing hyphen", () => {
    const slug = slugify(`${"a".repeat(47)} b`);
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug.endsWith("-")).toBe(false);
    expect(slugify("x".repeat(100))).toHaveLength(48);
  });
});
