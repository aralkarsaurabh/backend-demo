# Sales Pipelines

Organization-scoped sales pipelines: ordered stages, an atomic reorder, moving leads between stages, and a per-stage summary. It sits on top of [Lead Management](leads.md) and does not replace it. Specification: [`docs/feature-contracts/20261001190000-sales-pipeline.md`](../docs/feature-contracts/20261001190000-sales-pipeline.md).

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

An organization defines one or more **pipelines**. A pipeline is an ordered list of **stages** (for example New Lead, Contacted, Demo Scheduled, Proposal, Won). A **lead** is in at most one stage. Access comes only from the caller's **organization membership** (see [organizations.md](organizations.md)); the platform role `User.role` plays no part.

```text
Organization
  ├── Pipelines ── Stages (position 0, 1, 2, ...)
  └── Leads ────── pipelineStageId (optional)
```

**A stage is not `Lead.status`.** `status` is the business state of the lead (`NEW`, `CONTACTED`, `QUALIFIED`, `UNQUALIFIED`, `LOST`, `CONVERTED`). A stage is a position in one sales process. A lead can be `QUALIFIED` and in the stage "Demo Scheduled". Moving a lead between stages never changes its status, and updating its status never changes its stage.

- **Positions** are 0-based, contiguous and assigned by the server. A client never sends a position; it can only reorder.
- **Existing leads** have no stage until they are moved into one. New leads are created without a stage.
- **Converted leads** are read-only, so they cannot be moved. They keep the stage they had.

## 2. Decisions

| # | Decision |
|---|---|
| D34 | Ownership chain Lead → PipelineStage → Pipeline → Organization. Every repository method takes the organization id (and the pipeline id for stages) and filters on it. A stage is reached through its pipeline's organization. |
| D35 | A stage is not `Lead.status`. Neither changes the other. `PATCH /leads/:id` does not accept `pipelineStageId`. |
| D36 | `Lead.pipelineStageId` is nullable; creating a lead does not assign a stage. |
| D37 | Positions are server-assigned, 0-based and contiguous. Creating appends; deleting closes the gap. |
| D38 | Reorder is one repository method and one transaction under a pipeline row lock. The ids must be exactly the pipeline's stages, each once, or `400 INVALID_STAGE_ORDER` and nothing changes. |
| D39 | Stage creation takes the same lock before reading the next position; the unique index is the backstop. |
| D40 | Names are unique per scope after trimming, case-sensitive: per organization for pipelines, per pipeline for stages. |
| D41 | A stage that holds leads cannot be deleted (`409 PIPELINE_STAGE_IN_USE`, enforced by the foreign key). A pipeline that still has stages cannot be deleted (`409 PIPELINE_NOT_EMPTY`). Leads are never silently deleted or orphaned. |
| D42 | Moving a lead is its own operation (`MoveLeadToStage`). The stage must belong to the lead's organization; a converted lead is refused (`409 LEAD_ALREADY_CONVERTED`); the write is guarded by `status <> 'CONVERTED'`. |
| D43 | The summary is a database aggregation (`LEFT JOIN` + `GROUP BY`), so empty stages show 0 and no lead is loaded into Node. |
| D44 | Hard delete for pipelines and stages. |

## 3. Permissions

| Action | Non-member | MEMBER | ADMIN | OWNER |
|---|---|---|---|---|
| View pipelines, view the summary (`pipeline:read`) | 404 | ✅ | ✅ | ✅ |
| Move a lead (`pipeline:move_lead`) | 404 | ✅ | ✅ | ✅ |
| Create, update, delete a pipeline (`pipeline:create`, `pipeline:update`, `pipeline:delete`) | 404 | 403 | ✅ | ✅ |
| Create, rename, reorder, delete stages (`pipeline:manage_stages`) | 404 | 403 | ✅ | ✅ |

"404" is `ORGANIZATION_NOT_FOUND`. A platform `ADMIN` who is not a member gets nothing. Moving a lead needs `pipeline:move_lead` only; it does not also need `lead:update`.

## 4. Data model

