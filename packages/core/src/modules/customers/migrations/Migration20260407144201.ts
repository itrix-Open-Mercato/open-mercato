import { Migration } from '@mikro-orm/migrations';

export class Migration20260407144201 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "customer_leads" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "pipeline_id" uuid not null, "stage_id" uuid not null, "outcome" text not null default 'open', "lost_reason_id" uuid null, "display_name" text not null, "owner_user_id" uuid null, "source" text null, "source_channel" text null, "source_external_id" text null, "source_payload_raw" jsonb null, "source_received_at" timestamptz null, "primary_email" text null, "primary_phone" text null, "vat_id" text null, "spam_score" numeric(5,4) null, "qualification_notes" text null, "person_data" jsonb null, "company_data" jsonb null, "deal_data" jsonb null, "created_person_id" uuid null, "created_company_id" uuid null, "created_deal_id" uuid null, "linked_person_id" uuid null, "linked_company_id" uuid null, "linked_deal_id" uuid null, "converted_at" timestamptz null, "converted_by_user_id" uuid null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "customer_leads_pkey" primary key ("id"));`);
    this.addSql(`create index "customer_leads_vat_idx" on "customer_leads" ("organization_id", "tenant_id", "vat_id");`);
    this.addSql(`create index "customer_leads_phone_idx" on "customer_leads" ("organization_id", "tenant_id", "primary_phone");`);
    this.addSql(`create index "customer_leads_email_idx" on "customer_leads" ("organization_id", "tenant_id", "primary_email");`);
    this.addSql(`create index "customer_leads_outcome_created_idx" on "customer_leads" ("organization_id", "tenant_id", "outcome", "created_at");`);
    this.addSql(`create index "customer_leads_pipeline_stage_created_idx" on "customer_leads" ("pipeline_id", "stage_id", "created_at");`);
    this.addSql(`create index "customer_leads_source_idx" on "customer_leads" ("organization_id", "tenant_id", "source");`);
    this.addSql(`create index "customer_leads_org_tenant_idx" on "customer_leads" ("organization_id", "tenant_id");`);

    this.addSql(`create table "customer_lead_field_bindings" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "pipeline_id" uuid null, "lead_field_key" text not null, "binding_mode" text not null, "target_entity_kind" text null, "target_field_key" text null, "section_kind" text not null, "is_active" boolean not null default true, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "customer_lead_field_bindings_pkey" primary key ("id"));`);
    this.addSql(`create index "customer_lead_field_bindings_scope_idx" on "customer_lead_field_bindings" ("organization_id", "tenant_id", "pipeline_id");`);
    this.addSql(`alter table "customer_lead_field_bindings" add constraint "customer_lead_field_bindings_unique" unique ("organization_id", "tenant_id", "pipeline_id", "lead_field_key");`);

    this.addSql(`create table "customer_lead_history" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "lead_id" uuid not null, "event_type" text not null, "actor_user_id" uuid null, "note" text null, "metadata" jsonb null, "created_at" timestamptz not null, constraint "customer_lead_history_pkey" primary key ("id"));`);
    this.addSql(`create index "customer_lead_history_org_tenant_idx" on "customer_lead_history" ("organization_id", "tenant_id");`);
    this.addSql(`create index "customer_lead_history_lead_created_idx" on "customer_lead_history" ("lead_id", "created_at");`);

    this.addSql(`create table "customer_lead_lost_reasons" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "pipeline_id" uuid null, "name" text not null, "code" text not null, "is_active" boolean not null default true, "sort_order" int not null default 0, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "customer_lead_lost_reasons_pkey" primary key ("id"));`);
    this.addSql(`create index "customer_lead_lost_reasons_scope_idx" on "customer_lead_lost_reasons" ("organization_id", "tenant_id", "pipeline_id");`);
    this.addSql(`alter table "customer_lead_lost_reasons" add constraint "customer_lead_lost_reasons_code_unique" unique ("organization_id", "tenant_id", "pipeline_id", "code");`);

    this.addSql(`create table "customer_lead_pipelines" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "name" text not null, "code" text not null, "is_default" boolean not null default false, "is_active" boolean not null default true, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "customer_lead_pipelines_pkey" primary key ("id"));`);
    this.addSql(`create index "customer_lead_pipelines_org_tenant_idx" on "customer_lead_pipelines" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "customer_lead_pipelines" add constraint "customer_lead_pipelines_code_unique" unique ("organization_id", "tenant_id", "code");`);

    this.addSql(`create table "customer_lead_pipeline_stages" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "pipeline_id" uuid not null, "name" text not null, "code" text not null, "position" int not null default 0, "kind" text not null default 'open', "is_active" boolean not null default true, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "customer_lead_pipeline_stages_pkey" primary key ("id"));`);
    this.addSql(`create index "customer_lead_pipeline_stages_org_tenant_idx" on "customer_lead_pipeline_stages" ("organization_id", "tenant_id");`);
    this.addSql(`create index "customer_lead_pipeline_stages_pipeline_position_idx" on "customer_lead_pipeline_stages" ("pipeline_id", "position");`);
    this.addSql(`alter table "customer_lead_pipeline_stages" add constraint "customer_lead_pipeline_stages_code_unique" unique ("organization_id", "tenant_id", "pipeline_id", "code");`);
  }

}
