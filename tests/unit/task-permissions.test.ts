import { describe, expect, it } from "vitest";
import { OrganizationRole } from "../../src/domain/enums/OrganizationRole";
import { OrganizationPermission, hasPermission } from "../../src/domain/policies/OrganizationPermissions";

const P = OrganizationPermission;

describe("task permissions", () => {
  it("lets every organization role read, create, update and assign tasks", () => {
    for (const role of [OrganizationRole.OWNER, OrganizationRole.ADMIN, OrganizationRole.MEMBER]) {
      for (const permission of [P.TASK_READ, P.TASK_CREATE, P.TASK_UPDATE, P.TASK_ASSIGN]) {
        expect(hasPermission(role, permission)).toBe(true);
      }
    }
  });

  it("lets only OWNER and ADMIN delete tasks", () => {
    expect(hasPermission(OrganizationRole.OWNER, P.TASK_DELETE)).toBe(true);
    expect(hasPermission(OrganizationRole.ADMIN, P.TASK_DELETE)).toBe(true);
    expect(hasPermission(OrganizationRole.MEMBER, P.TASK_DELETE)).toBe(false);
  });

  it("uses the agreed permission names", () => {
    expect([P.TASK_READ, P.TASK_CREATE, P.TASK_UPDATE, P.TASK_ASSIGN, P.TASK_DELETE]).toEqual([
      "task:read",
      "task:create",
      "task:update",
      "task:assign",
      "task:delete",
    ]);
  });
});
