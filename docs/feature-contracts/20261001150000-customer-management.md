# Feature Contract: Customer Management

## Decisions for v1

| # | Decision |
|---|---|
| D16 | **A customer belongs to exactly one organization.** There is no global customer. Every repository method takes `organizationId` and every query filters on it together with the customer id. |
| D17 | **Access comes from the organization membership**, resolved from the database on every request by the existing `requireOrganizationMembership()` (D5). `User.role` (platform role) plays no part (D10). No second authorization mechanism is added. |
| D18 | **A customer in another organization is `404 CUSTOMER_NOT_FOUND`**, never 403, so ids cannot be probed across tenants (same idea as D9). |
| D19 | **Permissions live in code**, like the organization ones: `customer:read`, `customer:create`, `customer:update`, `customer:delete`. `MEMBER` cannot delete. |
| D20 | **Hard delete.** No `deletedAt`, restore or trash. Those are separate concerns (see Future Improvements). |
| D21 | **No uniqueness rule on email or phone.** The same email can be a customer of two organizations, and even twice in one. A rule can be added later as `@@unique([organizationId, email])`. |
| D22 | **Offset pagination** with a deterministic order: `createdAt DESC, id DESC` by default, with `id` always the final tie-breaker. Sorting is by a whitelist only. |
| D23 | **The body never carries `organizationId`, `id`, `createdAt` or `updatedAt`.** Bodies are strict: unknown fields are rejected. |

## 1. Feature Information

| Field | Value |
|---|---|
| ID | FC-CUS-001 |
| Name | Customer Management |
| Module | customer |
| Priority | P1 |
| Status | Agreed v1 (implemented) |
| Owner | Saurabh Aralkar |
| Backend assignee | Saurabh Aralkar |
| Frontend assignee | N/A (no frontend in this repo) |
| Estimate | TBD |

## 2. Business Objective

Let the members of an organization keep a list of that organization's customers, with search, filters and pagination, without ever seeing another organization's customers.

## 3. User Story

As a member of an organization, I want to create, find, update and delete my organization's customers, so that my team has one shared customer list.

## 4. Actors

- **OWNER** and **ADMIN** of the organization: read, create, update, delete.
- **MEMBER** of the organization: read, create, update. Not delete.
- **Non-member** (including a platform `ADMIN`): nothing. They get `404 ORGANIZATION_NOT_FOUND`.

## 5. Entry Point

API only. There is no UI in this repo. A client calls the endpoints in section 11 with an access token.

## 6. UI Reference

N/A. This repo has no frontend.

## 7. User Flow

1. A signed-in user chooses an organization they belong to (`GET /organizations`).
2. They create a customer in it.
3. They list customers, narrowing with `search`, `company` and a date range, and paging with `page` and `limit`.
4. They open one customer by id.
5. They update fields of a customer.
6. An `OWNER` or `ADMIN` deletes a customer.
7. Failure paths: a bad id or query is `400`; an organization or customer that is not theirs is `404`; a `MEMBER` deleting is `403`.

## 8. Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid | server | generated |
| `organizationId` | uuid | server | from the URL and membership, never the body |
| `name` | string | yes on create | 1 to 100 characters after trim |
| `email` | string | no | valid email, at most 254 characters, lowercased |
| `phone` | string | no | at most 30 characters |
| `company` | string | no | at most 150 characters |
| `notes` | string | no | at most 1000 characters |
| `createdAt` | datetime | server | |
| `updatedAt` | datetime | server | |

## 9. Validation Rules

