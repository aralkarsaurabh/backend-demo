import { describe, expect, it } from "vitest";
import { OrganizationRole } from "../../src/domain/enums/OrganizationRole";
import { OrganizationPermission, hasPermission } from "../../src/domain/policies/OrganizationPermissions";

const { OWNER, ADMIN, MEMBER } = OrganizationRole;
const P = OrganizationPermission;

describe("pipeline permissions", () => {
  const everyone = [P.PIPELINE_READ, P.PIPELINE_MOVE_LEAD];
  const managers = [P.PIPELINE_CREATE, P.PIPELINE_UPDATE, P.PIPELINE_DELETE, P.PIPELINE_MANAGE_STAGES];

  it.each(everyone)("every role has %s", (permission) => {
    for (const role of [OWNER, ADMIN, MEMBER]) expect(hasPermission(role, permission)).toBe(true);
  });

  it.each(managers)("OWNER and ADMIN have %s, MEMBER does not", (permission) => {
    expect(hasPermission(OWNER, permission)).toBe(true);
    expect(hasPermission(ADMIN, permission)).toBe(true);
    expect(hasPermission(MEMBER, permission)).toBe(false);
  });

  it("uses the documented permission names", () => {
    expect([...everyone, ...managers].sort()).toEqual(
      [
        "pipeline:read",
        "pipeline:move_lead",
        "pipeline:create",
        "pipeline:update",
        "pipeline:delete",
        "pipeline:manage_stages",
      ].sort(),
    );
  });
});
