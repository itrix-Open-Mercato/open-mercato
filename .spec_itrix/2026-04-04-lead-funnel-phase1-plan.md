# Plan: Customers Lead Funnel — Phase 1 (Lead Core)

## Context

Spec: `.spec_itrix/2026-04-03-customers-lead-funnel.md`

Leads are a dedicated pre-CRM staging object inside the `customers` module — not a lifecycle stage on `CustomerEntity`. They prevent spam/bots from polluting canonical CRM records, support multi-pipeline qualification, and preserve ingest provenance for analytics.

This plan covers **Phase 1 only** (core infrastructure). Duplicate detection, pipeline board, linking/conversion, shared fields, and analytics are deferred to Phases 2–4.

### Naming Convention Decision

Codebase commands use **plural**: `customers.deals.create`, `customers.pipelines.create`, `customers.pipeline-stages.create`.
Codebase events use **singular**: `customers.deal.created`, `customers.person.created`.

This plan follows codebase convention (plural commands, singular events). **The spec uses singular for commands — spec needs correction** to align with existing module patterns. This plan is authoritative for implementation naming.

---

## Implementation Strategy

7 commits, each independently verifiable:

### Commit 1: Entities + Validators + Migration

**Modify: `packages/core/src/modules/customers/data/entities.ts`**

Add 5 new MikroORM entity classes (follow `CustomerDeal`, `CustomerPipeline` patterns):

1. **`CustomerLeadPipeline`** (`customer_lead_pipelines`)
   - `id` UUID PK, `organizationId`, `tenantId`, `name` text, `code` text, `isDefault` boolean (default false), `isActive` boolean (default true), `createdAt`, `updatedAt`
   - Index: `[organizationId, tenantId]`
   - **Unique constraint**: `[organizationId, tenantId, code]`

2. **`CustomerLeadPipelineStage`** (`customer_lead_pipeline_stages`)
   - `id`, `organizationId`, `tenantId`, `pipelineId` UUID, `name` text, `code` text, `position` int (default 0), `kind` text (`open`/`won`/`lost`), `isActive` boolean (default true), `createdAt`, `updatedAt`
   - Indexes: `[pipelineId, position]`, `[organizationId, tenantId]`
   - **Unique constraint**: `[organizationId, tenantId, pipelineId, code]`

3. **`CustomerLeadLostReason`** (`customer_lead_lost_reasons`)
   - `id`, `organizationId`, `tenantId`, `pipelineId` UUID nullable (global or pipeline-scoped), `name` text, `code` text, `isActive` boolean (default true), `sortOrder` int (default 0), `createdAt`, `updatedAt`
   - Index: `[organizationId, tenantId]`
   - **Unique constraint**: `[organizationId, tenantId, code]`

4. **`CustomerLead`** (`customer_leads`)
   - All fields from spec data model (see spec lines 191–226)
   - `outcome` text **required**, default `'open'` (not nullable — `open`/`won`/`lost` are the only legal values)
   - `personData`/`companyData`/`dealData`/`sourcePayloadRaw` are jsonb nullable; `spamScore` is numeric nullable
   - No ORM relations — all FKs are plain UUID fields
   - **Partial indexes** (exclude soft-deleted records with `WHERE deleted_at IS NULL`):
     - `[organizationId, tenantId, pipelineId, stageId, createdAt]`
     - `[organizationId, tenantId, outcome, createdAt]`
     - `[organizationId, tenantId, primaryEmail]`
     - `[organizationId, tenantId, primaryPhone]`
     - `[organizationId, tenantId, vatId]`
     - `[organizationId, tenantId, source, sourceChannel]`
   - Soft delete via `deletedAt`

5. **`CustomerLeadHistory`** (`customer_lead_history`)
   - `id`, `organizationId`, `tenantId`, `leadId` UUID, `action` text, `actorUserId` UUID nullable, `payload` jsonb nullable, `createdAt`
   - Index: `[leadId, createdAt]`
   - **Design choice**: append-only table, intentionally no `updatedAt`

**Modify: `packages/core/src/modules/customers/data/validators.ts`**

