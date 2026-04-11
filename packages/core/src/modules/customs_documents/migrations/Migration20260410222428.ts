import { Migration } from '@mikro-orm/migrations';

export class Migration20260410222428 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "customs_cases" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "reference" text not null, "status" text not null default 'uploaded', "source_country" text null, "destination_country" text null, "currency" text null, "final_confidence" numeric(10,0) null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "customs_cases_pkey" primary key ("id"));`);
    this.addSql(`create index "customs_cases_reference_idx" on "customs_cases" ("reference");`);
    this.addSql(`create index "customs_cases_org_tenant_status_idx" on "customs_cases" ("organization_id", "tenant_id", "status");`);

    this.addSql(`create table "customs_consistency_checks" ("id" uuid not null default gen_random_uuid(), "case_id" uuid not null, "organization_id" uuid not null, "tenant_id" uuid not null, "field" text not null, "source_a" text not null, "source_b" text not null, "value_a" text null, "value_b" text null, "status" text not null, "message" text null, "evidence_json" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "customs_consistency_checks_pkey" primary key ("id"));`);
    this.addSql(`create index "customs_consistency_checks_org_tenant_idx" on "customs_consistency_checks" ("organization_id", "tenant_id");`);
    this.addSql(`create index "customs_consistency_checks_case_status_idx" on "customs_consistency_checks" ("case_id", "status");`);

    this.addSql(`create table "customs_documents" ("id" uuid not null default gen_random_uuid(), "case_id" uuid not null, "attachment_id" uuid not null, "organization_id" uuid not null, "tenant_id" uuid not null, "kind" text not null, "status" text not null default 'uploaded', "file_name" text null, "mime_type" text null, "content_text" text null, "extracted_fields_json" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "customs_documents_pkey" primary key ("id"));`);
    this.addSql(`create index "customs_documents_org_tenant_idx" on "customs_documents" ("organization_id", "tenant_id");`);
    this.addSql(`create index "customs_documents_case_kind_idx" on "customs_documents" ("case_id", "kind");`);
    this.addSql(`alter table "customs_documents" add constraint "customs_documents_case_attachment_unique" unique ("case_id", "attachment_id");`);

    this.addSql(`create table "customs_hs_candidates" ("id" uuid not null default gen_random_uuid(), "line_item_id" uuid not null, "case_id" uuid not null, "organization_id" uuid not null, "tenant_id" uuid not null, "hs_code" text not null, "description" text not null, "score" numeric(10,0) not null, "explanation" text not null, "source_breakdown_json" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "customs_hs_candidates_pkey" primary key ("id"));`);
    this.addSql(`create index "customs_hs_candidates_org_tenant_idx" on "customs_hs_candidates" ("organization_id", "tenant_id");`);
    this.addSql(`create index "customs_hs_candidates_line_score_idx" on "customs_hs_candidates" ("line_item_id", "score");`);

    this.addSql(`create table "customs_hs_decisions" ("id" uuid not null default gen_random_uuid(), "line_item_id" uuid not null, "case_id" uuid not null, "candidate_id" uuid null, "organization_id" uuid not null, "tenant_id" uuid not null, "selected_hs_code" text not null, "selected_description" text null, "confidence_score" numeric(10,0) null, "confidence_band" text not null, "note" text null, "selected_by_user_id" uuid null, "evidence_json" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "customs_hs_decisions_pkey" primary key ("id"));`);
    this.addSql(`create index "customs_hs_decisions_org_tenant_idx" on "customs_hs_decisions" ("organization_id", "tenant_id");`);
    this.addSql(`create index "customs_hs_decisions_case_idx" on "customs_hs_decisions" ("case_id");`);
    this.addSql(`create index "customs_hs_decisions_line_idx" on "customs_hs_decisions" ("line_item_id");`);

    this.addSql(`create table "customs_hs_measure_cache" ("id" uuid not null default gen_random_uuid(), "hs_code" text not null, "date" text not null, "language" text not null, "source" text not null, "summary_json" jsonb null, "raw_response_json" jsonb null, "error_message" text null, "fetched_at" timestamptz not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "customs_hs_measure_cache_pkey" primary key ("id"));`);
    this.addSql(`create index "customs_hs_measure_cache_fetched_idx" on "customs_hs_measure_cache" ("fetched_at");`);
    this.addSql(`alter table "customs_hs_measure_cache" add constraint "customs_hs_measure_cache_lookup_unique" unique ("hs_code", "date", "language");`);

    this.addSql(`create table "customs_line_items" ("id" uuid not null default gen_random_uuid(), "case_id" uuid not null, "organization_id" uuid not null, "tenant_id" uuid not null, "description" text not null, "quantity" numeric(10,0) null, "gross_weight_kg" numeric(10,0) null, "net_weight_kg" numeric(10,0) null, "invoice_hs_code" text null, "status" text not null default 'pending', "source_json" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "customs_line_items_pkey" primary key ("id"));`);
    this.addSql(`create index "customs_line_items_org_tenant_idx" on "customs_line_items" ("organization_id", "tenant_id");`);
    this.addSql(`create index "customs_line_items_case_status_idx" on "customs_line_items" ("case_id", "status");`);
  }

}
