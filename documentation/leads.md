# Lead Management

Organization-scoped leads: create, read, update, assign, delete, a searchable, filterable, paginated list, and an atomic conversion of a lead into a customer. Specification: [`docs/feature-contracts/20261001170000-lead-management.md`](../docs/feature-contracts/20261001170000-lead-management.md).

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

A **lead** belongs to exactly one **organization**. There is no global lead list. Access comes only from the caller's **organization membership** (see [organizations.md](organizations.md)); the platform role `User.role` plays no part.

Fields: `name` (required), `email`, `phone`, `company`, `source`, `notes` (optional), plus `status`, `assignedToUserId`, `convertedAt` and `convertedCustomerId`, which the system and later calls manage.

- **Status:** `NEW` (default), `CONTACTED`, `QUALIFIED`, `UNQUALIFIED`, `LOST` and `CONVERTED`. `PATCH` moves a lead freely among the first five. `CONVERTED` is only ever set by the convert endpoint.
- **Source:** `WEBSITE`, `REFERRAL`, `SOCIAL_MEDIA`, `EMAIL_CAMPAIGN`, `COLD_OUTREACH`, `EVENT`, `OTHER`.
- **Assignment:** a lead is assigned to a member of the same organization, or to nobody.
- **Conversion:** creates a [customer](customers.md) in the same organization from the lead's name, email, phone, company and notes, and marks the lead `CONVERTED`, in one transaction. A converted lead is read-only; it can still be deleted by an `ADMIN` or `OWNER`, and its customer stays.

## 2. Decisions

| # | Decision |
|---|---|
| D24 | A lead belongs to exactly one organization. Every repository method takes `organizationId` and every query filters on it. |
| D25 | Access comes from the membership, read from the database on every request (D5). `User.role` plays no part. |
| D26 | A lead of another organization is `404 LEAD_NOT_FOUND`, never 403. |
| D27 | Permissions live in code: `lead:read`, `lead:create`, `lead:update`, `lead:delete`, `lead:assign`, `lead:convert`. A `MEMBER` has all but delete. |
| D28 | Hard delete. |
| D29 | The assignee must be a member of the same organization. A user that does not exist and a user that is not a member give the same `400 ASSIGNED_USER_NOT_MEMBER`. |
| D30 | Conversion only through `POST .../convert`: one repository method, one transaction, guarded by `status <> 'CONVERTED'`. |
| D31 | A converted lead is read-only (`409 LEAD_ALREADY_CONVERTED`); the SQL update is guarded too. |
| D32 | Bodies are strict. `organizationId`, `id`, `convertedAt`, `convertedCustomerId` and the timestamps are never accepted. |
| D33 | Conversion does not look for an existing customer with the same email or phone. |

## 3. Permissions

| Action | Non-member | MEMBER | ADMIN | OWNER |
|---|---|---|---|---|
| Create, list, read, update, assign, convert | 404 | ✅ | ✅ | ✅ |
| Delete | 404 | 403 | ✅ | ✅ |

"404" is `ORGANIZATION_NOT_FOUND`. A platform `ADMIN` who is not a member gets nothing. A `PATCH` that contains `assignedToUserId` needs `lead:assign` as well as `lead:update`; the controller checks it because it depends on the body.

## 4. Data model

`Lead`: `id` (uuid), `organizationId` (FK to `Organization`, `ON DELETE CASCADE`), `name`, `email?`, `phone?`, `company?`, `source?` (`LeadSource`), `status` (`LeadStatus`, default `NEW`), `assignedToUserId?` (FK to `User`, `ON DELETE SET NULL`), `notes?`, `convertedAt?`, `convertedCustomerId?` (unique FK to `Customer`, `ON DELETE SET NULL`), `createdAt`, `updatedAt`.

Indexes follow the real query patterns: `(organizationId, createdAt)`, `(organizationId, status)`, `(organizationId, assignedToUserId)`. Migration: `20261001170500_add_leads`.

Deleting a user unassigns their leads. Deleting a customer leaves its lead `CONVERTED` with `convertedCustomerId: null`.

