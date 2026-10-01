# backend-demo

A backend API for **authentication and authorisation**: user registration and login, short-lived access tokens, rotating refresh tokens with reuse detection, logout, role-based access control, and multi-tenant organizations with invitations and organization-level roles, plus organization-scoped customer, lead and sales pipeline management.

Built with Node.js, Express 5, TypeScript, PostgreSQL, Prisma 7, Zod, JWT and bcrypt, structured as Clean Architecture so business logic stays independent of the framework, database and libraries.

## Features

- Register and log in with email and password (bcrypt, cost 12)
- 15-minute **access tokens** and 30-day **refresh tokens**, signed with separate secrets
- **Refresh-token rotation:** each refresh issues a new refresh token and retires the old one
- **Reuse detection:** replaying a rotated token revokes the whole session
- **Logout** that revokes the session
- **Role-based access** (`USER`, `ADMIN`); the first admin is created by a tracked seed
- One response envelope everywhere, with stable error codes
- Tracked database **seeds** (`npm run seed:deploy`), alongside Prisma migrations
- **User management:** profile, rename, password change (ends all sessions) and admin-controlled account status (`ACTIVE`, `SUSPENDED`, `DEACTIVATED`)
- **Customers:** create, read, update and delete an organization's customers, with search, a company filter, a date range, sorting and pagination. A customer is only ever visible to members of its own organization
- **Leads:** capture, work and assign an organization's leads (status, source, search, filters, pagination), and convert a lead into a customer in one atomic step. Leads are only ever visible to members of their own organization
- **Sales pipelines:** define an organization's pipelines and their ordered stages, reorder the stages atomically, move leads between stages, and read a per-stage lead count calculated by the database. A pipeline stage is separate from the lead's `status`
- **Organizations:** create an organization, invite people with a one-time token, and manage members with per-organization roles (`OWNER`, `ADMIN`, `MEMBER`) that are checked against the database on every request

## Quick start

Requires **Node.js 22.12 or newer** (the test runner needs it; developed on Node 24) and a PostgreSQL database.

```bash
npm install
cp .env.example .env              # fill in DATABASE_URL, JWT secrets, ADMIN_* (see below)
npm run prisma:generate           # generates the Prisma client (not committed)
npx prisma migrate deploy         # create the tables
npm run seed:deploy               # create the first admin from ADMIN_EMAIL / ADMIN_PASSWORD
npm run dev                       # http://localhost:3000
```

Generate the two JWT secrets with `openssl rand -hex 32` (they must differ and be at least 32 characters). Never commit `.env`.

### Try it

```bash
# register, then log in
curl -X POST localhost:3000/api/v1/auth/register -H 'Content-Type: application/json' \
  -d '{"name":"Asha","email":"asha@example.com","password":"a-long-password"}'
curl -X POST localhost:3000/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"asha@example.com","password":"a-long-password"}'

# call a protected route with the accessToken from the login response
curl localhost:3000/api/v1/users/me -H "Authorization: Bearer $ACCESS_TOKEN"
```

## API

