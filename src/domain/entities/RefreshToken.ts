export interface RefreshToken {
  /** Equals the JWT `jti` claim. */
  id: string;
  userId: string;
  /** One family per login; inherited on every rotation. */
  familyId: string;
  /** SHA-256 of the token. The token itself is never stored. */
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  /** Set when this token was rotated into a new one. */
  replacedBy: string | null;
  createdAt: Date;
}
