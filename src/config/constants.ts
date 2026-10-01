export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export const PASSWORD_MIN_LENGTH = 8;
// bcrypt ignores everything past 72 bytes
export const PASSWORD_MAX_LENGTH = 72;

export const NAME_MAX_LENGTH = 100;
export const EMAIL_MAX_LENGTH = 254;
export const TOKEN_MAX_LENGTH = 2048;
