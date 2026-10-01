# Feature Contract: Authentication & Authorization

> **Status: DRAFT v2 for discussion.** Nothing here is implemented.
> Decisions already made: one contract for all five capabilities; Express 5 + Prisma + PostgreSQL + Zod; Clean Architecture + Repository pattern + DTO layer (v2 revision).
> All former **[DECIDE]** items are now resolved: where the user's design specified an answer it is followed; where it was silent, the proposed default is adopted (each is marked "decided" in place). Items marked **[ES DEVIATION]** knowingly differ from an ES skill; all four are accepted.

### Deviations from ES conventions introduced by v2 (all accepted)

| # | Deviation | ES rule | Consequence of accepting |
|---|---|---|---|
| D1 | **ACCEPTED by user.** `role` is placed in the **access-token payload** and `authorize()` trusts it | `auth-infrastructure`: never put permissions in the token; check on the server every request | Role changes (promotion/demotion) take effect only when the access token expires (up to 15 min). Logout cannot kill an already-issued access token (same window). Saves one DB read per request. |
| D2 | **ACCEPTED.** **Layer-first Clean Architecture** folder layout (`domain/ application/ infrastructure/`) | `backend-architecture`: feature-first (NestJS) or feature-based api/logic/contract/data (Next.js) | Standard ES layout is not followed; future features must follow this layout or the repo becomes mixed. |
| D3 | **ACCEPTED.** Envelope adds a `meta.timestamp` field and `error.details` | `api-design` canonical envelope is `{success, message, data, error}` | Superset of the ES envelope; clients that ignore unknown keys are unaffected. |
| D4 | **ACCEPTED.** **TypeScript** (the pasted structure uses `.ts`; the repo is currently CommonJS JS) | n/a | Adds a TS toolchain (`typescript`, `tsx`/`ts-node`, `@types/*`) and converts the entrypoint from `server.js`. |

---

## 1. Feature Information

| Field | Value |
|---|---|
| ID | FC-AUTH-001 |
| Name | Authentication & Authorization |
| Module | auth |
| Priority | P0 (every other feature depends on it) |
| Status | Draft v2 |
| Owner | Saurabh Aralkar |
| Backend assignee | Saurabh Aralkar |
| Frontend assignee | N/A (no frontend in this repo) |
| Estimate | TBD after contract is agreed |

## 2. Business Objective

Let people create accounts and prove who they are, stay signed in safely without re-entering credentials, be signed out with their refresh capability actually revoked, and be restricted to the actions their role permits.

## 3. User Story

- As a visitor, I want to register and log in, so that I can use protected features.
- As a signed-in user, I want to stay signed in silently and sign out on demand, so that I'm both convenient and safe on shared devices.
- As an admin, I want admin-only endpoints that ordinary users cannot reach, so that privileged data stays protected.

## 4. Actors

| Actor | Description |
|---|---|
| Anonymous | Not signed in. Can register, log in, refresh/log out (holding a valid refresh token). |
| USER | Registered, signed-in, default role. |
| ADMIN | Signed-in with elevated role. Can call admin endpoints. |

Role set is `USER` and `ADMIN` only (matches the `UserRole` enum).

## 5. Entry Point

API-only. Entry is a client calling `POST /api/v1/auth/register` or `POST /api/v1/auth/login`. Every other protected endpoint is entered through the `authenticate` middleware defined here.

## 6. UI Reference

N/A: no UI in this repo. Client integration notes are in section 16.

## 7. User Flow

1. **Register**: client sends name + email + password → account created with role `USER` → response contains the user only (no tokens). The client then logs in.
2. **Login**: client sends email + password → server verifies → issues access token + refresh token (a new token family begins).
3. **Authenticated call**: client sends `Authorization: Bearer <accessToken>` → `authenticate()` verifies signature, expiry, `type = access` → attaches `{ id, role }` to the request → `authorize(...)` checks the role if required.
4. **Access token expires**: API returns `401 ACCESS_TOKEN_EXPIRED` → client calls `POST /auth/refresh` with `Authorization: Bearer <refreshToken>` → server returns a **new** access token and a **new** refresh token; the old refresh token is revoked and linked to its replacement.
5. **Refresh token reused**: an already-rotated refresh token is presented → server revokes the **entire token family** → `401 REFRESH_TOKEN_REUSED`; the user must log in again.
6. **Logout**: client sends its refresh token → that token's family is revoked → further refreshes fail with `REFRESH_TOKEN_REVOKED`. The already-issued access token remains valid until its natural expiry (≤15 min). See D1.
7. **Role-restricted call**: a USER calling an ADMIN endpoint → `403 FORBIDDEN`.

