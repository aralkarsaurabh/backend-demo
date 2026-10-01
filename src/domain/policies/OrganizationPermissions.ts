import { OrganizationRole } from "../enums/OrganizationRole";

export const OrganizationPermission = {
  ORGANIZATION_READ: "organization:read",
  MEMBER_READ: "member:read",
  MEMBER_INVITE: "member:invite",
  MEMBER_REMOVE: "member:remove",
  MEMBER_UPDATE_ROLE: "member:update_role",
} as const;

export type OrganizationPermission =
  (typeof OrganizationPermission)[keyof typeof OrganizationPermission];

/** Roles map to permissions in code; there is no database-configurable RBAC. */
export const ROLE_PERMISSIONS: Record<OrganizationRole, readonly OrganizationPermission[]> = {
  OWNER: [
    OrganizationPermission.ORGANIZATION_READ,
    OrganizationPermission.MEMBER_READ,
    OrganizationPermission.MEMBER_INVITE,
    OrganizationPermission.MEMBER_REMOVE,
    OrganizationPermission.MEMBER_UPDATE_ROLE,
  ],
  ADMIN: [
    OrganizationPermission.ORGANIZATION_READ,
    OrganizationPermission.MEMBER_READ,
    OrganizationPermission.MEMBER_INVITE,
    OrganizationPermission.MEMBER_REMOVE,
  ],
  MEMBER: [OrganizationPermission.ORGANIZATION_READ, OrganizationPermission.MEMBER_READ],
};

export function hasPermission(role: OrganizationRole, permission: OrganizationPermission) {
  return ROLE_PERMISSIONS[role].includes(permission);
}

const RANK: Record<OrganizationRole, number> = { OWNER: 3, ADMIN: 2, MEMBER: 1 };

/** True when `actor` is strictly senior to `target`. */
export function outranks(actor: OrganizationRole, target: OrganizationRole) {
  return RANK[actor] > RANK[target];
}

/** OWNER can never be invited; otherwise the actor must outrank the invited role. */
export function canInviteRole(actor: OrganizationRole, invited: OrganizationRole) {
  return invited !== OrganizationRole.OWNER && outranks(actor, invited);
}
