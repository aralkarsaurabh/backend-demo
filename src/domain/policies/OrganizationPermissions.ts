import { OrganizationRole } from "../enums/OrganizationRole";

export const OrganizationPermission = {
  ORGANIZATION_READ: "organization:read",
  MEMBER_READ: "member:read",
  MEMBER_INVITE: "member:invite",
  MEMBER_REMOVE: "member:remove",
  MEMBER_UPDATE_ROLE: "member:update_role",
  CUSTOMER_READ: "customer:read",
  CUSTOMER_CREATE: "customer:create",
  CUSTOMER_UPDATE: "customer:update",
  CUSTOMER_DELETE: "customer:delete",
  LEAD_READ: "lead:read",
  LEAD_CREATE: "lead:create",
  LEAD_UPDATE: "lead:update",
  LEAD_ASSIGN: "lead:assign",
  LEAD_CONVERT: "lead:convert",
  LEAD_DELETE: "lead:delete",
  PIPELINE_READ: "pipeline:read",
  PIPELINE_CREATE: "pipeline:create",
  PIPELINE_UPDATE: "pipeline:update",
  PIPELINE_DELETE: "pipeline:delete",
  PIPELINE_MANAGE_STAGES: "pipeline:manage_stages",
  PIPELINE_MOVE_LEAD: "pipeline:move_lead",
} as const;

export type OrganizationPermission =
  (typeof OrganizationPermission)[keyof typeof OrganizationPermission];

/** Everything a MEMBER may do with customers: everything except delete. */
const CUSTOMER_MANAGE = [
  OrganizationPermission.CUSTOMER_READ,
  OrganizationPermission.CUSTOMER_CREATE,
  OrganizationPermission.CUSTOMER_UPDATE,
] as const;

/** Everything a MEMBER may do with leads: everything except delete. */
const LEAD_MANAGE = [
  OrganizationPermission.LEAD_READ,
  OrganizationPermission.LEAD_CREATE,
  OrganizationPermission.LEAD_UPDATE,
  OrganizationPermission.LEAD_ASSIGN,
  OrganizationPermission.LEAD_CONVERT,
] as const;

/** What every member may do with pipelines: look at them and move leads through them. */
const PIPELINE_USE = [
  OrganizationPermission.PIPELINE_READ,
  OrganizationPermission.PIPELINE_MOVE_LEAD,
] as const;

/** Defining pipelines and their stages is for OWNER and ADMIN only. */
const PIPELINE_MANAGE = [
  OrganizationPermission.PIPELINE_CREATE,
  OrganizationPermission.PIPELINE_UPDATE,
  OrganizationPermission.PIPELINE_DELETE,
  OrganizationPermission.PIPELINE_MANAGE_STAGES,
] as const;

/** Roles map to permissions in code; there is no database-configurable RBAC. */
export const ROLE_PERMISSIONS: Record<OrganizationRole, readonly OrganizationPermission[]> = {
  OWNER: [
    OrganizationPermission.ORGANIZATION_READ,
    OrganizationPermission.MEMBER_READ,
    OrganizationPermission.MEMBER_INVITE,
    OrganizationPermission.MEMBER_REMOVE,
    OrganizationPermission.MEMBER_UPDATE_ROLE,
    ...CUSTOMER_MANAGE,
    OrganizationPermission.CUSTOMER_DELETE,
    ...LEAD_MANAGE,
    OrganizationPermission.LEAD_DELETE,
    ...PIPELINE_USE,
    ...PIPELINE_MANAGE,
  ],
  ADMIN: [
    OrganizationPermission.ORGANIZATION_READ,
    OrganizationPermission.MEMBER_READ,
    OrganizationPermission.MEMBER_INVITE,
    OrganizationPermission.MEMBER_REMOVE,
    ...CUSTOMER_MANAGE,
    OrganizationPermission.CUSTOMER_DELETE,
    ...LEAD_MANAGE,
    OrganizationPermission.LEAD_DELETE,
    ...PIPELINE_USE,
    ...PIPELINE_MANAGE,
  ],
  MEMBER: [
    OrganizationPermission.ORGANIZATION_READ,
    OrganizationPermission.MEMBER_READ,
    ...CUSTOMER_MANAGE,
    ...LEAD_MANAGE,
    ...PIPELINE_USE,
  ],
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
