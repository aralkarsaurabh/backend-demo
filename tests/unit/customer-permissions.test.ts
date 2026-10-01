import { describe, expect, it } from "vitest";
import { OrganizationRole } from "../../src/domain/enums/OrganizationRole";
import { OrganizationPermission, hasPermission } from "../../src/domain/policies/OrganizationPermissions";

const { OWNER, ADMIN, MEMBER } = OrganizationRole;
const P = OrganizationPermission;

describe("customer permissions", () => {
  const matrix: Array<[OrganizationRole, OrganizationPermission, boolean]> = [
    [OWNER, P.CUSTOMER_READ, true],
    [OWNER, P.CUSTOMER_CREATE, true],
    [OWNER, P.CUSTOMER_UPDATE, true],
    [OWNER, P.CUSTOMER_DELETE, true],
    [ADMIN, P.CUSTOMER_READ, true],
    [ADMIN, P.CUSTOMER_CREATE, true],
    [ADMIN, P.CUSTOMER_UPDATE, true],
    [ADMIN, P.CUSTOMER_DELETE, true],
    [MEMBER, P.CUSTOMER_READ, true],
    [MEMBER, P.CUSTOMER_CREATE, true],
    [MEMBER, P.CUSTOMER_UPDATE, true],
    [MEMBER, P.CUSTOMER_DELETE, false],
  ];

  it.each(matrix)("%s / %s -> %s", (role, permission, expected) => {
    expect(hasPermission(role, permission)).toBe(expected);
  });

  it("uses the documented permission names", () => {
    expect([P.CUSTOMER_READ, P.CUSTOMER_CREATE, P.CUSTOMER_UPDATE, P.CUSTOMER_DELETE]).toEqual([
      "customer:read",
      "customer:create",
      "customer:update",
      "customer:delete",
    ]);
  });
});
