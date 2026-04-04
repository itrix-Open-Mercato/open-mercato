# Implementation Plan: Customers Lead Funnel — Phase 1 (Lead Core)

## Context
Spec: `.spec_itrix/2026-04-03-customers-lead-funnel.md`

Leads are a dedicated pre-CRM staging object inside the `customers` module — not a lifecycle stage on `CustomerEntity`. They prevent spam/bots from polluting canonical CRM records, support multi-pipeline qualification, and preserve ingest provenance for analytics. This plan covers **Phase 1** only (core infrastructure). Phases 2–4 build on top.

---

## Files to Modify

### Add entities to `packages/core/src/modules/customers/data/entities.ts`
Add 5 new MikroORM entities (sibling pattern — same as `CustomerDeal`, `CustomerPipeline`):
- `CustomerLead` — table `customer_leads` (full field list from spec)
- `CustomerLeadPipeline` — table `customer_lead_pipelines`
- `CustomerLeadPipelineStage` — table `customer_lead_pipeline_stages`
- `CustomerLeadLostReason` — table `customer_lead_lost_reasons`
- `CustomerLeadHistory` — table `customer_lead_history`

No ORM relations to other modules — use UUID FK fields only (`linked_person_id`, `linked_company_id`, `linked_deal_id`).

### Add validators to `packages/core/src/modules/customers/data/validators.ts`
Zod schemas (derive types via `z.infer`):
- `leadCreateSchema` — required: `displayName`, `pipelineId`, `stageId`; optional: all other lead fields
- `leadUpdateSchema` — id + mutable fields
- `leadPipelineCreateSchema` / `leadPipelineUpdateSchema`
- `leadPipelineStageCreateSchema` / `leadPipelineStageUpdateSchema`
- `leadLostReasonCreateSchema` / `leadLostReasonUpdateSchema`

### Add ACL features to `packages/core/src/modules/customers/acl.ts`
```
customers.leads.view
customers.leads.manage
customers.lead-pipelines.view
customers.lead-pipelines.manage
```

### Update `packages/core/src/modules/customers/setup.ts`
- Add new features to `admin: ['customers.*']` wildcard (already covered)
- Add explicit grants to `employee` role: `customers.leads.view`, `customers.leads.manage`, `customers.lead-pipelines.view`
- Add `seedDefaultLeadPipeline()` call in `seedDefaults` — creates one default pipeline with stages: `New` (open), `Qualifying` (open), `Won` (won), `Lost` (lost)
- Add `seedDefaultLeadLostReasons()` — seeds: `Not interested`, `Budget`, `Competitor`, `Spam`

### Add lead events to `packages/core/src/modules/customers/events.ts`
Add to the events array (all with `category: 'crud'` or `'lifecycle'`):
```
customers.lead.created / updated / deleted
customers.lead.assigned
customers.lead.stage_changed
customers.lead.lost
customers.lead.person_linked / company_linked / deal_linked
customers.lead.person_created / company_created / deal_created
customers.lead.converted
```

### New file: `packages/core/src/modules/customers/commands/leads.ts`
Commands (follow `commands/deals.ts` pattern with `registerCommand` + undo):
- `createLeadCommand` — validate schema, insert `CustomerLead`, `emitCrudSideEffects`
- `updateLeadCommand` — validate schema, update fields, `emitCrudSideEffects`
- `deleteLeadCommand` — soft delete via `deletedAt`, `emitCrudSideEffects`
- `assignLeadCommand` — set `ownerUserId`, emit `customers.lead.assigned`
- `advanceLeadStageCommand` — validate stage belongs to pipeline, set `stageId`, emit `customers.lead.stage_changed`
- `markLeadLostCommand` — set `outcome = lost`, `lostReasonId`, emit `customers.lead.lost`

### New file: `packages/core/src/modules/customers/commands/lead-pipelines.ts`
- `createLeadPipelineCommand` / `updateLeadPipelineCommand` / `deleteLeadPipelineCommand`
- `createLeadPipelineStageCommand` / `updateLeadPipelineStageCommand` / `deleteLeadPipelineStageCommand`
- `createLeadLostReasonCommand` / `updateLeadLostReasonCommand` / `deleteLeadLostReasonCommand`

