# Open Logistiko — MVP Demo Scope

**Status**: Draft
**Date**: 2026-04-10
**Author**: AI-assisted
**Related**: [2026-04-10-open-logistiko-architecture-principles.md](./2026-04-10-open-logistiko-architecture-principles.md), [2026-04-10-open-logistiko-target-architecture.md](./2026-04-10-open-logistiko-target-architecture.md)

## TLDR

The MVP demo must prove one complete customs-agent workflow: upload three transport documents, parse/normalize them, show at least one consistency check, retrieve HS candidates, call ISZTAR4 live for at least one candidate, and let the agent manually select an HS code.

The MVP prioritizes a reliable end-to-end demo over full nomenclature sync, vector search, workflow approvals, and advanced feedback loops.

---

## 1. Demo Acceptance Criteria

### 1.1 Working end-to-end prototype

The agent must be able to:

1. create or open one customs case,
2. upload three documents:
   - Bill of Lading,
   - Commercial Invoice,
   - Packing List,
3. trigger processing,
4. view a normalized case detail page,
5. review HS candidates for at least one line item,
6. manually select and save an HS code.

Ambitious demo path:

- The agent can select a local folder containing the three customs PDFs.
- Open Logistiko auto-detects Bill of Lading, Commercial Invoice, and Packing List by filename.
- If the folder contains multiple document sets, Open Logistiko first groups files by a stable batch key from the filename, for example `Set_1`, `Set_2`, or a trailing set number.
- One action creates one customs case per complete group, uploads the grouped documents, attaches them to the correct case, and runs processing for each group.
- The UI shows how many complete groups were detected before the batch action runs.

### 1.2 Visible consistency verification

The UI must show at least one machine comparison across documents.

Minimum acceptable checks:

- B/L gross weight vs Packing List gross weight, or
- Packing List net/gross weight vs Commercial Invoice weight when present, or
- B/L package/unit quantity vs Packing List package/unit quantity, or
- Commercial Invoice quantity vs Packing List quantity.

The displayed result must show:

- compared field name,
- source document A,
- source document B,
- source value A,
- source value B,
- status: `pass`, `warning`, `fail`, or `missing_source`.

### 1.3 Live ISZTAR4 integration

The demo must send at least one live request to ISZTAR4 during the flow.

Required behavior:

- candidate retrieval may use local/preloaded Open Mercato data,
- at least one top candidate must be enriched live through `GET /tariff/rest/goods-nomenclature/measures`,
- the UI must show returned ISZTAR4 data to the agent,
- the UI must expose whether the data is live or cached.

---

## 2. MVP Architecture

### 2.1 Module

Recommended module ID: `customs_documents`

The MVP should add a dedicated module under:

```text
packages/core/src/modules/customs_documents/
```

Minimum files:

```text
index.ts
acl.ts
setup.ts
events.ts
data/entities.ts
data/validators.ts
api/
backend/
lib/
workers/
```

Add `search.ts` only if the MVP uses Open Mercato search indexing directly. A simpler MVP may perform deterministic local lookup against seeded `customs_hs_reference` rows and add full `search.ts` in the target architecture phase.

### 2.2 Minimal data model

MVP entities:

- `customs_case`
- `customs_document`
- `customs_line_item`
- `customs_consistency_check`
- `customs_hs_candidate`
- `customs_hs_decision`
- `customs_hs_reference`
- `customs_hs_measure_cache`

Optional MVP entity:

- `customs_decision_trace`

Even if `customs_decision_trace` is not implemented as a full table in the first pass, the MVP should store enough debug/evidence JSON to explain how a candidate was produced.

---

## 3. MVP Pipeline

### 3.1 Upload

Input:

- three PDFs uploaded for a case,
- document kind selected by the user or auto-detected from filename/text.
- optional folder-style batch upload where the UI selects multiple PDFs, groups them by filename batch key, deduplicates one document per supported kind inside each group, and runs the same create + attach + process pipeline per complete group.

Output:

- `customs_document` rows linked to `customs_case`,
- file references via the existing attachment/storage approach selected during implementation.

### 3.2 PDF text extraction

MVP should use native PDF text extraction first because the provided sample PDFs have usable text layers.

Fallback:

- OCR or AI vision fallback may be stubbed or deferred,
- if fallback is not implemented, low-quality extraction must be marked as `failed` or `needs_review`.

### 3.3 Schema-based extraction

MVP should support three document schemas:

- `bill_of_lading`,
- `commercial_invoice`,
- `packing_list`.

Extraction may combine:

- deterministic regex/heuristics for critical fields,
- bounded function calling for structured line item extraction,
- post-processing validation with zod.

Critical MVP fields:

- document number,
- shipper/seller,
- consignee/buyer,
- container number when present,
- product description,
- quantity,
- gross weight,
- net weight when present,
- total amount and currency when present,
- invoice-provided HS code when present.

### 3.4 Consistency checks

Minimum checks:

- total gross weight where available,
- total quantity/packages where available,
- shipper/seller name similarity where practical,
- consignee/buyer name similarity where practical.

The MVP may implement a small fixed check set rather than a general rules engine.

### 3.5 HS candidate retrieval

MVP retrieval should be deterministic and demo-safe.

Acceptable approach:

- preload a small `customs_hs_reference` subset covering sample documents,
- normalize invoice descriptions,
- match via keywords and known aliases,
- boost invoice-provided HS code if present,
- return top candidates with a simple score and explanation.

For sample documents, likely demo-relevant candidates include:

- vehicle chassis / tractor trucks,
- excavators,
- industrial/construction/mining tyres.

### 3.6 Live ISZTAR4 enrichment

For each top candidate:

1. normalize the HS code to 10 digits,
2. call `GET /tariff/rest/goods-nomenclature/measures`,
3. cache the response in `customs_hs_measure_cache`,
4. show summary in the candidate panel.

The implementation must not block manual HS selection if live enrichment fails.

### 3.7 Manual selection

The agent must be able to:

- select a candidate,
- optionally add a note,
- save a `customs_hs_decision`,
- see the line item marked as classified.

---

## 4. ISZTAR4 MVP Contract

Base URL:

```text
https://ext-isztar4.mf.gov.pl/tariff/rest
```

Required MVP endpoint:

```text
GET /goods-nomenclature/measures?nomenclatureCode=<10-digit-code>&date=<YYYY-MM-DD>&language=<PL|EN>
```

Optional MVP endpoint:

```text
GET /goods-nomenclature/codes?date=<YYYY-MM-DD>&language=<PL|EN>&page=<number>
```

Rules:

- Always pass explicit `date`.
- Prefer `PL` for agent-facing data.
- `EN` may be useful for English source matching.
- Normalize HS codes before calling measures.
- Capture raw response snapshots for demo/debugging.

---

## 5. MVP UI

### 5.1 Case list

Use `DataTable`.

Columns:

- reference,
- status,
- document count,
- consistency status,
- unclassified line item count,
- updated at.

### 5.2 Case detail

Sections:

- uploaded documents,
- extracted summary,
- consistency checks,
- product line items,
- HS candidate review.

### 5.3 Candidate panel

For each candidate show:

- HS code,
- description,
- final score or confidence band,
- why it matched,
- source breakdown,
- ISZTAR4 live/cache status,
- ISZTAR4 measures summary,
- select action.

---

## 6. MVP API Surface

Required routes:

- `POST /api/customs_documents/cases`
- `GET /api/customs_documents/cases`
- `GET /api/customs_documents/cases/:id`
- `POST /api/customs_documents/cases/:id/documents`
- `POST /api/customs_documents/cases/:id/process`
- `GET /api/customs_documents/cases/:id/consistency`
- `GET /api/customs_documents/cases/:id/line-items`
- `GET /api/customs_documents/line-items/:id/candidates`
- `POST /api/customs_documents/line-items/:id/select-hs`

Optional route:

- `POST /api/customs_documents/reference/isztar4/enrich`

All API routes must export `openApi`.

---

## 7. MVP Events

Required events:

- `customs.case.created`
- `customs.document.uploaded`
- `customs.document.parsed`
- `customs.case.consistency_checked`
- `customs.line_item.candidates_retrieved`
- `customs.line_item.candidates_enriched`
- `customs.line_item.hs_selected`

Use `createModuleEvents()` with `as const`.

---

## 8. MVP Deferrals

The following should be deferred unless they are needed for demo stability:

- full ISZTAR4 nomenclature sync,
- vector search,
- workflow user tasks,
- notification renderers,
- tenant-specific learned priors,
- second reviewer approval flows,
- full OCR/vision pipeline,
- advanced semantic judging.

---

## 9. Risks & Mitigations

### Risk: ISZTAR4 live request fails during demo

Mitigation:

- cache successful measure responses,
- keep manual selection available,
- show live/cache status clearly.

### Risk: PDF parsing misses a field

Mitigation:

- focus MVP checks on fields present in selected sample set,
- show missing source as a valid check status,
- allow processing to continue.

### Risk: HS retrieval is too broad

Mitigation:

- seed a controlled reference subset for sample goods,
- use aliases for demo goods,
- show confidence and source breakdown.

### Risk: Database migrations are not yet safe to generate

Mitigation:

- keep deterministic parser, HS retrieval, and ISZTAR4 summarization covered by unit tests,
- do not run full API/UI E2E until a clean module-only migration can be generated,
- treat migration safety as the entry gate for Playwright coverage of the full upload -> process -> enrich -> select-HS demo.

---

## 10. Changelog

### 2026-04-10
- Initial MVP/demo scope split out from the larger customs decisioning spec

### 2026-04-11
- Added the UI read-model route `GET /api/customs_documents/cases/:id/line-items` so the case detail cockpit can reload persisted line items after processing.
- Added backend demo cockpit scope for `/backend/customs-documents` and `/backend/customs-documents/:id`: create/open case, upload and attach three PDFs, process, inspect consistency, enrich candidates through ISZTAR4, and select HS.
- Added deterministic unit coverage for extraction, consistency checks, multilingual HS candidate scoring, fallback scoring, and ISZTAR4 summary parsing. Full API/UI E2E remains gated by safe database migration generation.
- Added CLI module filtering for `db generate` and `db migrate` via `--module`, `-m`, and `--modules` so the customs module can be prepared without running every enabled module.
- Generated a clean create-only customs migration through a filtered shadow database workflow and applied it to the local demo database with `db:migrate --module customs_documents`.
- Kept the migration safety caveat explicit: direct generation against a shared existing database can still surface unrelated schema diffs, so new-module create-only migrations should use the filtered shadow database workflow until the generator can diff against a full baseline safely.
- Added an executable Playwright API smoke test for the full demo flow: create case, upload three PDF-named documents, attach extracted text, process consistency checks, list HS candidates, call the live ISZTAR4 enrichment route with structured failure handling, and save the selected HS decision.
- Verified the new Phase 8 test is discoverable by Playwright and passes package typecheck. Runtime execution in the local app is currently blocked before customs routes by a missing `isolated-vm` dependency from the enabled `ai_assistant` module, which causes the global `/api/[...slug]` route to fail compilation during `/api/auth/login`.
- Added an idempotent `auth seed-acls` CLI path for existing demo databases so newly enabled module permissions such as `customs_documents.*` can be merged into admin roles without resetting tenant data.