All routes are under `/api/v1`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/register` | none | Create an account |
| POST | `/auth/login` | none | Log in, receive tokens |
| POST | `/auth/refresh` | refresh token | Rotate tokens |
| POST | `/auth/logout` | refresh token | End the session |
| GET | `/users/me` | access token | Profile |
| PATCH | `/users/me` | access token | Update name |
| POST | `/users/me/password` | access token | Change password (revokes all sessions) |
| PATCH | `/users/:userId/status` | access token, `ADMIN` | Suspend, deactivate or reactivate a user |
| GET | `/admin/users` | access token, `ADMIN` | List users |
| POST | `/organizations` | access token | Create an organization (caller becomes `OWNER`) |
| GET | `/organizations` | access token | List the caller's organizations |
| GET | `/organizations/:organizationId` | member | One organization |
| POST | `/organizations/:organizationId/invitations` | `OWNER`, `ADMIN` | Invite someone; returns the one-time token |
| GET | `/organizations/:organizationId/members` | member | List members |
| PATCH | `/organizations/:organizationId/members/:userId` | `OWNER` | Change a member's role |
| DELETE | `/organizations/:organizationId/members/:userId` | `OWNER`, `ADMIN` (rank rules apply) | Remove a member |
| POST | `/organization-invitations/accept` | access token | Accept an invitation |
| POST | `/organizations/:organizationId/customers` | member | Create a customer |
| GET | `/organizations/:organizationId/customers` | member | List customers: `page`, `limit`, `search`, `company`, `createdFrom`, `createdTo`, `sortBy`, `sortOrder` |
| GET | `/organizations/:organizationId/customers/:customerId` | member | One customer |
| PATCH | `/organizations/:organizationId/customers/:customerId` | member | Update a customer |
| DELETE | `/organizations/:organizationId/customers/:customerId` | `OWNER`, `ADMIN` | Delete a customer |
| POST | `/organizations/:organizationId/leads` | member | Create a lead |
| GET | `/organizations/:organizationId/leads` | member | List leads: `page`, `limit`, `search`, `status`, `source`, `assignedToUserId`, `createdFrom`, `createdTo`, `sortBy`, `sortOrder` |
| GET | `/organizations/:organizationId/leads/:leadId` | member | One lead |
| PATCH | `/organizations/:organizationId/leads/:leadId` | member | Update a lead, change its status or assign it |
| DELETE | `/organizations/:organizationId/leads/:leadId` | `OWNER`, `ADMIN` | Delete a lead |
| POST | `/organizations/:organizationId/leads/:leadId/convert` | member | Convert a lead into a customer |
| PATCH | `/organizations/:organizationId/leads/:leadId/stage` | member | Move a lead into a pipeline stage |
| POST | `/organizations/:organizationId/pipelines` | `OWNER`, `ADMIN` | Create a pipeline |
| GET | `/organizations/:organizationId/pipelines` | member | List pipelines with their stages |
| GET | `/organizations/:organizationId/pipelines/:pipelineId` | member | One pipeline |
| PATCH | `/organizations/:organizationId/pipelines/:pipelineId` | `OWNER`, `ADMIN` | Rename or describe a pipeline |
| DELETE | `/organizations/:organizationId/pipelines/:pipelineId` | `OWNER`, `ADMIN` | Delete a pipeline (only once it has no stages) |
| GET | `/organizations/:organizationId/pipelines/:pipelineId/summary` | member | Lead count per stage |
| POST | `/organizations/:organizationId/pipelines/:pipelineId/stages` | `OWNER`, `ADMIN` | Add a stage (the server picks its position) |
| PATCH | `/organizations/:organizationId/pipelines/:pipelineId/stages/reorder` | `OWNER`, `ADMIN` | Reorder all stages atomically |
| PATCH | `/organizations/:organizationId/pipelines/:pipelineId/stages/:stageId` | `OWNER`, `ADMIN` | Rename a stage |
| DELETE | `/organizations/:organizationId/pipelines/:pipelineId/stages/:stageId` | `OWNER`, `ADMIN` | Delete a stage (only while it holds no leads) |

Tokens are sent as `Authorization: Bearer <token>`. Full request and response details, error codes and a client integration guide are in the documentation.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Run with auto-restart |
| `npm run build` / `npm start` | Compile to `dist/` / run the compiled server |
| `npm run typecheck` | Type-check without emitting |
| `npm test` | Run all tests |
| `npm run prisma:generate` | Generate the Prisma client |
| `npm run migrate:deploy` | Apply schema migrations |
| `npm run seed:deploy` | Apply pending seeds |

## Migrations and seeds

- Schema changes are applied **only** with `npx prisma migrate deploy`.
- Seed data is applied **only** with `npm run seed:deploy`, which records each applied seed in the `_seed_migrations` table and skips it next time.
- Migrations and seeds are **never edited once created**; a change is a new file.

## Testing

```bash
npm test
```

599 tests: unit tests for the use cases, and integration tests that run the real app against a real PostgreSQL database through HTTP. The integration tests delete data, so they only run against a database whose name ends in `_test` (for example `backend_demo_test`; create it first). The test setup migrates it automatically and never touches your development database. See the documentation for details.

## Project structure

```
src/
  app/              Express wiring: app, routes, middleware, composition root
  domain/           entities, role enums, permission policy, repository interfaces
  application/      DTOs, service interfaces, use cases
  infrastructure/   Prisma repositories, JWT and bcrypt services, controllers, seed runner
  config/ shared/   env validation, constants, errors, response envelope, logger
prisma/             schema, migrations, seeds
scripts/            seed:deploy entry point
tests/              unit, integration, helpers, setup
```

Business logic (`domain/`, `application/`) never imports Express, Prisma, `jsonwebtoken` or `bcrypt`.

## Documentation

- [Authentication & Authorisation](documentation/authentication-and-authorisation.md): architecture, data model, token design, flows, full API reference, error codes, security model and limits, configuration, operations, client guide
- [Organizations & Membership](documentation/organizations.md): roles and permissions, invitations, data model, flows, full API reference, security model and limits
- [Customers](documentation/customers.md): organization-scoped customers, permissions, list query, tenant isolation and its tests
- [Leads](documentation/leads.md): organization-scoped leads, assignment, conversion into customers, permissions, list query and its tests
- [Sales Pipelines](documentation/pipelines.md): pipelines and ordered stages on top of leads, the atomic reorder, moving leads, the per-stage summary, permissions and its tests
- [User Management](documentation/user-management.md): profile, account update, password change, account status and its effect on login and refresh
- [Feature contract: authentication](docs/feature-contracts/20261001073651-authentication-authorization.md): the agreed specification this implementation follows
- [Feature contract: organizations](docs/feature-contracts/20261001103000-organizations.md): the agreed specification for organizations
- [Feature contract: customers](docs/feature-contracts/20261001150000-customer-management.md): the agreed specification for customer management
- [Feature contract: leads](docs/feature-contracts/20261001170000-lead-management.md): the agreed specification for lead management
- [Feature contract: sales pipeline](docs/feature-contracts/20261001190000-sales-pipeline.md): the agreed specification for sales pipelines
- [Feature contract: user management](docs/feature-contracts/20261001120000-user-management.md): the agreed specification for user management

## Known limitations

There is **no rate limiting or account lockout yet**, so login and registration can be brute-forced. This is the first thing to add before exposing the API publicly. The role is carried in the access token, so a role change, logout, password change or suspension takes effect for already-issued access tokens only after the current access token expires (up to 15 minutes). Organization membership and roles are the exception: they are not in the token and are read from the database on every organization request, so removals and role changes there apply immediately. The full list is in the documentation, section 8.
