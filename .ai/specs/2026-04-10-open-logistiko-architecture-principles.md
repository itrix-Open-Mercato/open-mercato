# Open Logistiko — Architecture Principles

**Status**: Draft
**Date**: 2026-04-10
**Author**: AI-assisted
**Related**: [2026-04-10-project-specification.md](./2026-04-10-project-specification.md), [SPEC-040-2026-02-22-document-parser-module.md](./SPEC-040-2026-02-22-document-parser-module.md), [SPEC-041-2026-02-24-universal-module-extension-system.md](./implemented/SPEC-041-2026-02-24-universal-module-extension-system.md)

## TLDR

Open Logistiko should be built as an **auditable decision-support system**, not as a black-box PDF parser. The system's job is to reduce decision uncertainty for a customs agent by transforming transport documents into structured facts, consistency findings, ranked HS candidates, and a human-confirmed classification with a full trace of evidence.

---

## 1. First Principles

### 1.1 Core problem

The real problem is not "reading PDFs" or "calling ISZTAR4". The real problem is:

- ingesting unreliable external documents,
- extracting operational facts,
- reducing ambiguity,
- surfacing discrepancies,
- narrowing the HS decision space,
- preserving human control.

### 1.2 Irreducible capabilities

Any valid solution must:

1. Read incoming documents.
2. Normalize document facts into one canonical model.
3. Detect cross-document inconsistencies.
4. Retrieve plausible HS candidates.
5. Present a ranked shortlist with explanation and confidence.
6. Let a customs agent make and save the final decision.

Everything else is an optimization.

### 1.3 Product definition

Open Logistiko is best understood as:

> an auditable customs decision-support workflow that converts unstructured logistics documents into explainable recommendations for human review.

### 1.4 ISZTAR4 first-principles boundary

ISZTAR4 should not be treated as a natural-language classification oracle. Based on the provided REST documentation and live endpoint verification, ISZTAR4 is primarily:

- a legal/tariff reference source for nomenclature codes,
- a source of measures, duties, supplementary units, restrictions, and conditions for a known code,
- a source for building a local reference index.

Therefore, Open Logistiko MUST own the description-to-candidate retrieval layer locally. ISZTAR4 should enrich and verify candidate codes, not be the only mechanism for discovering candidates from a product description.

---

## 2. Architectural Invariants

### 2.1 Human-in-the-loop is mandatory

- The system MUST NOT auto-finalize HS classification without human confirmation.
- The final accepted HS code is always a user decision, even when the confidence is high.

### 2.2 Determinism over magic

- Numeric comparisons, totals, tolerances, field validation, and state transitions MUST remain deterministic and backend-controlled.
- LLMs MAY interpret, translate, normalize, and rank constrained candidates, but they MUST NOT own the full decision flow.

### 2.3 Retrieval before judging

- HS judging MUST operate on a bounded candidate set.
- The system MUST retrieve candidates before ranking them.
- Retrieval SHOULD combine multiple sources: HS reference data, historical accepted decisions, and domain aliases.
- Retrieval MUST NOT depend on a live ISZTAR4 free-text search endpoint unless that endpoint is explicitly verified and wrapped behind a fallback-capable adapter.

### 2.4 Local index before live enrichment

- The system SHOULD maintain a local HS/CN reference index derived from ISZTAR4 nomenclature code trees.
- Live ISZTAR4 calls SHOULD be used to enrich top candidates with measures and legal/tariff details.
- The review UI SHOULD distinguish locally retrieved candidates from live-enriched tariff details.

### 2.5 Multi-layer confidence

- Confidence MUST be evidence-based, not a single opaque model score.
- Final confidence SHOULD be derived from extraction quality, data completeness, consistency checks, retrieval strength, and constrained judge output.

### 2.6 Full traceability

- Every major pipeline step MUST emit structured evidence.
- The platform MUST preserve original source text, normalized values, candidate generation rationale, and final user outcome.

---

## 3. Core Pipeline Principle

Open Logistiko SHOULD use the following conceptual pipeline:

1. **Ingest** — accept uploaded attachments.
2. **Extract** — read text from PDF, OCR only when needed.
3. **Normalize** — map document-specific fields into a canonical customs model.
4. **Verify** — compare values across B/L, invoice, and packing list.
5. **Retrieve** — search HS reference data and past decisions.
6. **Enrich** — call ISZTAR4 for measures/details only for top candidate codes.
7. **Judge** — rank only retrieved candidates and explain the ranking.
8. **Review** — let the user inspect evidence and select the final HS code.
9. **Learn** — store the accepted decision as future retrieval memory.