- `Pipeline`: `id`, `organizationId` (FK to `Organization`, `ON DELETE CASCADE`), `name`, `description?`, `createdAt`, `updatedAt`. Unique `(organizationId, name)`.
- `PipelineStage`: `id`, `pipelineId` (FK to `Pipeline`, `ON DELETE CASCADE`), `name`, `position`, `createdAt`, `updatedAt`. Unique `(pipelineId, position)` and unique `(pipelineId, name)`.
- `Lead.pipelineStageId?`: FK to `PipelineStage`, `ON DELETE NO ACTION`, indexed.

`NO ACTION` rather than `RESTRICT` on purpose: it is checked at the end of the statement. A stage that holds a lead still cannot be deleted by itself, but deleting a whole organization can cascade to its stages and its leads in one statement.

## 5. Flows

An organization-scoped request runs: `authenticate` → `requireOrganizationMembership` → `requireOrganizationPermission(pipeline:*)` → controller (Zod) → use case → repository with the verified `organizationId` → PostgreSQL.

**Create stage:** in one transaction the repository locks the pipeline row, reads the highest position and inserts at the next one. A pipeline that is not in the organization gives `404 PIPELINE_NOT_FOUND`; a taken name gives `409`.

**Reorder:** under the same lock the repository loads the stage ids and checks the submitted list is exactly that set, each once. It then writes the positions in two phases: every stage to a distinct negative value, then to its final position. The two phases are needed because the unique `(pipelineId, position)` index is checked row by row, so swapping two positions in one pass would collide. Any failure rolls the whole thing back.

**Delete stage:** under the lock the stage is deleted (the foreign key refuses while a lead is in it, including a lead moved in concurrently), then the later positions are closed up the same two-phase way.

**Delete pipeline:** under the lock it refuses while any stage exists, so a stage cannot be added between the check and the delete.

**Move lead:** the use case looks the stage up through its pipeline's organization (`404 PIPELINE_STAGE_NOT_FOUND` otherwise), then `LeadRepository.moveToStage` repeats that check and updates the lead only if `status <> 'CONVERTED'`. When the update matches nothing, the use case reads the lead to tell `404 LEAD_NOT_FOUND` from `409 LEAD_ALREADY_CONVERTED`.

**Summary:** one SQL statement joins stages to leads (also on `organizationId`), counts per stage in the database and orders by position.

## 6. API reference

All routes are under `/api/v1/organizations/:organizationId`, need `Authorization: Bearer <accessToken>`, and use the standard envelope.

| Method | Path | Permission |
|---|---|---|
| POST | `/pipelines` | `pipeline:create` |
| GET | `/pipelines` | `pipeline:read` |
| GET | `/pipelines/:pipelineId` | `pipeline:read` |
| PATCH | `/pipelines/:pipelineId` | `pipeline:update` |
| DELETE | `/pipelines/:pipelineId` | `pipeline:delete` |
| GET | `/pipelines/:pipelineId/summary` | `pipeline:read` |
| POST | `/pipelines/:pipelineId/stages` | `pipeline:manage_stages` |
| PATCH | `/pipelines/:pipelineId/stages/reorder` | `pipeline:manage_stages` |
| PATCH | `/pipelines/:pipelineId/stages/:stageId` | `pipeline:manage_stages` |
| DELETE | `/pipelines/:pipelineId/stages/:stageId` | `pipeline:manage_stages` |
| PATCH | `/leads/:leadId/stage` | `pipeline:move_lead` |

Pipeline object: `{ id, name, description, stages: [stage], createdAt, updatedAt }` with the stages in position order. Stage object: `{ id, pipelineId, name, position, createdAt, updatedAt }`. Bodies are strict: `organizationId`, `id`, `position` and the timestamps are never accepted.

### `POST /pipelines`

Body: `{ "name": "Sales Pipeline", "description": "Standard B2B sales process" }`. `name` is 1 to 100 characters after trimming; `description` is optional, 1 to 500 characters. `201`, `Pipeline created successfully.`, `data: { pipeline }` (with `stages: []`). `409 PIPELINE_ALREADY_EXISTS`.

### `GET /pipelines` and `GET /pipelines/:pipelineId`

`200`, `data: { pipelines }` or `data: { pipeline }`. The list is oldest first. `404 PIPELINE_NOT_FOUND`.

### `PATCH /pipelines/:pipelineId`