### Update `packages/core/src/modules/customers/commands/index.ts`
Add:
```ts
export * from './leads'
export * from './lead-pipelines'
```

### Add search config to `packages/core/src/modules/customers/search.ts`
Add `customer_lead` to `fieldPolicy`:
```
displayName (high), primaryEmail (medium), primaryPhone (medium), source (low), qualificationNotes (low)
```

### Add custom entity to `packages/core/src/modules/customers/ce.ts`
```
{ id: 'customers:customer_lead', label: 'Customer Lead', fields: CUSTOMER_LEAD_CUSTOM_FIELDS }
```
Define `CUSTOMER_LEAD_CUSTOM_FIELDS = []` as empty array in `customFieldDefaults.ts` — admin will configure.

---

## New API Route Files

All routes export `openApi`. All use `makeCrudRoute` where applicable.

| File | Handler |
|------|---------|
| `api/leads/route.ts` | GET (list with pipelineId/stageId/outcome filters), POST (create) |
| `api/leads/[id]/route.ts` | GET (detail), PUT (update), DELETE (soft delete) |
| `api/leads/assign/route.ts` | POST → `assignLeadCommand` |
| `api/leads/advance-stage/route.ts` | POST → `advanceLeadStageCommand` |
| `api/leads/mark-lost/route.ts` | POST → `markLeadLostCommand` |
| `api/leads/duplicate-check/route.ts` | POST — query people/companies by email, phone, vatId; return confidence buckets |
| `api/lead-pipelines/route.ts` | GET, POST |
| `api/lead-pipelines/[id]/route.ts` | GET, PUT, DELETE |
| `api/lead-pipeline-stages/route.ts` | GET, POST |
| `api/lead-pipeline-stages/[id]/route.ts` | GET, PUT, DELETE |
| `api/lead-lost-reasons/route.ts` | GET, POST |
| `api/lead-lost-reasons/[id]/route.ts` | GET, PUT, DELETE |

Phase 2–3 routes (link/create/convert) deferred.

---

## New Backend UI Files

| File | Route | Purpose |
|------|-------|---------|
| `backend/customers/leads/page.tsx` | `/backend/customers/leads` | Lead list with DataTable |
| `backend/customers/leads/create/page.tsx` | `/backend/customers/leads/create` | Create lead form |
| `backend/customers/leads/[id]/page.tsx` | `/backend/customers/leads/[id]` | Lead detail/edit |
| `backend/config/customers/leads/page.tsx` | `/backend/config/customers/leads` | Pipeline + lost reason admin |

Navigation: inject `Leads` menu item under `customers` nav section (follow deals nav injection pattern).

---

## Database Migration
After adding entities, run:
```bash
yarn db:generate
yarn db:migrate
```

---

## Phased Deferral

| Phase | Scope | Status |
|-------|-------|--------|
| **1 (this plan)** | Entities, validators, events, ACL, setup seeds, commands, CRUD APIs, basic UI, duplicate-check | **In scope** |
| 2 | Pipeline board, full stage transition UX, history timeline | Deferred |
| 3 | Manual link/create person/company/deal, field binding config, write-through shared fields | Deferred |
| 4 | Explicit conversion flow, lineage persistence, dashboard widgets, integration tests | Deferred |

---

## Verification

1. `yarn db:generate` — produces migration for 5 new tables
2. `yarn db:migrate` — applies cleanly
3. `yarn generate` — regenerates module discovery (new `customer_lead` CE)
4. `yarn lint` — no type errors
5. `yarn build:packages` — builds cleanly
6. Manual: create lead via POST `/api/customers/leads`, fetch via GET, verify org scoping
7. Manual: seed default pipeline visible in GET `/api/customers/lead-pipelines`
8. Manual: advance stage via POST `/api/customers/leads/advance-stage`
9. Manual: `/backend/customers/leads` renders list, create form works
