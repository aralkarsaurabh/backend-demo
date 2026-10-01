# backend-demo

A backend API for **authentication and authorisation**: user registration and login, short-lived access tokens, rotating refresh tokens with reuse detection, logout, and role-based access control.

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
| GET | `/users/me` | access token | Current user |
| GET | `/admin/users` | access token, `ADMIN` | List users |

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

115 tests: unit tests for the use cases, and integration tests that run the real app against a real PostgreSQL database through HTTP. The integration tests delete data, so they only run against a database whose name ends in `_test` (for example `backend_demo_test`; create it first). The test setup migrates it automatically and never touches your development database. See the documentation for details.

## Project structure

```
src/
  app/              Express wiring: app, routes, middleware, composition root
  domain/           entities, role enum, repository interfaces
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
- [Feature contract](docs/feature-contracts/20261001073651-authentication-authorization.md): the agreed specification this implementation follows

## Known limitations

There is **no rate limiting or account lockout yet**, so login and registration can be brute-forced. This is the first thing to add before exposing the API publicly. The role is carried in the access token, so a role change or logout takes effect only after the current access token expires (up to 15 minutes). The full list is in the documentation, section 8.