Body: a non-empty subset of `name`, `description`; `null` clears the description. `200`, `data: { pipeline }`. `404 PIPELINE_NOT_FOUND`, `409 PIPELINE_ALREADY_EXISTS`.

### `DELETE /pipelines/:pipelineId`

`200`, `Pipeline deleted successfully.`, `data: null`. `409 PIPELINE_NOT_EMPTY` while it has stages.

### `POST /pipelines/:pipelineId/stages`

Body: `{ "name": "Demo Scheduled" }`. The server picks the position. `201`, `data: { stage }`. `404 PIPELINE_NOT_FOUND`, `409 PIPELINE_STAGE_ALREADY_EXISTS`.

### `PATCH /pipelines/:pipelineId/stages/reorder`

Body: `{ "stageIds": ["<stage-3>", "<stage-1>", "<stage-2>", "<stage-4>"] }`, 1 to 100 uuids, the full new order. `200`, `Stages reordered successfully.`, `data: { pipeline }` with the stages in the new order. `400 INVALID_STAGE_ORDER` for a duplicate, missing, extra or foreign id (nothing changes), `404 PIPELINE_NOT_FOUND`.

### `PATCH /pipelines/:pipelineId/stages/:stageId`

Body: `{ "name": "Qualified" }`. Renames only; the position does not change. `200`, `data: { stage }`. `404 PIPELINE_NOT_FOUND`, `404 PIPELINE_STAGE_NOT_FOUND`, `409 PIPELINE_STAGE_ALREADY_EXISTS`.

### `DELETE /pipelines/:pipelineId/stages/:stageId`

`200`, `Stage deleted successfully.`, `data: null`. The later stages move up one position. `404 PIPELINE_STAGE_NOT_FOUND`, `409 PIPELINE_STAGE_IN_USE` while a lead is in the stage.

### `PATCH /leads/:leadId/stage`

