import { RefreshToken } from "../entities/RefreshToken";

export interface NewRefreshToken {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface RefreshTokenRepository {
  create(data: NewRefreshToken): Promise<RefreshToken>;

  findById(id: string): Promise<RefreshToken | null>;

  /**
   * Atomically rotates a token: in one transaction, revokes `currentId`
   * (only if it is not already revoked), sets its `replacedBy`, and inserts
   * `next`. Returns false, changing nothing, if `currentId` was already
   * revoked, so two concurrent refreshes can never both succeed.
   */
  rotate(currentId: string, next: NewRefreshToken): Promise<boolean>;

  /** Revokes every not-yet-revoked token in the family. */
  revokeFamily(familyId: string): Promise<void>;

  /** Revokes every not-yet-revoked token of the user, across all families. */
  revokeAllForUser(userId: string): Promise<void>;
}