## 5. Flows

An organization-scoped request runs: `authenticate` → `requireOrganizationMembership` → `requireOrganizationPermission(lead:*)` → controller (Zod) → use case → `LeadRepository` with the verified `organizationId` → PostgreSQL.

**Update:** the use case loads the lead (`404`), refuses a converted one (`409`), checks the assignee with `AssignLead` (`400`), then runs the guarded update. If that matches nothing, the lead was converted or deleted a moment ago and the call fails with `409` or `404`.

**Convert:** the use case loads the lead (`404`), refuses a converted one (`409`), then calls `LeadRepository.convert`. In one transaction it creates the customer and then moves the lead to `CONVERTED` only if it is not already. If the guard matches nothing (a concurrent conversion won), the transaction is rolled back, so no customer is left behind and the call fails with `409`.

## 6. API reference

All routes are under `/api/v1/organizations/:organizationId/leads`, need `Authorization: Bearer <accessToken>`, and use the standard envelope. Lead object: `{ id, name, email, phone, company, source, status, assignedToUserId, notes, convertedAt, convertedCustomerId, createdAt, updatedAt }`, with `null` for unset optional fields.

### `POST /`

Body: `{ "name": "Rahul Sharma", "email": "rahul@example.com", "phone": "+91...", "company": "ABC Technologies", "source": "WEBSITE", "notes": "..." }`. Only `name` is required. `status` and `assignedToUserId` are not accepted here. `201`, `Lead created successfully.`, `data: { lead }`.

| Field | Rule |
|---|---|
| `name` | 1 to 100 characters after trimming; inner whitespace collapsed |
| `email` | valid email, lowercased |
| `phone` | 1 to 30 characters |
| `company` | 1 to 150 characters |
| `source` | one of the sources above |
| `notes` | 1 to 1000 characters |

These are the customer limits on purpose, so a converted lead is always a valid customer.

### `GET /`

| Query | Default | Rule |
|---|---|---|
| `page` | 1 | whole number, at least 1 |
| `limit` | 20 | 1 to 100 |
| `search` | none | 1 to 100 characters; case-insensitive substring of `name`, `email`, `phone` or `company`. `%` and `_` are literal |
| `status` | none | one of the statuses |
| `source` | none | one of the sources |
| `assignedToUserId` | none | uuid |
| `createdFrom` | none | `YYYY-MM-DD`, from the start of that UTC day |
| `createdTo` | none | `YYYY-MM-DD`, to the end of that UTC day; not before `createdFrom` |
| `sortBy` | `createdAt` | `createdAt`, `name` or `company` (empty companies sort last) |
| `sortOrder` | `desc` | `asc` or `desc` |

Unknown query keys and bad values are `400 VALIDATION_ERROR`. `200`, `Leads retrieved successfully.`

```json
{
  "leads": [{ "id": "uuid", "name": "...", "email": null, "phone": null, "company": null, "source": "WEBSITE", "status": "NEW", "assignedToUserId": null, "convertedAt": null, "convertedCustomerId": null, "createdAt": "...", "updatedAt": "..." }],
  "pagination": { "page": 1, "limit": 20, "totalItems": 87, "totalPages": 5, "hasNextPage": true, "hasPreviousPage": false }
}
```

List items leave out `notes`. The order is the sort field, then `id`, so equal values never reshuffle pages.

### `GET /:leadId`

`200`, `Lead retrieved successfully.`, `data: { lead }`. `404 LEAD_NOT_FOUND`.

### `PATCH /:leadId`

Body: any non-empty subset of `name`, `email`, `phone`, `company`, `source`, `status`, `assignedToUserId`, `notes`. `null` clears an optional field and unassigns with `assignedToUserId`; `name` cannot be cleared; `status` cannot be `CONVERTED`. `200`, `Lead updated successfully.`, `data: { lead }`. `400 ASSIGNED_USER_NOT_MEMBER`, `404 LEAD_NOT_FOUND`, `409 LEAD_ALREADY_CONVERTED`.

### `DELETE /:leadId`

