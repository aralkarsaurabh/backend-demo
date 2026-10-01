# backend-demo

Express 5 + TypeScript + PostgreSQL (Prisma 7) API for authentication and authorisation: register/login, access + rotating refresh tokens with reuse detection, logout, and role-based access (`USER`, `ADMIN`), plus multi-tenant organizations (membership, invitations, `OWNER`/`ADMIN`/`MEMBER`) user management (profile, name, password change, platform account status) and organization-scoped customers (CRUD, search, filters, pagination).

- User-facing docs: `README.md`, `documentation/authentication-and-authorisation.md` and `documentation/organizations.md` and `documentation/user-management.md` and `documentation/customers.md` (keep them in sync when behaviour changes).
- Specs: `docs/feature-contracts/20261001073651-authentication-authorization.md`, `docs/feature-contracts/20261001103000-organizations.md` `docs/feature-contracts/20261001120000-user-management.md` and `docs/feature-contracts/20261001150000-customer-management.md`.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Run with `tsx watch` |
| `npm run typecheck` | `tsc --noEmit`. Run before committing; it also checks `tests/`. |
| `npm test` | All tests (274). Needs the `_test` database to exist, see below. |
| `npm run prisma:generate` | Required after a fresh install and after any `schema.prisma` change. The client in `generated/prisma` is git-ignored. |
| `npx prisma migrate deploy` | The **only** way schema migrations are applied |
| `npm run seed:deploy` | The **only** way seeds are applied |
| `npm run build` / `npm start` | Compile to `dist/`, run `dist/src/server.js`. Compiled seeds run with `node dist/scripts/seed-deploy.js` (no `tsx` needed). |

## Architecture rules

Clean Architecture + Repository pattern + DTOs. Flow: route → controller → use case → interfaces → infrastructure.

- `src/domain` and `src/application` must **not** import `express`, `@prisma/*`, `jsonwebtoken`, `bcrypt` or `pg`. They depend on the interfaces `UserRepository`, `RefreshTokenRepository`, `TokenService`, `PasswordService`; implementations live in `src/infrastructure`. Check with: `grep -rEn "from \"(express|@prisma|jsonwebtoken|bcrypt|pg)" src/domain src/application` (must print nothing).
- One class per operation in `src/application/use-cases/`. No catch-all `auth.service.ts`.
- Controllers validate input with Zod (`parseOrThrow`) and build the response; use cases receive typed DTOs.
- Wire dependencies only in `src/app/container.ts` (and `server.ts` for the real implementations).
- Errors: throw `AppError` with a code from `src/shared/errors/error-codes.ts`; the error middleware turns it into the envelope. Adding a code means updating `ERROR_HTTP_STATUS`, `ERROR_DEFAULT_MESSAGE`, the docs and the contract.
- Every response, including 404s, uses the envelope `{ success, message, data, error, meta: { timestamp } }`. `error` is `{ code, details }`.

## Decisions to preserve

- **D1: the role is in the access token** and `authorize()` trusts it (no DB read per request). Role changes and logout take effect when the access token expires (≤15 min). This deliberately deviates from the ES `auth-infrastructure` rule; do not "fix" it silently. `GET /users/me` and refresh read the role from the DB.
- **D2:** layer-first Clean Architecture layout instead of the ES feature-first layouts. **D3:** envelope has an extra `meta.timestamp`. **D4:** TypeScript.
- Refresh tokens: JWT `jti` equals the `RefreshToken.id`; only a SHA-256 hash is stored; no `role` claim. `familyId` groups a login's tokens.
- Rotation (`RefreshTokenRepository.rotate`) must stay a single transaction with a `WHERE revokedAt IS NULL` guard. Reuse of a rotated token (`replacedBy` set) revokes the whole family. Strict on purpose: no grace window for retries.
- Login must give the same response for unknown email and wrong password, and run a dummy bcrypt compare for unknown emails.
- **User management (see the user-management contract, D11-D15):** `User.status` is a platform property and affects authentication only. Suspend/deactivate revokes all refresh tokens (`revokeAllForUser`) but D1 stays: no status read in `authenticate()`. Login reveals a blocked status only after a correct password. An admin cannot change their own status. Password change revokes all refresh tokens. Do not add email or role to `PATCH /users/me`.
- **Organizations (see the organizations contract, D5-D10):** the JWT never carries organization data; `requireOrganizationMembership()` reads the membership from the DB on every request (D5). One `OWNER` per organization for life, enforced by a partial unique index (D6). Invitation tokens are returned once and stored only as SHA-256 (D7). Non-members get `404 ORGANIZATION_NOT_FOUND`, never 403 (D9). A platform `ADMIN` has no special organization access (D10). Do not add a way to assign `OWNER`.
- Atomic organization operations are single repository methods (`createWithOwner`, invitation `accept`, guarded `updateRole`/`remove`), so use cases never manage transactions. The real-SQL tests in `tests/integration/organization-repositories.test.ts` prove each guard fails when removed; keep them.