- All strings are trimmed. Internal whitespace in `name` is collapsed to single spaces.
- An empty string for `email`, `phone`, `company` or `notes` is not accepted on create (omit the field instead). On update, `null` clears an optional field.
- `email` is lowercased before storing.
- Create and update bodies are **strict**: any unknown key (including `organizationId`, `id`, `createdAt`) is `400 VALIDATION_ERROR`.
- Update needs at least one field.
- Path ids must be UUIDs.
- List query: `page` integer at least 1 (default 1); `limit` integer 1 to 100 (default 20); `search` trimmed, 1 to 100 characters; `company` trimmed, 1 to 150; `createdFrom` and `createdTo` ISO dates, and `createdFrom` must not be after `createdTo`; `sortBy` one of `createdAt`, `name`, `company` (default `createdAt`); `sortOrder` `asc` or `desc` (default `desc`). Unknown query keys are `400`.

## 10. Business Rules

- Every query includes `organizationId` and, for one customer, the customer id too.
- `search` matches `name`, `email`, `phone` or `company`, case-insensitive, as a substring. `%` and `_` in the search text are literal characters.
- `company` filter is a case-insensitive exact match.
- `createdFrom` is inclusive from the start of that day (UTC). `createdTo` is inclusive to the end of that day (UTC).
- The default order is `createdAt DESC, id DESC`. For any other `sortBy`, `id` is still the last tie-breaker, so pages never overlap or skip.
- Deleting an organization deletes its customers (`onDelete: Cascade`).

## 11. API Contracts

All routes are under `/api/v1`, need `Authorization: Bearer <accessToken>`, and use the envelope `{ success, message, data, error, meta: { timestamp } }`. Every endpoint can also fail with `UNAUTHORIZED`, `INVALID_ACCESS_TOKEN` or `ACCESS_TOKEN_EXPIRED` (401), `VALIDATION_ERROR` (400, bad ids or body) and `ORGANIZATION_NOT_FOUND` (404, not a member or no such organization).

Customer object: `{ id, name, email, phone, company, notes, createdAt, updatedAt }` (`email`, `phone`, `company`, `notes` are `null` when unset). In a list, items omit `notes`.

### 11.1 `POST /organizations/:organizationId/customers`
- **Permission:** `customer:create`
- **Body:** `{ name, email?, phone?, company?, notes? }`
- **201:** `Customer created successfully.`, `data: { customer }`
- **Failures:** 403 `INSUFFICIENT_ORGANIZATION_PERMISSION` (not reachable today, every role can create)

### 11.2 `GET /organizations/:organizationId/customers`
- **Permission:** `customer:read`
- **Query:** `page`, `limit`, `search`, `company`, `createdFrom`, `createdTo`, `sortBy`, `sortOrder`
- **200:** `Customers retrieved successfully.`
```json
"data": {
  "customers": [ { "id": "uuid", "name": "...", "email": null, "phone": null, "company": null, "createdAt": "...", "updatedAt": "..." } ],
  "pagination": { "page": 1, "limit": 20, "totalItems": 87, "totalPages": 5, "hasNextPage": true, "hasPreviousPage": false }
}
```
- A page past the end returns an empty `customers` array with the real `totalItems`. An organization with no customers returns `totalPages: 0`.

### 11.3 `GET /organizations/:organizationId/customers/:customerId`
- **Permission:** `customer:read`
- **200:** `Customer retrieved successfully.`, `data: { customer }`
- **Failures:** 404 `CUSTOMER_NOT_FOUND`

### 11.4 `PATCH /organizations/:organizationId/customers/:customerId`
- **Permission:** `customer:update`
- **Body:** any non-empty subset of `{ name, email, phone, company, notes }`; `null` clears an optional field.
- **200:** `Customer updated successfully.`, `data: { customer }`
- **Failures:** 404 `CUSTOMER_NOT_FOUND`

### 11.5 `DELETE /organizations/:organizationId/customers/:customerId`
- **Permission:** `customer:delete`
- **200:** `Customer deleted successfully.`, `data: null`
- **Failures:** 403 `INSUFFICIENT_ORGANIZATION_PERMISSION` (`MEMBER`), 404 `CUSTOMER_NOT_FOUND`

## 12. Backend Processing Flow