`OWNER` and `ADMIN` only. `200`, `Lead deleted successfully.`, `data: null`. `403 INSUFFICIENT_ORGANIZATION_PERMISSION` for a `MEMBER`, `404 LEAD_NOT_FOUND`.

### `POST /:leadId/convert`

No body. `200`, `Lead converted successfully.`, `data: { lead, customer }`. The lead is `CONVERTED` with `convertedAt` and `convertedCustomerId` set. `404 LEAD_NOT_FOUND`, `409 LEAD_ALREADY_CONVERTED`.

## 7. Error codes

| Code | HTTP | When |
|---|---|---|
| `LEAD_NOT_FOUND` | 404 | No such lead in this organization (also for another organization's lead) |
| `LEAD_ALREADY_CONVERTED` | 409 | Convert or update on a converted lead |
| `ASSIGNED_USER_NOT_MEMBER` | 400 | The assignee is not a member of the organization, or does not exist |
| `ORGANIZATION_NOT_FOUND` | 404 | Not a member, or no such organization |
| `INSUFFICIENT_ORGANIZATION_PERMISSION` | 403 | A `MEMBER` deleting |
| `VALIDATION_ERROR` | 400 | Bad id, body or query; `error.details` maps field to message |
| `UNAUTHORIZED`, `INVALID_ACCESS_TOKEN`, `ACCESS_TOKEN_EXPIRED` | 401 | From `authenticate` |

## 8. Security model and known limits

In place:

- Every repository method takes `organizationId`, and every query filters on it, so a cross-organization read, change, delete or conversion matches nothing.
- Another organization's lead and a lead that does not exist give the same `404`. A lead cannot be assigned to someone outside its organization.
- The organization id is never read from the body. Strict bodies reject it.
- Conversion is atomic and guarded, so two simultaneous conversions create one customer.
- Sorting uses a whitelist. Search runs in the database with wildcards escaped.
- Logs hold ids and changed field names only, never contact details.

Limits:

- A member removed from an organization stays assigned to the leads they had; the assignment is checked when it is made, not afterwards.
- Search has no trigram or full-text index, and offset pagination can drift if rows change between page requests.
- No soft delete, status history, duplicate detection, import or export. No rate limiting (see the known gaps).

## 9. Architecture and where things live

| Layer | Files |
|---|---|
| Domain | `src/domain/entities/Lead.ts`, `src/domain/repositories/LeadRepository.ts`, lead permissions in `src/domain/policies/OrganizationPermissions.ts` |
| Application | `src/application/dto/lead/`, `src/application/use-cases/lead/` (`CreateLead`, `GetLead`, `ListLeads`, `UpdateLead`, `AssignLead`, `DeleteLead`, `ConvertLead`) |
| Infrastructure | `src/infrastructure/database/repositories/PrismaLeadRepository.ts`, `src/infrastructure/http/controllers/LeadController.ts` |
| Wiring | `src/app/container.ts`, `src/app/routes.ts`, `src/server.ts` |

## 10. Migration and operations

Apply with `npx prisma migrate deploy`. The migration adds the `LeadStatus` and `LeadSource` enums, the `Lead` table, its indexes and three foreign keys. Nothing existing changes.

## 11. Logging

`lead_created`, `lead_updated` (with `changedFields`, names only), `lead_deleted` and `lead_converted` (with `customerId`), each with `userId`, `organizationId` and `leadId`.

## 12. Tests

- `tests/unit/leads.test.ts`, `tests/unit/lead-requests.test.ts`: use cases, the permission matrix and the request schemas.
- `tests/integration/lead-repositories.test.ts`: real SQL for isolation, the update and convert guards, the conversion rollback, search, wildcards, filters and stable pages.
- `tests/integration/leads.http.test.ts`: every endpoint over HTTP, validation, permissions, concurrent conversion and organization isolation.

Each protection was proved by removing it and watching a test fail: the `status <> 'CONVERTED'` guard in `update` and in `convert`, the transaction around `convert`, the `organizationId` filter in `findById`, `delete` and `list`, the wildcard escape, and the `id` tie-breaker.
