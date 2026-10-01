# User Management

Documentation for the user-management feature of `backend-demo`: profile, account update, password change and platform account status. It builds on [Authentication & Authorisation](authentication-and-authorisation.md) with the same tokens, envelope and error mechanism, and does not change [Organizations](organizations.md).

- **Specification:** [`docs/feature-contracts/20261001120000-user-management.md`](../docs/feature-contracts/20261001120000-user-management.md)

## 1. Three separate concepts

| Concept | Lives on | Answers |
|---|---|---|
| Platform role (`USER`/`ADMIN`) | `User.role` | May this user administer the platform? |
| Account status (`ACTIVE`/`SUSPENDED`/`DEACTIVATED`) | `User.status` | Can this user sign in? |
| Organization role (`OWNER`/`ADMIN`/`MEMBER`) | `OrganizationMembership.role` | What may this user do in an organization? |

Status affects authentication only. A suspended user keeps their memberships.

## 2. Data model

`User.status`, enum `UserStatus`, default `ACTIVE`, added by migration `20261001120000_add_user_status`. Existing users become `ACTIVE`.

## 3. Endpoints

All under `/api/v1`, all with the standard envelope.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/users/me` | access token | Profile |
| PATCH | `/users/me` | access token | Update name |
| POST | `/users/me/password` | access token | Change password |
| PATCH | `/users/:userId/status` | access token, `ADMIN` | Change a user's status |

### `GET /users/me`

**200:** `data: { "user": { id, name, email, role, status, createdAt, updatedAt } }`, read from the database.

### `PATCH /users/me`

```json
{ "name": "Asha Rao" }
```

Only `name` (trimmed, 1-100 characters). Any other field, including `email`, `role` and `status`, gives `400 VALIDATION_ERROR`. Email changes are not supported until email verification exists.

**200:** `Account updated successfully.` with the same `user` shape.

### `POST /users/me/password`

```json
{ "currentPassword": "old-password", "newPassword": "new-password" }
```

`newPassword` follows the registration policy (8-72 characters, no complexity rules). On success **all** refresh tokens of the user are revoked, including the caller's, so every device must sign in again. **200:** `data: null`.

**Errors:** `400 INVALID_CURRENT_PASSWORD`, `400 VALIDATION_ERROR`.

### `PATCH /users/:userId/status`

```json
{ "status": "SUSPENDED" }
```

Platform `ADMIN` only. Organization owners and admins cannot use it.

| From \ To | ACTIVE | SUSPENDED | DEACTIVATED |
|---|---|---|---|
| ACTIVE | `INVALID_USER_STATUS` | ok | ok |
| SUSPENDED | ok | `USER_ALREADY_SUSPENDED` | ok |
| DEACTIVATED | ok | `INVALID_USER_STATUS` | `USER_ALREADY_DEACTIVATED` |

Moving to `SUSPENDED` or `DEACTIVATED` revokes all of the target's refresh tokens. **200:** `User status updated successfully.` with the updated `user`.

**Errors:** `403 CANNOT_CHANGE_OWN_STATUS`, `404 USER_NOT_FOUND`, `400 VALIDATION_ERROR` (bad status or user id), the three conflict codes above, `401`, `403 FORBIDDEN` for a non-admin.

## 4. Effect on authentication

- `POST /auth/login`: after the password is verified, a suspended or deactivated account gets `403 ACCOUNT_SUSPENDED` or `403 ACCOUNT_DEACTIVATED`. A wrong password or unknown email still gets `401 INVALID_CREDENTIALS`, so the status is not revealed without the password.
- `POST /auth/refresh`: the status is read from the database; a blocked account gets the same two codes.
- **Existing access tokens are not revoked** (decision D1 and D12). An access token issued before the change works until it expires, up to 15 minutes. Making suspension immediate would need a status read in `authenticate()` on every request.

## 5. Error codes

| Code | HTTP | When |
|---|---|---|
| `INVALID_CURRENT_PASSWORD` | 400 | Wrong current password (400, not 401, so clients do not treat it as an expired session) |
| `ACCOUNT_SUSPENDED` | 403 | Login or refresh for a suspended account |
| `ACCOUNT_DEACTIVATED` | 403 | Login or refresh for a deactivated account |
| `USER_ALREADY_SUSPENDED` | 409 | Suspending a suspended user |
| `USER_ALREADY_DEACTIVATED` | 409 | Deactivating a deactivated user |
| `INVALID_USER_STATUS` | 409 | Any other disallowed transition |
| `CANNOT_CHANGE_OWN_STATUS` | 403 | An admin changing their own status |

## 6. Known limits

No email change, password reset, email notification, suspension reason or expiry, audit table, or endpoint to change platform roles. Rate limiting is still missing, and it matters for the password-change endpoint too.
