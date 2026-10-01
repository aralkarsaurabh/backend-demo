# Task Management

Organization-scoped tasks: create, read, update, assign, delete, and a searchable, filterable, paginated list with a derived "overdue" filter. Specification: [`docs/feature-contracts/20261001210000-task-management.md`](../docs/feature-contracts/20261001210000-task-management.md).

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

A **task** belongs to exactly one **organization**. There is no global task list. Access comes only from the caller's **organization membership** (see [organizations.md](organizations.md)); the platform role `User.role` plays no part.

Fields: `title` (required), `description`, `assignedToUserId`, `dueDate` (optional), plus `status`, which starts as `TODO`.

- **Status:** `TODO`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`. Any status can be set from any other, so a completed or cancelled task can be reopened. A completed task is not deleted and stays queryable.
- **Assignment:** a task is assigned to a member of the same organization, or to nobody.
- **Due date:** a timestamp (`2026-10-05T12:00:00.000Z`), stored in UTC.
- **Overdue:** derived, never stored. A task is overdue when its status is not `COMPLETED` or `CANCELLED` and its due date is in the past. `GET .../tasks?overdue=true` applies exactly that condition.
- A task is not linked to a lead or a customer in this version.

## 2. Decisions

| # | Decision |
|---|---|
| D45 | A task belongs to exactly one organization. Every repository method takes `organizationId` and every query filters on it. A task of another organization is `404 TASK_NOT_FOUND`, never 403. |
| D46 | The assignee must be a current member of the same organization (`400 ASSIGNED_USER_NOT_MEMBER`, the same error for an unknown user). Checked by `AssignTask` on create and update. |
| D47 | Status has no transition guard: any status may follow any other. There is no `TASK_ALREADY_COMPLETED` or `INVALID_TASK_STATUS` code; an unknown status is `VALIDATION_ERROR`. |
| D48 | Overdue is a query condition (`status NOT IN (COMPLETED, CANCELLED) AND dueDate < now()`), not a column. |
| D49 | Hard delete. |
| D50 | Sorting is a whitelist (`createdAt`, `dueDate`, `title`), the order always ends in `id`, `dueDate` sorts nulls last, and search escapes `%` and `_`. |
| D51 | No link to a lead or customer yet. |

## 3. Permissions

Permissions live in code (`src/domain/policies/OrganizationPermissions.ts`).

| Permission | MEMBER | ADMIN | OWNER |
|---|:-:|:-:|:-:|
| `task:read` | yes | yes | yes |
| `task:create` | yes | yes | yes |
| `task:update` | yes | yes | yes |
| `task:assign` | yes | yes | yes |
| `task:delete` | no | yes | yes |

When a body contains `assignedToUserId` (including `null`, which unassigns), the caller also needs `task:assign`. The controller checks this because it depends on the body. Today every role has `task:assign`, so the check only matters if a role is ever restricted.

## 4. Data model

Table `Task`: `id`, `organizationId`, `title`, `description?`, `assignedToUserId?`, `dueDate?`, `status` (enum `TaskStatus`, default `TODO`), `createdAt`, `updatedAt`.

- `organizationId` → `Organization`, `ON DELETE CASCADE`.
- `assignedToUserId` → `User`, `ON DELETE SET NULL` (deleting a user unassigns their tasks).
- Indexes: `(organizationId, createdAt)`, `(organizationId, status)`, `(organizationId, assignedToUserId)`, `(organizationId, dueDate)`. No trigram or full-text index.

## 5. Flows

**Create:** validate the strict body → (if `assignedToUserId`) check `task:assign` and membership → insert as `TODO`.

**Update:** validate → find the task in this organization (404) → (if `assignedToUserId` is a user) check membership → update. Only sent fields change; `null` clears `description`, `dueDate` or `assignedToUserId`.

**List:** validate the strict query → one page plus the total count in one transaction, in a total order.

## 6. API reference

Base path `/api/v1/organizations/:organizationId/tasks`. Every route needs `Authorization: Bearer <access token>`.

| Method | Path | Who | Result |
|---|---|---|---|
| POST | `/` | member | `201` `{ task }` |
| GET | `/` | member | `200` `{ tasks, pagination }` |
| GET | `/:taskId` | member | `200` `{ task }` |
| PATCH | `/:taskId` | member | `200` `{ task }` |
| DELETE | `/:taskId` | `OWNER`, `ADMIN` | `200`, `data: null` |

A task: `{ id, title, description, assignedToUserId, dueDate, status, createdAt, updatedAt }`. A list item has no `description`. `organizationId` is never returned.

**Create body** (only `title` is required): `{ "title": "Follow up with Rahul", "description": "Discuss enterprise pricing", "assignedToUserId": "<uuid>", "dueDate": "2026-10-05T12:00:00.000Z" }`. `status` is rejected: a new task is always `TODO`.

**Update body:** any of `title`, `description`, `assignedToUserId`, `dueDate`, `status`, at least one. Example: `{ "status": "IN_PROGRESS", "assignedToUserId": "<uuid>" }`.

Both bodies are strict: `organizationId`, `id`, `createdAt`, `updatedAt` and unknown keys are `400 VALIDATION_ERROR`. Limits: `title` 1-200 characters, `description` 1-2000.

**List query:**

| Param | Meaning |
|---|---|
| `page` (1), `limit` (20, max 100) | paging |
| `status` | one of the four statuses |
| `assignedToUserId` | tasks of one member |
| `dueFrom`, `dueTo` | inclusive UTC date bounds like `2026-10-01`; tasks without a due date never match |
| `overdue=true` | unfinished tasks whose due date has passed (only `true` is accepted) |
| `search` | substring of title or description, ignoring case |
| `sortBy` (`createdAt`), `sortOrder` (`desc`) | `createdAt`, `dueDate` (empty last) or `title`; `asc` or `desc` |

`pagination` is `{ page, limit, totalItems, totalPages, hasNextPage, hasPreviousPage }`.

## 7. Error codes

| Code | Status | When |
|---|---|---|
| `TASK_NOT_FOUND` | 404 | unknown task, or a task of another organization |
| `ASSIGNED_USER_NOT_MEMBER` | 400 | the assignee is not a member of the organization |
| `VALIDATION_ERROR` | 400 | invalid body, query or id |
| `INSUFFICIENT_ORGANIZATION_PERMISSION` | 403 | the role lacks the permission (for example a `MEMBER` deleting) |
| `ORGANIZATION_NOT_FOUND` | 404 | non-member, or unknown organization |

## 8. Security model and known limits

- Tenant isolation is in the repository: every method filters on `organizationId`, and the id comes from the verified membership, never the body.
- The assignment error is the same for an unknown user and a non-member, so it does not reveal which user ids exist.
- A member removed from an organization stays assigned to their tasks (the same known gap as for leads).
- No status history, no audit trail, no soft delete, no reminders or notifications, no link to leads or customers, and no trigram or full-text search.
- The `id` tie-break that makes the sort order total cannot be proven by a test: Postgres returns equal rows in a stable order on a small table.

## 9. Architecture and where things live

Route → `authenticate` → `requireOrganizationMembership` → `requireOrganizationPermission` → `TaskController` → use case → `TaskRepository` → `PrismaTaskRepository` → PostgreSQL.

| What | Where |
|---|---|
| Entity, statuses | `src/domain/entities/Task.ts` |
| Repository interface, list query | `src/domain/repositories/TaskRepository.ts` |
| Request schemas, response mapping | `src/application/dto/task/` |
| Use cases | `src/application/use-cases/task/` (`CreateTask`, `GetTask`, `ListTasks`, `UpdateTask`, `DeleteTask`, `AssignTask`) |
| Prisma repository | `src/infrastructure/database/repositories/PrismaTaskRepository.ts` |
| Controller | `src/infrastructure/http/controllers/TaskController.ts` |
| Routes, wiring | `src/app/routes.ts`, `src/app/container.ts`, `src/server.ts` |

`AssignTask` is the assignment rule, shared by `CreateTask` and `UpdateTask`. There is no separate assign endpoint.

## 10. Migration and operations

Migration `20261001210500_add_tasks`. Apply it with `npx prisma migrate deploy`, then `npm run prisma:generate`. Nothing to seed.

## 11. Logging

`task_created`, `task_updated` (with the changed field names) and `task_deleted`, carrying user, organization and task ids only, never a title or description.

## 12. Tests

- `tests/unit/task-requests.test.ts`: the schemas.
- `tests/unit/task-permissions.test.ts`: the permission matrix.
- `tests/unit/tasks.test.ts`: the use cases against in-memory fakes.
- `tests/integration/task-repositories.test.ts`: the real SQL. Removing the organization filter from any method, the overdue condition, the LIKE escaping or `NULLS LAST` makes a test fail (except the `id` tie-break, see section 8). Keep them.
- `tests/integration/tasks.http.test.ts`: every route, per role, over HTTP.