Add Zod schemas (after existing pipeline schemas):
- `leadPipelineCreateSchema` / `leadPipelineUpdateSchema` / `leadPipelineDeleteSchema`
- `leadPipelineStageCreateSchema` (kind: `z.enum(['open', 'won', 'lost'])`) / `update` / `delete` / `reorderSchema`
- `leadLostReasonCreateSchema` / `update` / `delete`
- `leadCreateSchema` (required: `displayName`, `pipelineId`, `stageId`) / `leadUpdateSchema` / `leadDeleteSchema`
- `leadAssignSchema` (`id` + `ownerUserId`)
- `leadAdvanceStageSchema` (`id` + `stageId` + optional `lostReasonId` + optional `note`)
- `leadMarkLostSchema` (`id` + `lostReasonId` + optional `note`)

Export `z.infer` types for each schema.

**Run:** `yarn db:generate` → `yarn db:migrate`

**Verify:** 5 new tables created with correct columns, indexes, and unique constraints.

---

### Commit 2: ACL + Events + Setup + Search + CE

**Modify: `packages/core/src/modules/customers/acl.ts`**

Add 4 features:
```
{ id: 'customers.leads.view', title: 'View leads', module: 'customers' }
{ id: 'customers.leads.manage', title: 'Manage leads', module: 'customers' }
{ id: 'customers.lead-pipelines.view', title: 'View lead pipelines', module: 'customers' }
{ id: 'customers.lead-pipelines.manage', title: 'Manage lead pipelines', module: 'customers' }
```

**Modify: `packages/core/src/modules/customers/events.ts`**

Add to `events` array (Phase 1 subset, **singular entity** per codebase convention):
```
customers.lead.created       (entity: 'lead', category: 'crud')
customers.lead.updated       (entity: 'lead', category: 'crud')
customers.lead.deleted       (entity: 'lead', category: 'crud')
customers.lead.assigned      (entity: 'lead', category: 'lifecycle')
customers.lead.stage_changed (entity: 'lead', category: 'lifecycle')
customers.lead.lost          (entity: 'lead', category: 'lifecycle')
```

Link/convert events deferred to Phase 3–4.

**Modify: `packages/core/src/modules/customers/setup.ts`**

- Import and call `seedDefaultLeadPipeline(em, scope)` in `seedDefaults`
- Add to `defaultRoleFeatures.employee`: `customers.leads.view`, `customers.leads.manage`, `customers.lead-pipelines.view`

**Modify: `packages/core/src/modules/customers/cli.ts`**

Add `seedDefaultLeadPipeline` function (idempotent, follows `seedDefaultPipeline` pattern):
- 1 pipeline: `Default Lead Pipeline`, code `default`, isDefault true
- 4 stages: `New` (open/0), `Qualifying` (open/1), `Won` (won/2), `Lost` (lost/3)
- 4 lost reasons: `Not interested`, `Budget`, `Competitor`, `Spam`

**Modify: `packages/core/src/modules/customers/search.ts`**

Add `customer_lead` to search config:
- `displayName` high, `primaryEmail` medium, `primaryPhone` medium, `vatId` low, `source` low
- **Pipeline/stage labels**: join or denormalize pipeline name + stage name for search indexing
- `formatResult` with link to `/backend/customers/leads/[id]`

**Modify: `packages/core/src/modules/customers/ce.ts`**

Add: `{ id: 'customers:customer_lead', label: 'Customer Lead', labelField: 'displayName', showInSidebar: false, fields: CUSTOMER_LEAD_CUSTOM_FIELDS }`

**Modify: `packages/core/src/modules/customers/customFieldDefaults.ts`**

Add: `export const CUSTOMER_LEAD_CUSTOM_FIELDS: CustomFieldDefinition[] = []`

**Run:** `npm run modules:prepare`

**Verify:** `yarn lint` passes, new features visible in generated files.

---

### Commit 3: Commands

**Create: `packages/core/src/modules/customers/commands/leads.ts`**

Follow `commands/deals.ts` pattern:
- `loadLeadSnapshot` helper (all scalar fields + custom fields)

Commands (**plural** per codebase convention):
- **`customers.leads.create`** — validate schema, ensureOrganizationScope, verify stageId belongs to pipelineId, create CustomerLead with outcome `open`, flush, emitCrudSideEffects, insert CustomerLeadHistory
- **`customers.leads.update`** — snapshot before, update fields, withAtomicFlush, emitCrudSideEffects, history
- **`customers.leads.delete`** — soft delete, emitCrudSideEffects, history
- **`customers.leads.assign`** — set ownerUserId, emit `customers.lead.assigned`, history
- **`customers.leads.advance_stage`** — validate stage belongs to pipeline. **Stage kind logic**:
  - If target kind = `lost`: require `lostReasonId` in input, set `outcome = 'lost'`, `lostReasonId`, emit `customers.lead.lost`
  - If target kind = `won`: set `outcome = 'won'`, emit `customers.lead.stage_changed`. **Conversion readiness**: add an extensible `checkConversionReadiness(lead)` hook that in Phase 1 is a no-op pass-through, but Phase 4 can wire real checks without breaking the command signature
  - If target kind = `open`: set stageId, emit `customers.lead.stage_changed`
