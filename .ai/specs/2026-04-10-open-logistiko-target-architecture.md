# Open Logistiko — Target Architecture

**Status**: Draft
**Date**: 2026-04-10
**Author**: AI-assisted
**Related**: [2026-04-10-open-logistiko-architecture-principles.md](./2026-04-10-open-logistiko-architecture-principles.md), [2026-04-10-open-logistiko-mvp-demo-scope.md](./2026-04-10-open-logistiko-mvp-demo-scope.md), [SPEC-040-2026-02-22-document-parser-module.md](./SPEC-040-2026-02-22-document-parser-module.md)

## TLDR

The target architecture turns Open Logistiko from a demo workflow into an Open Mercato-native customs decisioning module with full reference sync, hybrid search/RAG, contextual observability, optional workflow approvals, notifications, and feedback-driven retrieval memory.

The core long-term decision remains: **Open Mercato owns description-to-HS retrieval locally; ISZTAR4 is used for reference sync and live enrichment of known candidate codes.**

---

## 1. Architecture Principles

Open Logistiko is an auditable decision-support workflow.

Key invariants:

- human-in-the-loop final HS selection,
- retrieval before judging,
- local HS reference index before live enrichment,
- evidence-based confidence,
- contextual observability,
- graceful degradation when documents or ISZTAR4 are incomplete.

See [2026-04-10-open-logistiko-architecture-principles.md](./2026-04-10-open-logistiko-architecture-principles.md).

---

## 2. Module Structure

Recommended module ID: `customs_documents`

Target structure:

```text
packages/core/src/modules/customs_documents/
  index.ts
  acl.ts
  setup.ts
  di.ts
  events.ts
  notifications.ts
  notifications.client.ts
  search.ts
  api/
  backend/
  commands/
  data/
    entities.ts
    validators.ts
    enrichers.ts
  i18n/
  lib/
  subscribers/
  workers/
  widgets/
```

---

## 3. Target Data Model

Target entities:

- `customs_case`
- `customs_document`
- `customs_line_item`
- `customs_consistency_check`
- `customs_hs_candidate`
- `customs_hs_decision`
- `customs_decision_trace`
- `customs_hs_reference`
- `customs_hs_measure_cache`
- `customs_term_alias`
- `customs_hs_feedback`

### 3.1 `customs_hs_reference`

Local search-ready HS/CN reference data imported from ISZTAR4.

Fields:

- `hs_code`
- `language`
- `description`
- `hierarchy_path`
- `keywords`
- `source`
- `reference_date`
- `synced_at`
- `is_leaf`

### 3.2 `customs_hs_measure_cache`

Cached ISZTAR4 `measures` responses.

Fields:

- `hs_code`
- `language`
- `reference_date`
- `response_snapshot`
- `summary`
- `fetched_at`
- `expires_at`
- `fetch_status`

### 3.3 `customs_decision_trace`

Decision observability and explainability.

Fields:

- `case_id`
- `line_item_id`
- `stage`
- `input_snapshot`
- `output_snapshot`
- `warnings`
- `latency_ms`
- `provider`
- `provider_version`
- `template_version`
- `confidence`

---

## 4. Target Pipeline

1. Ingest attachments.
2. Extract PDF text and layout.
3. Run OCR fallback when native text is insufficient.
4. Extract document-specific schemas.
5. Normalize into canonical customs line items.
6. Run deterministic consistency checks.
7. Retrieve HS candidates from local providers.
8. Enrich top candidates through ISZTAR4.
9. Run constrained judge/reranker.
10. Present evidence to the agent.
11. Save human decision.
12. Feed decision into retrieval memory.

---

## 5. Retrieval Architecture

### 5.1 Providers

Use provider-style composition:

- `HsReferenceSearchProvider` — search over local HS reference rows.
- `HsDecisionMemoryProvider` — search over accepted historical decisions.
- `TermAliasProvider` — exact/fuzzy lookup over tenant aliases.
- `SourceHsCodeProvider` — direct boost when invoice contains an HS code.
- `OptionalIsztarTextSearchProvider` — disabled by default until a reliable REST endpoint is verified.

### 5.2 Open Mercato Search

Target `search.ts` should index:

- `customs_documents:customs_hs_reference`
- `customs_documents:customs_hs_decision`
- optionally `customs_documents:customs_case`

Recommended strategies:

- `tokens` as always-available baseline,
- `meilisearch` for fuzzy fulltext,
- `vector` for semantic similarity over canonical descriptions.

### 5.3 Candidate merging

The merger should:

- normalize codes to 10 digits,
- deduplicate by normalized code,
- preserve source contributions,
- compute retrieval score,
- keep raw provider evidence for explanations.

---

## 6. ISZTAR4 Target Integration

### 6.1 Roles

ISZTAR4 has two target roles:

1. Reference sync using `goods-nomenclature/codes`.
2. Candidate enrichment using `goods-nomenclature/measures`.

### 6.2 Adapter

Wrap API calls behind a DI-resolved service, e.g. `customsIsztar4Client`.

Recommended methods:

- `fetchNomenclaturePage({ date, language, page })`
- `fetchMeasures({ nomenclatureCode, date, language })`
- `syncNomenclature({ date, languages })`
- `normalizeCode(input)`