## Migrations and seeds

- Migrations: author with `npx prisma migrate dev --create-only --name <name>`, review the SQL, commit; apply only via `migrate deploy`.
- Seeds: `prisma/seeds/<YYYYMMDDHHMMSS>_<kebab-name>.ts` exporting `up(tx)`, tracked in `_seed_migrations`. Each seed runs in its own transaction with its tracking row, behind an advisory lock.
- **Never edit an existing migration or seed. A change is a new file.**
- The first admin comes from the `create-admin-user` seed using `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## Testing

- Unit tests (`tests/unit`) use in-memory fakes from `tests/helpers/fakes.ts`. Integration tests (`tests/integration`) use the real app and a real Postgres.
- Integration tests **delete data**. `tests/setup/test-database.ts` refuses any database whose name does not end in `_test`, and the global setup points `DATABASE_URL` at the test database for the whole run. Keep that safety. The test database is `backend_demo_test` in the same Postgres as the dev database `backend_demo`.
- Test files run serially (`fileParallelism: false`) because they share one database.
- The in-memory fake and the HTTP tests do **not** exercise the real SQL guard in `rotate()`; `tests/integration/repositories.test.ts` does. Keep it. When adding a protection, prove the test fails when the protection is removed.

## Conventions

- Commits follow the ES `git-commit` skill: `type(scope): summary` plus short plain-English bullets. **No** AI mentions, no co-author line, no "generated by" line. Do not commit unless asked.
- `.env` holds secrets and is git-ignored. Do not print, log or commit it. `.env.example` lists the variables with placeholders only.
- No placeholder endpoints or phases. Out-of-scope work belongs in the contract's "Future Improvements" section.

## Gotchas

- **TypeScript 6:** `moduleResolution: Node` is removed (tsconfig uses `Node16`), and `@types/*` are no longer auto-included (tsconfig sets `"types": ["node"]`).
- **Prisma 7:** the database URL lives in `prisma.config.ts` (not `schema.prisma`) and the client needs the `pg` driver adapter. Keep `prisma` and `@prisma/client` on the same version (both 7.10.0, pinned).
- **Never run `npx prisma init`** here. It is already set up, and it drops Prisma agent-skill folders (`.agents/`, `.claude/`, `.windsurf/`, `skills-lock.json`) into the repo.
- `prisma migrate dev` fails with `P3014` here (the DB user cannot create the shadow database). Generate migration SQL with `npx prisma migrate diff --from-schema <old schema from git> --to-schema prisma/schema.prisma --script` and put it in a new `prisma/migrations/<timestamp>_<name>/migration.sql`. The two partial unique indexes in `add_organizations` are hand-written SQL; Prisma does not see them as drift.
- `randomUUID()` returns a template-literal type; annotate variables as `string` when passing them around in tests.
- The shell tool here is `zsh`: bash-only syntax (`${VAR^^}`) fails and unquoted variable arrays are not word-split. Put scripts in a file and run them with `bash`.
- Two access tokens issued for the same user in the same second are identical (no `jti` on access tokens). That is expected.
- `dist/` also contains compiled `tests/`. Harmless, and it could be excluded with a separate build tsconfig.

## Known gaps (see documentation section 8)

No rate limiting or lockout (first thing to add before public exposure; it also covers invitation creation/acceptance), no email delivery, invitation revoke/list, ownership transfer or pagination for organizations, no cleanup of old refresh tokens, no absolute session lifetime, no email verification or password reset, no endpoint to change roles, no email change, no immediate suspension of already-issued access tokens.

## Feature Contracts

| File | Status | Read On |
|---|---|---|
| 20261001073651-authentication-authorization.md | Read | 2026-10-01 |
| 20261001103000-organizations.md | Read | 2026-10-01 |
| 20261001120000-user-management.md | Read | 2026-10-01 |
| 20261001150000-customer-management.md | Read | 2026-10-01 |