- **`customers.leads.mark_lost`** — convenience command: set `outcome = 'lost'`, `lostReasonId`, find first lost-kind stage and set stageId, emit `customers.lead.lost`, history. This is a shortcut alternative to `advance_stage` with a lost stage.

Each command with undo handler (restore from snapshot).

**Create: `packages/core/src/modules/customers/commands/lead-pipelines.ts`**

Follow `commands/pipelines.ts` + `commands/pipeline-stages.ts` pattern:
- `customers.lead-pipelines.create` / `update` / `delete` (delete checks no active leads reference it)
- `customers.lead-pipeline-stages.create` / `update` / `delete` / `reorder`
  - **Stage kind invariant validation**: on create/update/delete, verify pipeline retains at least 1 `won` stage and at least 1 `lost` stage. Block operations that would violate this. On create, the invariant is only enforced once the pipeline has its initial stages seeded (allow bootstrapping).
- `customers.lead-lost-reasons.create` / `update` / `delete`

**Modify: `packages/core/src/modules/customers/commands/index.ts`**

Add:
```ts
import './leads'
import './lead-pipelines'
```

**Verify:** `yarn lint` passes, commands registerable.

---

### Commit 4: CRUD API Routes

All routes export `openApi`. All use `metadata` with requireAuth + requireFeatures.

**Create: `packages/core/src/modules/customers/api/leads/route.ts`**
- `makeCrudRoute` with `indexer: { entityType: E.customers.customer_lead }`
- GET: list with filters:
  - `pipelineId`, `stageId`, `outcome`, `ownerUserId`, `source` (exact match)
  - `search` (ILIKE on displayName)
  - **`createdFrom`, `createdTo`** (date range filter on createdAt)
  - `page`, `pageSize` (max 100), `sortField`, `sortDir`
- Response includes: all lead scalar fields + **linked/created object IDs** (`linkedPersonId`, `linkedCompanyId`, `linkedDealId`, `createdPersonId`, `createdCompanyId`, `createdDealId`) as-is from entity
- POST: create → `customers.leads.create`
- PUT: update → `customers.leads.update`
- DELETE: soft delete → `customers.leads.delete`
- Features: GET → `customers.leads.view`, POST/PUT/DELETE → `customers.leads.manage`

**Create: `packages/core/src/modules/customers/api/lead-pipelines/route.ts`**
- CRUD for lead pipelines (GET list, POST create)
- Features: GET → `customers.lead-pipelines.view`, POST → `customers.lead-pipelines.manage`

**Create: `packages/core/src/modules/customers/api/lead-pipelines/[id]/route.ts`**
- GET/PUT/DELETE for single pipeline

**Create: `packages/core/src/modules/customers/api/lead-pipeline-stages/route.ts`**
- GET list (filter by `pipelineId`), POST create

**Create: `packages/core/src/modules/customers/api/lead-pipeline-stages/[id]/route.ts`**
- GET/PUT/DELETE

**Create: `packages/core/src/modules/customers/api/lead-pipeline-stages/reorder/route.ts`**
- POST → reorder command

**Create: `packages/core/src/modules/customers/api/lead-lost-reasons/route.ts`**
- GET list (optional `pipelineId` filter), POST create

**Create: `packages/core/src/modules/customers/api/lead-lost-reasons/[id]/route.ts`**
- GET/PUT/DELETE

**Run:** `npm run modules:prepare`

**Verify:** `yarn lint`, manual API tests (CRUD for pipelines, stages, lost reasons).

---

### Commit 5: Lead Action Routes

**Create: `packages/core/src/modules/customers/api/leads/assign/route.ts`**
- POST → `customers.leads.assign`

**Create: `packages/core/src/modules/customers/api/leads/advance-stage/route.ts`**
- POST → `customers.leads.advance_stage`

**Create: `packages/core/src/modules/customers/api/leads/mark-lost/route.ts`**
- POST → `customers.leads.mark_lost`

**Verify:** Manual API tests (create lead, assign, advance stage through open→won, advance to lost with lostReasonId, mark-lost shortcut).

