# Customer Management

Organization-scoped customers: create, read, update, delete, and a searchable, filterable, paginated list. Specification: [`docs/feature-contracts/20261001150000-customer-management.md`](../docs/feature-contracts/20261001150000-customer-management.md).

## Contents

1. Concepts
2. Decisions
3. Permissions
4. Data model
5. Flows
6. API reference
7. Error codes
8. Security model and known limits
9. Architecture and where things live
10. Migration and operations
11. Logging
12. Tests

## 1. Concepts

A **customer** belongs to exactly one **organization**. There is no global customer list. Access to customers comes only from the caller's **organization membership** (see [organizations.md](organizations.md)); the platform role `User.role` plays no part.

Fields: `name` (required), `email`, `phone`, `company`, `notes` (optional). Nothing else (no addresses, tags, invoices or contacts).

## 2. Decisions

| # | Decision |
|---|---|
| D16 | A customer belongs to exactly one organization. Every repository method takes `organizationId` and every query filters on it. |
| D17 | Access comes from the membership, read from the database on every request (D5). No second authorization mechanism. |
| D18 | A customer of another organization is `404 CUSTOMER_NOT_FOUND`, never 403. |
| D19 | Permissions live in code: `customer:read`, `customer:create`, `customer:update`, `customer:delete`. |
| D20 | Hard delete. |
| D21 | No uniqueness rule on email or phone. |
| D22 | Offset pagination with a total order: the sort field, then `id` in the same direction. |
| D23 | Bodies are strict. `organizationId`, `id`, `createdAt` and `updatedAt` are never accepted. |

## 3. Permissions

| Action | Non-member | MEMBER | ADMIN | OWNER |
|---|---|---|---|---|
| Create | 404 | ✅ | ✅ | ✅ |
| List / read | 404 | ✅ | ✅ | ✅ |
| Update | 404 | ✅ | ✅ | ✅ |
| Delete | 404 | 403 | ✅ | ✅ |

"404" is `ORGANIZATION_NOT_FOUND`. A platform `ADMIN` who is not a member gets nothing.

## 4. Data model

`Customer`: `id` (uuid), `organizationId` (FK to `Organization`, `ON DELETE CASCADE`), `name`, `email?`, `phone?`, `company?`, `notes?`, `createdAt`, `updatedAt`. Indexes: `(organizationId)` and `(organizationId, createdAt)`. Migration: `20261001150000_add_customers`.

## 5. Flows

An organization-scoped request runs: `authenticate` → `requireOrganizationMembership` (database lookup; a non-member gets `ORGANIZATION_NOT_FOUND`) → `requireOrganizationPermission(customer:*)` → controller (Zod) → use case → `CustomerRepository` with the verified `organizationId` → PostgreSQL. The organization id used for the query is the one the membership lookup attached to the request.

## 6. API reference

All routes are under `/api/v1`, need `Authorization: Bearer <accessToken>`, and use the standard envelope. Customer object: `{ id, name, email, phone, company, notes, createdAt, updatedAt }`, with `null` for unset optional fields.

### `POST /organizations/:organizationId/customers`

Body: `{ "name": "Acme Technologies", "email": "contact@acme.com", "phone": "+91...", "company": "Acme", "notes": "..." }`. Only `name` is required. Unknown fields are rejected.

`201`, `Customer created successfully.`, `data: { customer }`.

| Field | Rule |
|---|---|
| `name` | 1 to 100 characters after trimming; inner whitespace collapsed |
| `email` | valid email, lowercased |
| `phone` | 1 to 30 characters |
| `company` | 1 to 150 characters |
| `notes` | 1 to 1000 characters |

### `GET /organizations/:organizationId/customers`

| Query | Default | Rule |
|---|---|---|
| `page` | 1 | whole number, at least 1 |
| `limit` | 20 | 1 to 100 |
| `search` | none | 1 to 100 characters; matches `name`, `email`, `phone` or `company` as a case-insensitive substring. `%` and `_` are literal |
| `company` | none | case-insensitive exact match |
| `createdFrom` | none | `YYYY-MM-DD`, from the start of that UTC day |
| `createdTo` | none | `YYYY-MM-DD`, to the end of that UTC day; not before `createdFrom` |
| `sortBy` | `createdAt` | `createdAt`, `name` or `company` (empty companies sort last) |
| `sortOrder` | `desc` | `asc` or `desc` |

