import { UserStatus } from "../enums/UserStatus";

/** Which status an account may move to from each status. */
const ALLOWED_TRANSITIONS: Record<UserStatus, readonly UserStatus[]> = {
  ACTIVE: [UserStatus.SUSPENDED, UserStatus.DEACTIVATED],
  SUSPENDED: [UserStatus.ACTIVE, UserStatus.DEACTIVATED],
  DEACTIVATED: [UserStatus.ACTIVE],
};

export function canTransitionStatus(from: UserStatus, to: UserStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Statuses that block login and refresh. */
export function isBlockedStatus(status: UserStatus): boolean {
  return status !== UserStatus.ACTIVE;
}