---

### Commit 6: i18n

**Modify: `packages/core/src/modules/customers/i18n/en.json`** (+ `pl.json`, `de.json`, `es.json`)

Add keys for:
- Navigation: `customers.nav.leads`
- List columns: displayName, pipeline, stage, outcome, owner, source, email, phone, createdAt
- Form labels: all lead fields, pipeline/stage/lost-reason config fields
- Form sections: Lead Overview, Potential Person, Potential Company, Potential Deal, Lead-only Metadata, Source Payload, Links & Conversion
- Action buttons: assign, advanceStage, markLost
- Success/error messages for all mutations
- Config page: leadPipelines title, stages, lostReasons
- Audit labels for history entries

**Verify:** `yarn lint`, no missing key warnings.

---

### Commit 7: Backend UI Pages

**Create: `packages/core/src/modules/customers/backend/customers/leads/page.meta.ts`**
- requireFeatures: `['customers.leads.view']`, pageGroup: Customers, pageOrder: 130

**Create: `packages/core/src/modules/customers/backend/customers/leads/page.tsx`**
- DataTable: columns (displayName, pipeline, stage, outcome, owner, source, primaryEmail, createdAt)
- Filters: pipelineId (select), stageId (select), outcome (select: open/won/lost), ownerUserId, source, **createdFrom/createdTo** (date range)
- Row actions: View detail, Delete
- Create button → `/backend/customers/leads/create`

**Create: `packages/core/src/modules/customers/backend/customers/leads/create/page.tsx`**
- CrudForm with sections:
  1. **Lead Overview** — displayName, pipelineId, stageId, ownerUserId
  2. **Potential Person** — primaryEmail, primaryPhone, personData fields
  3. **Potential Company** — vatId, companyData fields
  4. **Potential Deal** — dealData fields
  5. **Source** — source, sourceChannel, sourceExternalId, sourceReceivedAt
  6. **Notes** — qualificationNotes
- Pipeline/stage selectors fetched from lead-pipelines API
- POST → `/api/customers/leads`, redirect to list

**Create: `packages/core/src/modules/customers/backend/customers/leads/[id]/page.meta.ts`**

**Create: `packages/core/src/modules/customers/backend/customers/leads/[id]/page.tsx`**
- CrudForm detail/edit with full section set:
  1. **Lead Overview** — displayName, pipeline, stage, outcome, ownerUserId
  2. **Potential Person** — primaryEmail, primaryPhone, personData
  3. **Potential Company** — vatId, companyData
  4. **Potential Deal** — dealData
  5. **Lead-only Metadata** — spamScore, qualificationNotes
  6. **Source Payload / Intake** — source, sourceChannel, sourceExternalId, sourceReceivedAt, sourcePayloadRaw (read-only JSON viewer)
  7. **Links & Conversion** — read-only display of linkedPersonId, linkedCompanyId, linkedDealId, createdPersonId, createdCompanyId, createdDealId, convertedAt, convertedByUserId (all initially empty in Phase 1, prepared for Phase 3-4)
- Action buttons: Assign, Advance Stage, Mark Lost (with ConfirmDialog for lost reason selection)
- `useGuardedMutation` for action buttons

**Create: `packages/core/src/modules/customers/backend/config/customers/leads/page.meta.ts`**
- requireFeatures: `['customers.lead-pipelines.manage']`, pageContext: 'settings'

**Create: `packages/core/src/modules/customers/backend/config/customers/leads/page.tsx`**
- Tabs/sections: Pipelines (DataTable + CRUD), Stages (DataTable per pipeline with reorder), Lost Reasons (DataTable + CRUD with sortOrder)

**Modify: `packages/core/src/modules/customers/index.ts`**
- Update description to include "leads"

**Verify:** Full UI test — sidebar shows Leads, list renders, create/detail/config pages work.

---

## Testing Strategy

### Integration Tests (within Phase 1 commits)

Add integration tests in `packages/core/src/modules/customers/__integration__/leads/`:

**In Commit 5 (after action routes):**
- `lead-crud.test.ts` — create lead, read, update, delete via API; verify org scoping
- `lead-pipeline-config.test.ts` — CRUD for pipelines, stages, lost reasons; verify stage kind invariant enforcement; verify unique code constraint
- `lead-actions.test.ts` — assign, advance stage (open→open, open→won, open→lost with reason), mark-lost shortcut; verify outcome transitions

**In Commit 7 (after UI):**
- Manual verification per checklist below

