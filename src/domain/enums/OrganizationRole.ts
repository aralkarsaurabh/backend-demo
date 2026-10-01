export const OrganizationRole = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  MEMBER: "MEMBER",
} as const;

export type OrganizationRole = (typeof OrganizationRole)[keyof typeof OrganizationRole];