## 8. Fields

**Register: `POST /auth/register`**

| Field | Type | Required | Validation |
|---|---|---|---|
| name | string | yes | trimmed, 1–100 chars |
| email | string | yes | valid email, trimmed, lowercased, max 254 |
| password | string | yes | 8–72 chars (bcrypt ignores bytes past 72) |

**Login: `POST /auth/login`**

| Field | Type | Required | Validation |
|---|---|---|---|
| email | string | yes | valid email, trimmed, lowercased |
| password | string | yes | non-empty, max 72 |

**Refresh / Logout**

| Field | Type | Required | Validation |
|---|---|---|---|
| Authorization header | `Bearer <refreshToken>` | yes | well-formed bearer scheme, non-empty token, max 2048 chars |

Decided: logout takes the refresh token in the same `Authorization: Bearer` header as refresh, for consistency.

## 9. Validation Rules

- Zod schemas at the boundary, before any use case runs (ES `validation` skill). Unknown body keys are stripped.
- Validation failures return `VALIDATION_ERROR` with `error.details` as a map of field → human-readable message (see section 11 envelope).
- Email is normalised (trim + lowercase) before uniqueness check and lookup.
- Password: 8–72 chars, length only, no complexity rules (decided). Never trimmed, logged or returned.
- `passwordHash` is never present in any response DTO.

## 10. Business Rules