### Non-Functional Checks (every commit)
- All queries filter by `organizationId` + `tenantId`
- `pageSize <= 100` enforced
- Zod validation on every mutation
- No raw fetch in backend pages

---

## Explicitly Deferred (Phase 2–4)

| Item | Phase | Notes |
|------|-------|-------|
| Duplicate detection (`/api/customers/leads/duplicate-check`) | 2 | |
| `hasDuplicates` filter on lead list | 2 | Depends on duplicate detection |
| Duplicate summary in list response | 2 | Depends on duplicate detection |
| Pipeline board view (`/backend/customers/leads/pipeline`) | 2 | |
| History timeline UI | 2 | Entity exists, UI deferred |
| Link/create person/company/deal commands + API | 3 | |
| `CustomerLeadFieldBinding` entity | 3 | |
| Shared field write-through | 3 | |
| Conversion flow + lineage | 4 | `checkConversionReadiness` hook is a no-op placeholder in Phase 1 |
| Dashboard widgets | 4 | |
| Link/convert events (`customers.lead.*_linked`, `*.converted`) | 3–4 | |

---

## Design Decisions Log

| Decision | Rationale |
|----------|-----------|
| Commands use plural (`customers.leads.*`), events use singular (`customers.lead.*`) | Matches existing codebase convention (`customers.deals.create` / `customers.deal.created`) |
| `advance_stage` handles lost transitions (with `lostReasonId`), `mark_lost` is a convenience shortcut | Spec says "transition to lost stage requires lostReasonId" — both paths are valid |
| `outcome` is required with default `'open'`, not nullable | Simplifies queries and invariants; spec's `nullable` annotation is treated as a spec oversight |
| Unique constraint on `code` per org/tenant | Prevents duplicate pipeline/stage/reason codes within a scope |
| Partial indexes with `WHERE deleted_at IS NULL` | Production queries always filter soft-deleted; partial indexes keep them efficient |
| `CustomerLeadHistory` is append-only (no `updatedAt`) | Immutable audit log; entries are never modified |
| `checkConversionReadiness` is a no-op hook in Phase 1 | Avoids hardcoding logic that Phase 4 must replace; preserves command signature stability |
| Stage kind invariant (min 1 won + 1 lost per pipeline) | Enforced on stage create/update/delete commands; bootstrapping is exempt |

---

## Key Reference Files

| Pattern | Copy from |
|---------|-----------|
| Entity structure | `data/entities.ts` → `CustomerDeal`, `CustomerPipeline`, `CustomerPipelineStage` |
| Validators | `data/validators.ts` → deal/pipeline schemas |
| Commands | `commands/deals.ts`, `commands/pipelines.ts`, `commands/pipeline-stages.ts` |
| CRUD API route | `api/deals/route.ts`, `api/pipelines/route.ts` |
| OpenAPI helper | `api/openapi.ts` → `createCrudOpenApiFactory` |
| List page | `backend/customers/deals/page.tsx` |
| Create page | `backend/customers/people/create/page.tsx` |
| Detail page | `backend/customers/deals/[id]/page.tsx` |
| Config page | `backend/config/customers/pipeline-stages/page.tsx` |
| Seed function | `cli.ts` → `seedDefaultPipeline` |

---

## Final Verification Checklist

1. `yarn db:generate` → migration for 5 new tables with partial indexes and unique constraints
2. `yarn db:migrate` → applies cleanly
3. `npm run modules:prepare` → regenerates discovery files
4. `yarn lint` → no errors
5. `yarn build:packages` → builds cleanly
6. API: POST `/api/customers/leads` creates lead, GET returns it with linked/created IDs
7. API: GET `/api/customers/lead-pipelines` returns seeded default pipeline
8. API: POST `/api/customers/leads/advance-stage` transitions lead (including lost with lostReasonId)
9. API: POST `/api/customers/leads/mark-lost` sets outcome + lost reason
10. API: stage delete blocked when it would remove last won/lost stage
11. API: `createdFrom`/`createdTo` filters work on lead list
12. Integration tests pass for lead CRUD, pipeline config, and lead actions
13. UI: `/backend/customers/leads` shows DataTable with Leads in sidebar
14. UI: Create form has 6 sections, submits successfully
15. UI: Detail page has 7 sections, action buttons work
16. UI: `/backend/config/customers/leads` shows pipeline/stage/reason config
17. Search: lead found by display name, email, and pipeline/stage label
