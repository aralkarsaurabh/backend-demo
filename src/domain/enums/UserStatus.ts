export const UserStatus = {
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  DEACTIVATED: "DEACTIVATED",
} as const;

export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];