Unknown query keys, bad values and repeated keys are `400 VALIDATION_ERROR`.

`200`, `Customers retrieved successfully.`

```json
{
  "customers": [{ "id": "uuid", "name": "...", "email": null, "phone": null, "company": null, "createdAt": "...", "updatedAt": "..." }],
  "pagination": { "page": 1, "limit": 20, "totalItems": 87, "totalPages": 5, "hasNextPage": true, "hasPreviousPage": false }
}
```

List items leave out `notes`. A page past the end is an empty array with the real totals; an organization with no customers has `totalPages: 0`.

### `GET /organizations/:organizationId/customers/:customerId`

`200`, `Customer retrieved successfully.`, `data: { customer }`. `404 CUSTOMER_NOT_FOUND`.

### `PATCH /organizations/:organizationId/customers/:customerId`

Body: any non-empty subset of `name`, `email`, `phone`, `company`, `notes`. `null` clears an optional field; `name` cannot be cleared. `200`, `Customer updated successfully.`, `data: { customer }`. `404 CUSTOMER_NOT_FOUND`.

### `DELETE /organizations/:organizationId/customers/:customerId`

`OWNER` and `ADMIN` only. `200`, `Customer deleted successfully.`, `data: null`. `403 INSUFFICIENT_ORGANIZATION_PERMISSION` for a `MEMBER`, `404 CUSTOMER_NOT_FOUND`.

## 7. Error codes

| Code | HTTP | When |
|---|---|---|
| `CUSTOMER_NOT_FOUND` | 404 | No such customer in this organization (also for another organization's customer) |
| `ORGANIZATION_NOT_FOUND` | 404 | Not a member, or no such organization |
| `INSUFFICIENT_ORGANIZATION_PERMISSION` | 403 | A `MEMBER` deleting |
| `VALIDATION_ERROR` | 400 | Bad id, body or query; `error.details` maps field to message |
| `UNAUTHORIZED`, `INVALID_ACCESS_TOKEN`, `ACCESS_TOKEN_EXPIRED` | 401 | From `authenticate` |

## 8. Security model and known limits

In place:

- Every repository method takes `organizationId`, and every query filters on it, so a cross-organization read, change or delete matches nothing.
- Another organization's customer and a customer that does not exist give the same `404`.
- The organization id is never read from the body. Strict bodies reject it.
- Sorting uses a whitelist, never raw input in `orderBy`. Search runs in the database with wildcards escaped.
- Logs hold ids and changed field names only, never contact details.

Limits:

- Search is a substring match without a trigram or full-text index. It is fine at demo volumes.
- Offset pagination can drift if rows change between page requests.
- No soft delete, uniqueness rule, audit table, import or export. No rate limiting (see the known gaps).
- A customer's contact details are plain text in the database.

## 9. Architecture and where things live

| Layer | Files |
|---|---|
| Domain | `src/domain/entities/Customer.ts`, `src/domain/repositories/CustomerRepository.ts`, customer permissions in `src/domain/policies/OrganizationPermissions.ts` |
| Application | `src/application/dto/customer/`, `src/application/use-cases/customer/` (`CreateCustomer`, `GetCustomer`, `ListCustomers`, `UpdateCustomer`, `DeleteCustomer`) |
| Infrastructure | `src/infrastructure/database/repositories/PrismaCustomerRepository.ts`, `src/infrastructure/http/controllers/CustomerController.ts` |
| Wiring | `src/app/container.ts`, `src/app/routes.ts`, `src/server.ts` |

## 10. Migration and operations

Apply with `npx prisma migrate deploy`. The migration only adds the `Customer` table, its two indexes and its foreign key. Nothing existing changes.

## 11. Logging

`customer_created`, `customer_updated` (with `changedFields`, names only) and `customer_deleted`, each with `userId`, `organizationId` and `customerId`.

## 12. Tests

- `tests/unit/customers.test.ts`, `customer-permissions.test.ts`, `customer-list-query.test.ts`, `customer-update-request.test.ts`: use cases, the permission matrix and the request schemas.
- `tests/integration/customer-repositories.test.ts`: real SQL for isolation, search, wildcards, filters, sorting and stable pages.
- `tests/integration/customers.http.test.ts`: every endpoint over HTTP, validation, permissions and organization isolation.

Each protection was proved by removing it and watching a test fail: the `organizationId` filter in `findById`, `list`, `update` and `delete`, the `id` tie-breaker, the wildcard escape, and the delete permission.