This pipeline MUST be explicit in the domain model, events, and UI.

---

## 4. Open Mercato Fit

### 4.1 Domain ownership

Open Logistiko SHOULD be a dedicated module in `packages/core/src/modules/`, with its own entities, APIs, backend pages, search configuration, events, and workers.

### 4.2 Platform capabilities to reuse

- **Attachments** for PDF ingestion.
- **Queue workers** for parsing, retrieval, and ranking stages.
- **Events** for stage orchestration and audit-friendly decoupling.
- **Search** for RAG-style retrieval over HS references and accepted decisions.
- **Workflows** for optional review/approval stages.
- **Notifications** for review readiness and low-confidence outcomes.
- **UMES** for extensible review screens and explainability widgets.

### 4.3 Recommended platform posture

- Domain state lives in the module.
- Long-running work lives in workers.
- Progress and lifecycle live in events.
- Human approval lives in workflow/user task or module-level review state.
- Explainability lives in the product surface, not only in logs.

---

## 5. Document Reading Principle

### 5.1 PDF is only a transport container

The true system input is not a PDF file. It is:

- text,
- layout hints,
- structured fields,
- provenance of extracted evidence.

### 5.2 Reading strategy

The document reading strategy SHOULD be layered:

1. native PDF text extraction,
2. OCR fallback for image-based or low-quality documents,
3. schema-driven field extraction,
4. deterministic normalization and validation.

This avoids turning ingestion into a single black-box model call.

---

## 6. Multilingual Principle

The system MUST support descriptions in multiple languages, including low-resource and non-Latin scripts.

Each product line SHOULD preserve:

- `sourceDescription`
- `detectedLanguage`
- `translatedPl`
- `canonicalDescription`
- `extractedAttributes`

The original text is for audit. The translated Polish text is for agent review and ISZTAR-oriented UX. The canonical description is for retrieval and judging.

---

## 7. Judging Principle

Judging SHOULD be implemented as constrained ranking, not open-ended generation.

Recommended structure:

- deterministic candidate filtering,
- retrieval scoring,
- rules-based evidence scoring,
- constrained LLM reranking,
- final confidence aggregation.

The system SHOULD distinguish:

- candidate relevance,
- evidence completeness,
- decision uncertainty.

Low confidence is a valid outcome and SHOULD route the user to explicit review.

---

## 8. ISZTAR4 Integration Principle

The ISZTAR4 integration MUST follow a two-role model:

1. **Reference sync role** — import nomenclature code trees into Open Mercato-owned search/index tables.
2. **Live enrichment role** — fetch measures and legal details for known 10-digit candidate codes.

The module SHOULD normalize all candidate codes before live calls:

- strip separators,
- preserve digits,
- pad shorter valid HS/CN codes to 10 digits with trailing zeroes when needed,
- reject malformed codes locally.

The module SHOULD pass explicit date and language parameters to ISZTAR4 and avoid relying on remote fallback behavior.

---

## 9. Contextual Observability Principle

Observability MUST be domain-aware.

For each case and line item, the platform SHOULD store a decision trace that records:

- stage,
- inputs,
- outputs,
- model/provider/version,
- prompt/template version,
- latency,
- warnings,
- confidence,
- selected outcome.

This trace is both an operational debugging tool and a product feature for explainability.

---

## 10. Safety Principle

- Missing or partial documents MUST degrade gracefully.
- Uncertain extractions MUST be flagged, not hidden.
- Retrieval ambiguity MUST increase uncertainty, not trigger overconfident output.
- User overrides MUST be first-class events and future learning inputs.
- ISZTAR4 unavailability MUST degrade the enrichment layer only; it MUST NOT block local candidate review or manual HS selection.

---

## 11. Decision Summary

Open Logistiko SHOULD be implemented as:

- a dedicated Open Mercato domain module,
- backed by events and workers,
- using Open Mercato search as the primary description-to-HS retrieval infrastructure,
- using ISZTAR4 as reference sync and live enrichment infrastructure,
- using LLMs only inside constrained, auditable steps,
- exposing confidence and evidence to the user,
- ending every classification with an explicit human-confirmed decision.

## Changelog

### 2026-04-10
- Initial architecture principles for Open Logistiko