The adapter must implement:

- timeouts,
- conservative retries,
- response validation,
- raw response capture,
- measure cache reads/writes,
- explicit date/language handling.

### 6.3 Sync

Full sync should:

- fetch all relevant pages for configured languages,
- store `reference_date`,
- store `language`,
- preserve hierarchy paths,
- be idempotent,
- trigger search reindexing.

The target architecture may use scheduler jobs for periodic sync.

---

## 7. Function Calling and AI

Function calling is bounded by backend contracts.

Allowed function categories:

- document type detection,
- schema-based extraction,
- translation,
- canonical description generation,
- product attribute extraction,
- bounded candidate reranking,
- explanation generation.

Disallowed:

- unbounded “choose final HS code” calls,
- free-form ISZTAR4 description search by the model,
- final confidence fully owned by the LLM.

Backend owns:

- orchestration,
- validation,
- final score aggregation,
- persistence,
- audit trace.

---

## 8. Judging and Confidence

Final confidence should be composed from:

- `extractionQualityScore`
- `completenessScore`
- `consistencyScore`
- `retrievalScore`
- `ruleScore`
- `judgeScore`
- `historySimilarityScore`
- `isztar4EnrichmentStatus`

Confidence bands:

- `High`
- `Medium`
- `Low`

Low confidence is a valid outcome and should route to review.

---

## 9. Contextual Observability

Every major step should write a trace record and emit a typed event.

Target event examples:

- `customs.case.created`
- `customs.document.uploaded`
- `customs.document.parsed`
- `customs.case.normalized`
- `customs.case.consistency_checked`
- `customs.line_item.candidates_retrieved`
- `customs.line_item.candidates_enriched`
- `customs.line_item.hs_ranked`
- `customs.line_item.hs_selected`
- `customs.case.review_required`

Trace records support:

- explainability,
- pipeline debugging,
- prompt/version drift detection,
- human override analysis.

---

## 10. Workflow Integration

Workflow integration is optional for MVP but recommended for target operations.

Use workflows for:

- second reviewer flows,
- SLA tracking,
- escalation for low confidence,
- manual reprocessing,
- external signals.

Example process:

- `Documents Received`
- `Machine Review Completed`
- `Agent Review Required`
- `HS Decision Confirmed`
- `Escalated`
- `Approved`

Domain state remains in `customs_documents`; workflows orchestrate review state and tasks.

---

## 11. Notifications

Notification types:

- `customs.case.ready_for_review`
- `customs.case.low_confidence`
- `customs.case.discrepancy_detected`
- `customs.case.reprocessing_failed`
- `customs.case.second_review_requested`

Notifications should deep-link to the case detail review page.

---

## 12. Target UI

Target case detail sections:

- uploaded documents,
- extracted normalized data,
- consistency findings,
- product lines,
- HS candidate ranking,
- ISZTAR4 measures and restrictions,
- decision trace,
- similar historical decisions.

Candidate panel fields:

- HS code,
- description,
- confidence,
- explanation,
- contributing evidence,
- source breakdown,
- ISZTAR4 live/cache status,
- measures summary,
- manual selection action.

---

## 13. Target API Surface

Candidate routes:

- `POST /api/customs_documents/cases`
- `GET /api/customs_documents/cases`
- `GET /api/customs_documents/cases/:id`
- `POST /api/customs_documents/cases/:id/documents`
- `POST /api/customs_documents/cases/:id/reprocess`
- `GET /api/customs_documents/cases/:id/consistency`
- `GET /api/customs_documents/line-items/:id/candidates`
- `POST /api/customs_documents/line-items/:id/select-hs`
- `POST /api/customs_documents/reference/isztar4/sync`
- `POST /api/customs_documents/reference/isztar4/enrich`

All routes must export `openApi`.

---

## 14. Target Implementation Phases

### Phase 1 — MVP Demo

See [2026-04-10-open-logistiko-mvp-demo-scope.md](./2026-04-10-open-logistiko-mvp-demo-scope.md).

### Phase 2 — Deterministic Judging

- confidence composition,
- candidate explanations,
- multilingual normalization,
- decision trace persistence,
- provider contribution tracking.

### Phase 3 — Deep Open Mercato Integration

- workers and progress UX,
- notifications,
- workflow user tasks,
- historical decision search,
- full ISZTAR4 reference sync scheduling and reindexing.

### Phase 4 — Operational Learning

- decision feedback loops,
- tenant-specific aliases and priors,
- override analytics,
- second-review policies.

---

## 15. Risks

- No confirmed REST free-text HS search endpoint in the provided ISZTAR4 API spec.
- Browser-level text search exists in ISZTAR4 UI help but should not be assumed as REST.
- Document layouts vary.
- AI ranking can become overconfident if unconstrained.
- Live ISZTAR4 may be slow or unavailable.

Mitigations:

- local retrieval-ready HS reference storage,
- ISZTAR4 as enrichment, not primary search path,
- cached measures responses,
- bounded candidate judging,
- backend-owned score aggregation,
- explainable trace data.

---

## 16. Changelog

### 2026-04-10
- Initial target architecture split out from the larger customs decisioning spec