1. New accounts always get role `USER`. Role cannot be supplied at registration.
2. Email is unique (case-insensitive via normalisation).
3. Passwords are hashed through the `PasswordService` abstraction; the default implementation is **bcrypt** (already installed), cost 12 (decided). Argon2 can replace it without touching use cases.
4. **Access token**: JWT, **15 minutes**, signed with `JWT_ACCESS_SECRET`. Claims (each once): `sub` (user id), `role`, `type: "access"`, `iat`, `nbf`, `exp`. **[ES DEVIATION D1]**
5. **Refresh token**: JWT, **30 days**, signed with a separate `JWT_REFRESH_SECRET`. Claims (each once): `sub`, `type: "refresh"`, `jti`, `iat`, `nbf`, `exp`. **No `role`** in the refresh token: its job is to establish a new session, not to authorize operations.
6. `jti` equals the `RefreshToken.id` of the matching database row. Only a hash of the token is stored (`tokenHash`), never the token itself.
7. **Token family**: a login starts a family (`familyId`); every rotation inherits it. Decided: `familyId` is kept as the one addition to the reference schema (additive; the design's own "revoke the entire token family" requirement needs it). It makes "revoke the whole family" a single `UPDATE ... WHERE familyId = ?`, instead of walking the `replacedBy` chain.
8. **Rotation**: every successful refresh, in one transaction, revokes the presented token (`revokedAt = now`, `replacedBy = newTokenId`) and inserts the new one in the same family. The new refresh token's expiry is a fresh 30 days. Decided: no absolute family lifetime cap in this pass (listed in section 23).
9. **Reuse detection**: if a presented refresh token is already rotated (`replacedBy` is set), revoke every token in its family and return `REFRESH_TOKEN_REUSED`. If it was revoked by logout (`replacedBy` is null, `revokedAt` set) return `REFRESH_TOKEN_REVOKED`.
10. **Logout** revokes the presented token's whole family. Idempotent: logging out twice (or with an unrecognised token) still returns 200 with no information leak.
11. **Access tokens are stateless**: no DB lookup per request. Their only revocation mechanism is short life (D1).
12. **Authorization**: `authorize(...roles)` compares `req.user.role` (from the verified access token) to the allowed roles.
13. Login failure never reveals whether the email exists: unknown email and wrong password produce the same `INVALID_CREDENTIALS` response; a dummy hash comparison runs for unknown emails to equalise timing.
14. Registration reveals duplicates with `EMAIL_ALREADY_EXISTS` (decided; matches the design's error-code list; enumeration tradeoff accepted for usability).
15. **First admin bootstrap (decided)**: there is no API path to ADMIN. The first admin is created by a tracked seed (`create-admin-user`, see section 13.1) using `ADMIN_EMAIL` and `ADMIN_PASSWORD` from the environment. The password is hashed through `PasswordService` (same bcrypt path as registration); it is never committed, logged or stored in plain text. If a user with `ADMIN_EMAIL` already exists, the seed sets their role to `ADMIN` and leaves their password untouched. If either env var is missing the seed fails loudly and records nothing. (A role-change endpoint is out of scope; see section 23.)

## 11. API Contracts

All routes under `/api/v1`. **Every** response uses one envelope (D3).

**Success**
```json
{ "success": true, "message": "Human readable message.", "data": {}, "error": null,
  "meta": { "timestamp": "2026-10-01T07:40:00.000Z" } }
```
**Error**
```json
{ "success": false, "message": "The email or password is incorrect.", "data": null,
  "error": { "code": "INVALID_CREDENTIALS", "details": null },
  "meta": { "timestamp": "2026-10-01T07:40:00.000Z" } }
```
**Validation error**
```json
{ "success": false, "message": "Please correct the highlighted fields.", "data": null,
  "error": { "code": "VALIDATION_ERROR",
             "details": { "email": "Please provide a valid email address.",
                          "password": "Password must contain at least 8 characters." } },
  "meta": { "timestamp": "..." } }
```

### 11.1 `POST /api/v1/auth/register`
- **Auth:** none · **Body:** `{ "name": "Saurabh Aralkar", "email": "saurabh@example.com", "password": "..." }`
- **201:** message `Account created successfully.`, `data: { "user": { "id", "name", "email", "role": "USER" } }`
- **Failures:** 400 `VALIDATION_ERROR`, 409 `EMAIL_ALREADY_EXISTS`

### 11.2 `POST /api/v1/auth/login`
- **Auth:** none · **Body:** `{ "email", "password" }`
- **200:** message `Login successful.`
```json
"data": { "user": { "id": "uuid", "name": "...", "email": "...", "role": "USER" },
          "tokens": { "accessToken": "...", "refreshToken": "...", "tokenType": "Bearer", "expiresIn": 900 } }
```
- **Failures:** 400 `VALIDATION_ERROR`, 401 `INVALID_CREDENTIALS`

### 11.3 `POST /api/v1/auth/refresh`
- **Auth:** `Authorization: Bearer <refreshToken>`
- **200:** message `Token refreshed.`, `data: { "tokens": { accessToken, refreshToken, tokenType, expiresIn } }`. The presented refresh token is now revoked.
- **Failures:** 401 `INVALID_REFRESH_TOKEN`, 401 `REFRESH_TOKEN_EXPIRED`, 401 `REFRESH_TOKEN_REVOKED`, 401 `REFRESH_TOKEN_REUSED`, and 401 `INVALID_REFRESH_TOKEN` when the user no longer exists (decided: deleted accounts are not distinguishable)

### 11.4 `POST /api/v1/auth/logout`
- **Auth:** `Authorization: Bearer <refreshToken>` (see section 8)
- **200:** message `You have been logged out successfully.`, `data: null`
- **Failures:** none by design (idempotent). A missing header returns 400 `VALIDATION_ERROR`.

### 11.5 `GET /api/v1/users/me`
- **Auth:** `Authorization: Bearer <accessToken>`, any role
- **200:** `data: { "user": { id, name, email, role } }` (loaded fresh from the DB, so it reflects the current role even if the token's role is stale)
- **Failures:** 401 `UNAUTHORIZED`, 401 `INVALID_ACCESS_TOKEN`, 401 `ACCESS_TOKEN_EXPIRED`, 404 `USER_NOT_FOUND`

### 11.6 `GET /api/v1/admin/users` (ADMIN only; the RBAC demonstration endpoint)
- **Auth:** Bearer access token, role `ADMIN`
- **200:** `data: { "users": [ { id, name, email, role, createdAt } ] }` (no pagination in this pass)
- **Failures:** 401 as above, 403 `FORBIDDEN`

Decided: the reference design lists `GET /admin/...` without naming an endpoint. A placeholder shouldn't ship, so the concrete `GET /admin/users` is used.

## 12. Backend Processing Flow

### 12.1 Layering

```
Client → Express Route → Controller → Use Case → Domain interfaces → Infrastructure → PostgreSQL
```

**Rule: use cases and the domain must not import Express, Prisma, `jsonwebtoken` or `bcrypt`.** They depend only on interfaces:

| Interface (application/domain) | Implementation (infrastructure) |
|---|---|
| `UserRepository` (`findById`, `findByEmail`, `create`) | `PrismaUserRepository` |
| `RefreshTokenRepository` (`create`, `findById`, `rotate`, `revokeFamily`) | `PrismaRefreshTokenRepository` |
| `TokenService` (`generateAccessToken`, `generateRefreshToken`, `verifyAccessToken`, `verifyRefreshToken`) | `JwtTokenService` |
| `PasswordService` (`hash`, `compare`) | `BcryptPasswordService` |

Use cases: `RegisterUser`, `LoginUser`, `RefreshTokens`, `LogoutUser` (plus `GetCurrentUser` and `ListUsers` for the two read endpoints). Dependencies are injected via constructors, wired in one composition root (`app/`). No single `auth.service.ts`. **[ES DEVIATION D2]**

### 12.2 Folder structure

```
src/
├── app/            app.ts, routes.ts, middleware/{auth,role,error}.middleware.ts
├── config/         env.ts (Zod-validated env), constants.ts
├── domain/         entities/{User,RefreshToken}.ts, enums/UserRole.ts, repositories/*.ts
├── application/    dto/{auth,user}/*, use-cases/{auth,user}/*, services/{TokenService,PasswordService}.ts
├── infrastructure/ database/{prisma.ts, repositories/*}, authentication/{JwtTokenService,BcryptPasswordService}.ts, http/controllers/*
├── shared/         errors/{AppError,error-codes}.ts, response/ApiResponse.ts
└── server.ts
```

DTOs: `RegisterRequest`, `LoginRequest`, `AuthResponse`, `UserResponse`. Traditional MVVM is not applied to the backend; DTOs play the HTTP-facing model role.

### 12.3 Per-operation flow

**Register:** validate (Zod) → normalise email → `findByEmail` (reject if exists) → `PasswordService.hash` → `UserRepository.create` (role `USER`) → map to `UserResponse` → 201. A unique-constraint violation from a concurrent duplicate is mapped to `EMAIL_ALREADY_EXISTS`.

**Login:** validate → `findByEmail` → if missing, run a dummy `compare` → `compare` password → on mismatch `INVALID_CREDENTIALS` → new `familyId` → create `RefreshToken` row (id becomes `jti`, store `tokenHash`, `expiresAt = now + 30d`) → sign access (`sub`, `role`) + refresh (`sub`, `jti`) → respond.

**Refresh:** read bearer refresh token → `verifyRefreshToken` (signature, `type = refresh`, `exp`; expired → `REFRESH_TOKEN_EXPIRED`, malformed → `INVALID_REFRESH_TOKEN`) → `findById(jti)` and check `tokenHash` matches (else `INVALID_REFRESH_TOKEN`) → if `replacedBy` set: `revokeFamily`, `REFRESH_TOKEN_REUSED` → if `revokedAt` set: `REFRESH_TOKEN_REVOKED` → load user (missing → `INVALID_REFRESH_TOKEN`) → in one transaction: conditionally mark the token revoked (`WHERE revokedAt IS NULL`), insert the new token in the same family, set `replacedBy` → sign new pair → respond.
*Concurrency:* the conditional update means two simultaneous refreshes with the same token cannot both win; the loser takes the reuse path. Decided: strict. A client retrying after a network timeout can trigger a family revocation; a grace window is listed in section 23.

**Logout:** read bearer refresh token → verify (any failure → still 200) → `revokeFamily(familyId)` → 200.

**`authenticate()`:** read `Authorization` → require `Bearer` (else `UNAUTHORIZED`) → `verifyAccessToken` (expired → `ACCESS_TOKEN_EXPIRED`, anything else including `type != access` → `INVALID_ACCESS_TOKEN`) → attach `req.user = { id: sub, role }`.

**`authorize(...roles)`:** `req.user.role` not in `roles` → `FORBIDDEN`.

**Error middleware:** maps `AppError` (code + HTTP status + optional details) to the error envelope; unknown errors become `INTERNAL_SERVER_ERROR` with no internals leaked.

## 13. Database Impact

ES default is Supabase-hosted Postgres + Prisma; this contract assumes PostgreSQL via Prisma, with hosting a separate choice.

```prisma
enum UserRole { USER ADMIN }

model User {
  id            String         @id @default(uuid())
  name          String
  email         String         @unique
  passwordHash  String
  role          UserRole       @default(USER)
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  refreshTokens RefreshToken[]
}

model RefreshToken {
  id         String    @id @default(uuid())   // == JWT jti
  userId     String
  familyId   String                           // addition to reference schema, see section 10 rule 7
  tokenHash  String    @unique                // SHA-256 of the token
  expiresAt  DateTime
  revokedAt  DateTime?
  replacedBy String?
  createdAt  DateTime  @default(now())
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([familyId])
  @@index([expiresAt])
}
```

```prisma
model SeedMigration {
  id        String   @id @default(uuid())
  name      String   @unique            // seed filename, e.g. 20261001000000_create-admin-user
  appliedAt DateTime @default(now())

  @@map("_seed_migrations")
}
```

### 13.1 Migrations and seeds

- **Schema migrations:** applied **only** with `npx prisma migrate deploy`. Migration files are authored in development (`prisma migrate dev --create-only`, reviewed, committed) and never auto-applied by anything else. Decided: `--create-only` is the authoring workflow.
- **Seeds:** applied **only** with `npm run seed:deploy`. It is separate from, and runs after, `migrate deploy`. Prisma's built-in `prisma db seed` hook is not used.
- **Tracking:** table `_seed_migrations` (model `SeedMigration`, created by an ordinary Prisma migration) records each applied seed's `name` and `appliedAt`.
- **Seed files:** `prisma/seeds/<YYYYMMDDHHMMSS>_<kebab-name>.ts`, each exporting an `up(tx)` function. Files are ordered by filename.
- **Runner (`seed:deploy`):** list seed files → read `_seed_migrations` → for each seed not yet recorded, in filename order, run `up` and insert its `_seed_migrations` row **in the same transaction** (a failed seed leaves no row and aborts the run; earlier seeds stay applied) → skip already-applied seeds → print which seeds were applied and which were skipped. A Postgres advisory lock stops two concurrent runs from applying the same seed.
- **Immutability (decided):** a seed file is never edited after it is created, same as migrations. Any change is a new seed file with a new timestamp. The runner tracks by `name` only, with no checksum.
- **First seed:** `create-admin-user` (section 10 rule 15). Reads `ADMIN_EMAIL`, `ADMIN_PASSWORD` from env; creates the user with role `ADMIN`, or promotes an existing user with that email.
- **Credential handling:** the real values live only in the deployment environment / local `.env` (gitignored). `.env.example` lists the variable names with placeholder values. They are not stored in this contract or the repo.
- **Transactions:** refresh (revoke old + insert new) is one transaction. Register and login are single writes.
- **No `sessions` table:** a "session" is a token family. (v1 had a separate `sessions` table; removed.)
- **No `isActive` flag** in this pass (account disabling is out of scope; section 23).
- **Cleanup:** expired/revoked rows are not purged in this pass (section 23).
- **Repo impact:** new dependencies `prisma`, `@prisma/client`, `zod`, `jsonwebtoken`, TypeScript toolchain (D4), and a test stack (section 20). New env vars: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (the last two are required only when running `seed:deploy`). New npm script: `seed:deploy`. `.env` is already gitignored.

## 14. Permissions

| Action | Anonymous | USER | ADMIN |
|---|---|---|---|
| Register | ✅ | n/a | n/a |
| Login | ✅ | n/a | n/a |
| Refresh (valid refresh token) | ✅ | ✅ | ✅ |
| Logout (own refresh token) | ✅ | ✅ | ✅ |
| Read own profile (`/users/me`) | ❌ | ✅ | ✅ |
| List all users (`/admin/users`) | ❌ | ❌ | ✅ |

## 15. Error Codes

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Body/header fails Zod validation; `details` is a field→message map |
| `EMAIL_ALREADY_EXISTS` | 409 | Registration with a taken email |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `USER_NOT_FOUND` | 404 | `/users/me` for a user that no longer exists |
| `UNAUTHORIZED` | 401 | No/!Bearer `Authorization` header on a protected route |
| `INVALID_ACCESS_TOKEN` | 401 | Access token malformed, bad signature, wrong `type` |
| `ACCESS_TOKEN_EXPIRED` | 401 | Access token past `exp` (client should refresh) |
| `INVALID_REFRESH_TOKEN` | 401 | Refresh token malformed, unknown, hash mismatch, wrong `type` |
| `REFRESH_TOKEN_EXPIRED` | 401 | Refresh token past `exp` |
| `REFRESH_TOKEN_REVOKED` | 401 | Token revoked by logout or family revocation |
| `REFRESH_TOKEN_REUSED` | 401 | Already-rotated token presented; family revoked |
| `FORBIDDEN` | 403 | Authenticated but role not permitted |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected failure (internals never leaked) |

## 16. Frontend Behaviour

No frontend here; this is the guidance an API consumer should follow. Clients branch on `error.code`, and show `message` to the user.

| Code | Client reaction |
|---|---|
| `ACCESS_TOKEN_EXPIRED` | Call `/auth/refresh` once, retry the original request; queue concurrent requests behind a single refresh |
| `INVALID_REFRESH_TOKEN`, `REFRESH_TOKEN_EXPIRED`, `REFRESH_TOKEN_REVOKED` | Clear stored tokens, redirect to login |
| `REFRESH_TOKEN_REUSED` | Same, plus "You were signed out for security reasons" |
| `INVALID_CREDENTIALS` | Generic form-level error |
| `VALIDATION_ERROR` | Map `details` onto inline field errors |
| `EMAIL_ALREADY_EXISTS` | Inline error on the email field |
| `FORBIDDEN` | "Not allowed" state; do not retry |
| Register success | Redirect to login (register returns no tokens) |
| Login success | Store tokens, redirect into the app |

Always store the **newest** refresh token from `/auth/refresh`; the old one is dead.

## 17. Loading Behaviour

N/A for this repo (API only). Consumer guidance: disable the submit button and show a spinner while a request is in flight; re-enable on any response.

## 18. Notifications

N/A in this pass: no email/SMS/push. (Welcome/verification/reset emails are in section 23.)

## 19. Audit Logs

Structured server logs (no audit table): `register`, `login success`, `login failure`, `refresh`, `refresh reuse detected` (with familyId), `logout`. Each entry: timestamp, userId when known, IP, user agent. Passwords, tokens and hashes are **never** logged.

## 20. Test Cases

*Per `testing-strategy`: unit tests for use cases with in-memory fakes of the four interfaces (this is what the layering buys); integration tests for endpoints against a real test database.* Runner (decided): Vitest + Supertest.

**Happy path**
- Register → 201; response has no `passwordHash`/`password`; DB row stores a bcrypt hash; role is `USER`.
- Login → 200 with both tokens; access token claims are exactly `sub, role, type, iat, nbf, exp`; refresh claims exactly `sub, type, jti, iat, nbf, exp`; no duplicates and no `role` in the refresh token.
- `/users/me` with the access token → 200.
- Refresh → 200 with a new pair; old refresh row has `revokedAt` and `replacedBy` set; new row shares `familyId`.
- Logout → 200; later refresh with that token → `REFRESH_TOKEN_REVOKED`.
- ADMIN → `/admin/users` → 200.

**Validation**
- Bad email, password <8 or >72, missing name, empty body → `VALIDATION_ERROR` with per-field `details`.
- Email case/whitespace variants resolve to one account.

**Security**
- Wrong password vs unknown email: identical response body (apart from `timestamp`).
- Reuse: refresh with A (→B), refresh with A again → `REFRESH_TOKEN_REUSED`, and B (still unused) is now also rejected.
- Two simultaneous refreshes with the same token: exactly one succeeds.
- Access token used as refresh token, and vice versa → rejected by `type`.
- Tampered signature, `alg: none`, expired, wrong-secret tokens → rejected with the right code.
- Missing/malformed `Authorization` header → `UNAUTHORIZED`.
- Logout does not invalidate the already-issued access token before its expiry (documents D1 behaviour so it isn't mistaken for a bug).
- Role change in DB is not reflected in an existing access token until it expires, but `/users/me` shows the fresh role (documents D1).

**Seeding**
- Fresh DB: `migrate deploy` then `seed:deploy` → admin user exists with role `ADMIN`, bcrypt hash (not the plain password), and one `_seed_migrations` row with `appliedAt`.
- Running `seed:deploy` a second time applies nothing and creates no duplicate rows.
- Adding a new seed file later: only the new one runs.
- Admin can log in with the seeded credentials and reach `/admin/users`.
- Existing user with `ADMIN_EMAIL` → promoted to `ADMIN`, password unchanged.
- Missing `ADMIN_EMAIL` or `ADMIN_PASSWORD` → seed fails, no row recorded, nothing created.
- A seed that throws midway leaves no `_seed_migrations` row and no partial data.
- Two concurrent `seed:deploy` runs: each seed applied exactly once.

**Permissions**
- No token → `UNAUTHORIZED`; USER on admin route → `FORBIDDEN`; ADMIN → allowed.

**Edge cases**
- Refresh exactly at `exp` boundary.
- Simultaneous duplicate registration: one 201, one 409.
- Logout twice, and logout with garbage token → both 200.
- Refresh for a user deleted after login → `INVALID_REFRESH_TOKEN`.

## 21. Dependencies

- PostgreSQL instance reachable via `DATABASE_URL`.
- New packages: `prisma`, `@prisma/client`, `zod`, `jsonwebtoken`, TypeScript toolchain, test stack. Existing: `express`, `bcrypt`.
- No Express app skeleton exists yet (`server.js` is absent); this feature creates it.
- No dependency on other feature contracts.

## 22. Definition of Done

- [x] All former **[DECIDE]** items resolved; D1–D4 accepted
- [ ] Contract marked Agreed by the user (pending final read-through)
- [ ] Prisma schema + migration created and applied via `npx prisma migrate deploy`
- [ ] `_seed_migrations` migration, seed runner, and `npm run seed:deploy` working; `create-admin-user` seed applied exactly once
- [ ] Domain interfaces, DTOs and response/error contracts in place **before** controllers are written
- [ ] Infrastructure implementations (Prisma repositories, JWT, bcrypt) behind interfaces; no Prisma/JWT/bcrypt/Express imports in `domain/` or `application/`
- [ ] Endpoints implemented to section 11, all inputs Zod-validated
- [ ] `authenticate` / `authorize` middleware used by `/users/me` and `/admin/users`
- [ ] Every error code in section 15 reachable and covered by a test
- [ ] Unit + integration tests in section 20 passing
- [ ] Structured logging per section 19, no secrets in logs
- [ ] Secrets only from env; `.env.example` documents them
- [ ] API documentation updated
- [ ] Code review approved and merged

## 23. Future Improvements (out of scope for this pass)

- Login rate limiting and account lockout (**strongly recommended right after this pass**: there is no brute-force protection otherwise)
- Moving role checks to the server per request / token revocation list, if D1 proves too loose
- Role-change and user-disable endpoints; more roles/permissions
- Logout-all-devices and an active-sessions list
- Absolute token-family lifetime cap; refresh grace window for network retries
- Expired/revoked token purge job
- Email verification, password reset/change, MFA, OAuth login
- Pagination/filtering on `/admin/users`
- Audit-log table instead of log lines
- Cookie-based token transport for browser clients