Body: `{ "pipelineStageId": "<uuid>" }`. `200`, `Lead moved successfully.`, `data: { lead }`; the lead carries `pipelineStageId` and its `status` is unchanged. `404 PIPELINE_STAGE_NOT_FOUND` (unknown stage or another organization's), `404 LEAD_NOT_FOUND`, `409 LEAD_ALREADY_CONVERTED`.

### `GET /pipelines/:pipelineId/summary`

`200`, `Pipeline summary retrieved successfully.`

```json
{
  "pipeline": { "id": "uuid", "name": "Sales Pipeline" },
  "stages": [
    { "id": "uuid", "name": "New Lead", "position": 0, "leadCount": 32 },
    { "id": "uuid", "name": "Contacted", "position": 1, "leadCount": 0 }
  ],
  "totalLeads": 32
}
```

Every stage is listed, with `0` for an empty one. `totalLeads` is the sum of the stage counts; leads with no stage are not counted.

## 7. Error codes

| Code | HTTP | When |
|---|---|---|
| `PIPELINE_NOT_FOUND` | 404 | No such pipeline in this organization (also for another organization's pipeline) |
| `PIPELINE_STAGE_NOT_FOUND` | 404 | No such stage in this pipeline or organization |
| `PIPELINE_ALREADY_EXISTS` | 409 | The organization already has a pipeline with this name |
| `PIPELINE_STAGE_ALREADY_EXISTS` | 409 | The pipeline already has a stage with this name |
| `PIPELINE_NOT_EMPTY` | 409 | Deleting a pipeline that still has stages |
| `PIPELINE_STAGE_IN_USE` | 409 | Deleting a stage that still holds leads |
| `INVALID_STAGE_ORDER` | 400 | `stageIds` is not exactly the pipeline's stages, each once |
| `LEAD_NOT_FOUND`, `LEAD_ALREADY_CONVERTED` | 404, 409 | From moving a lead |
| `ORGANIZATION_NOT_FOUND` | 404 | Not a member, or no such organization |
| `INSUFFICIENT_ORGANIZATION_PERMISSION` | 403 | A `MEMBER` managing pipelines or stages |
| `VALIDATION_ERROR` | 400 | Bad id or body; `error.details` maps field to message |
| `UNAUTHORIZED`, `INVALID_ACCESS_TOKEN`, `ACCESS_TOKEN_EXPIRED` | 401 | From `authenticate` |

## 8. Security model and known limits

In place:

- Every repository method filters on the organization, and a stage is reached through its pipeline's organization, so a lead can never be pointed at another organization's stage, and another organization's pipeline or stage is a plain `404`.
- The organization id is never read from the body, and a client cannot set a position.
- Reorder, stage creation, stage deletion and pipeline deletion run under a row lock on the pipeline, so they cannot interleave into duplicate or gapped positions.
- The database enforces the unique names, the unique positions and the foreign key that stops a stage with leads from being deleted.
- A move cannot overwrite a concurrent conversion.
- The summary is computed by the database, and its join is scoped to the organization as well.
- Logs hold ids only, never pipeline or stage names.

Limits:

- No stage history: nothing records who moved a lead or when.
- No default pipeline or default stage for new leads, no filter of the lead list by stage, no stage colours, probabilities or forecast values.
- Names are case-sensitive: "Sales" and "sales" are different pipelines.
- A pipeline cannot be removed in one call; its stages must be deleted first, and each stage must be empty.
- The pipeline list is not paginated.
- No rate limiting (see the known gaps).

## 9. Architecture and where things live

| Layer | Files |
|---|---|
| Domain | `src/domain/entities/Pipeline.ts`, `src/domain/repositories/PipelineRepository.ts`, `PipelineStageRepository.ts`, `LeadRepository.moveToStage`, pipeline permissions in `src/domain/policies/OrganizationPermissions.ts` |
| Application | `src/application/dto/pipeline/`, `src/application/use-cases/pipeline/` (`CreatePipeline`, `ListPipelines`, `GetPipeline`, `UpdatePipeline`, `DeletePipeline`, `CreatePipelineStage`, `UpdatePipelineStage`, `DeletePipelineStage`, `ReorderPipelineStages`, `MoveLeadToStage`, `GetPipelineSummary`) |
| Infrastructure | `src/infrastructure/database/repositories/PrismaPipelineRepository.ts`, `PrismaPipelineStageRepository.ts`, `pipelineSql.ts` (row lock and error helpers), `src/infrastructure/http/controllers/PipelineController.ts` |
| Wiring | `src/app/container.ts`, `src/app/routes.ts`, `src/server.ts` |

There is no `PipelineService`: one class per operation. `PATCH .../stages/reorder` is registered before `.../stages/:stageId` so "reorder" is never read as a stage id.

## 10. Migration and operations

Apply with `npx prisma migrate deploy` (migration `20261001190500_add_pipelines`). It adds the `Pipeline` and `PipelineStage` tables with their unique indexes and foreign keys, and one nullable column and index on `Lead`. Nothing existing changes and no data is backfilled. After pulling, run `npm run prisma:generate`.

## 11. Logging

`pipeline_created`, `pipeline_updated`, `pipeline_deleted`, `pipeline_stage_created`, `pipeline_stage_updated`, `pipeline_stage_deleted`, `pipeline_stages_reordered` (with `stageCount`) and `lead_moved_to_stage`, each with `userId`, `organizationId` and the relevant ids.

## 12. Tests

- `tests/unit/pipelines.test.ts`, `tests/unit/pipeline-requests.test.ts`, `tests/unit/pipeline-permissions.test.ts`: the use cases against in-memory fakes, the request schemas and the permission matrix.
- `tests/integration/pipeline-repositories.test.ts`: real SQL for isolation, unique names and positions, concurrent stage creation, atomic reorder (including a full reversal), position compaction, the stage-in-use and pipeline-not-empty refusals, `moveToStage` guards, the summary aggregation and the organization cascade.
- `tests/integration/pipelines.http.test.ts`: every endpoint over HTTP, validation, permissions and organization isolation.

Each protection was proved by removing it and watching a test fail: the `organizationId` filter in pipeline `findById` and `update`, in stage `findById` and `update`, and in the summary join; the pipeline row lock; the reorder permutation check and its first (negate) phase; the `NOT_EMPTY` check; the foreign-key-to-`PIPELINE_STAGE_IN_USE` mapping; and, in `moveToStage`, the `status <> 'CONVERTED'` guard and the stage organization check. One protection is not proved by a failing test: the two-phase position compaction on stage delete. A plain `position - 1` did not collide in testing (the planner visits the rows in ascending order), so it is kept as a defence that does not depend on the plan.