`authenticate` → `requireOrganizationMembership` (DB lookup, sets `req.organizationMembership`) → `requireOrganizationPermission(customer:*)` → controller (Zod parse of params, query or body) → use case → `CustomerRepository` (always with `organizationId`) → PostgreSQL → DTO → envelope. Create, update and delete log an info line with ids only, never customer contact details.

## 13. Database Impact

New table `Customer`: `id`, `organizationId` (FK to `Organization`, `ON DELETE CASCADE`), `name`, `email?`, `phone?`, `company?`, `notes?`, `createdAt`, `updatedAt`. Indexes: `(organizationId)` and `(organizationId, createdAt)`. No transactions are needed: each operation is one statement (list runs a count and a page read). One new migration; no existing migration is edited.

## 14. Permissions

| Action | Non-member | MEMBER | ADMIN | OWNER |
|---|---|---|---|---|
| Create customer | ❌ (404) | ✅ | ✅ | ✅ |
| List / read customer | ❌ (404) | ✅ | ✅ | ✅ |
| Update customer | ❌ (404) | ✅ | ✅ | ✅ |
| Delete customer | ❌ (404) | ❌ (403) | ✅ | ✅ |

A platform `ADMIN` who is not a member gets nothing (D10, D17).

## 15. Error Codes

| Code | HTTP | When |
|---|---|---|
| `CUSTOMER_NOT_FOUND` | 404 | No such customer **in this organization** |
| `INSUFFICIENT_ORGANIZATION_PERMISSION` | 403 | Existing code: a `MEMBER` deleting |
| `ORGANIZATION_NOT_FOUND` | 404 | Existing code: non-member or unknown organization |
| `VALIDATION_ERROR` | 400 | Existing code: bad id, query or body |

Only `CUSTOMER_NOT_FOUND` is new. `CUSTOMER_ALREADY_EXISTS` and `INVALID_CUSTOMER_DATA` are deliberately not added: there is no uniqueness rule (D21) and `VALIDATION_ERROR` already covers bad data. Unused codes would be placeholders.

## 16. Frontend Behaviour

N/A, no frontend. A client should show `details` of `VALIDATION_ERROR` inline, treat `CUSTOMER_NOT_FOUND` as "already gone", and hide the delete button for `MEMBER`.

## 17. Loading Behaviour

N/A, no frontend.

## 18. Notifications

N/A. No notification is sent for customer events.

## 19. Audit Logs

Structured info logs only: `customer_created`, `customer_updated` (with the names of the changed fields, not values) and `customer_deleted`, each with `userId`, `organizationId`, `customerId`. No customer name, email or phone is logged. There is no audit table.

## 20. Test Cases

- **Unit:** each use case with in-memory fakes; the permission matrix; the query and pagination maths.
- **Repository (real SQL):** every method refuses to cross an organization; search, filter, sort and pagination run in the database; stable order with equal timestamps; `%` and `_` are literal. Each protection is proved by removing it and watching a test fail.
- **HTTP:** create, get, update, delete, list, pagination, search, filters, sorting, bad query values, not found, no token, a `MEMBER` deleting, a non-member, and organization isolation (organization B can neither read, change, delete nor list organization A's customers, and a platform `ADMIN` outside the organization gets 404).

## 21. Dependencies

Authentication, User Management and Organizations (membership middleware and permission policy).

## 22. Definition of Done

- [x] Contract agreed
- [x] Backend slices: create and get, list, update, delete
- [x] Tests green, including real-SQL isolation tests
- [x] Typecheck, build and architecture grep clean
- [x] `documentation/customers.md`, README and CLAUDE.md updated
- [x] One commit per slice

## 23. Future Improvements (out of scope for this pass)

- Soft delete, restore and retention
- Email or phone uniqueness per organization
- Cursor pagination for very large lists
- Trigram or full-text search indexes
- Addresses, tax ids, tags, custom fields, attachments, contacts, invoices and communication history
- Import and export
- Audit table with old and new values
- Rate limiting (see the known gaps)
