import type { AnalyticsModuleConfig } from '@open-mercato/shared/modules/analytics'

export const analyticsConfig: AnalyticsModuleConfig = {
  entities: [
    {
      entityId: 'customers:entities',
      requiredFeatures: ['customers.view'],
      entityConfig: {
        tableName: 'customer_entities',
        dateField: 'created_at',
        defaultScopeFields: ['tenant_id', 'organization_id'],
      },
      fieldMappings: {
        id: { dbColumn: 'id', type: 'uuid' },
        kind: { dbColumn: 'kind', type: 'text' },
        status: { dbColumn: 'status', type: 'text' },
        lifecycleStage: { dbColumn: 'lifecycle_stage', type: 'text' },
        createdAt: { dbColumn: 'created_at', type: 'timestamp' },
        displayName: { dbColumn: 'display_name', type: 'text' },
      },
    },
    {
      entityId: 'customers:deals',
      requiredFeatures: ['customers.deals.view'],
      entityConfig: {
        tableName: 'customer_deals',
        dateField: 'created_at',
        defaultScopeFields: ['tenant_id', 'organization_id'],
      },
      fieldMappings: {
        id: { dbColumn: 'id', type: 'uuid' },
        valueAmount: { dbColumn: 'value_amount', type: 'numeric' },
        status: { dbColumn: 'status', type: 'text' },
        pipelineStage: { dbColumn: 'pipeline_stage', type: 'text' },
        probability: { dbColumn: 'probability', type: 'numeric' },
        createdAt: { dbColumn: 'created_at', type: 'timestamp' },
        expectedCloseAt: { dbColumn: 'expected_close_at', type: 'timestamp' },
      },
      labelResolvers: {
        customerEntityId: { table: 'customer_entities', idColumn: 'id', labelColumn: 'display_name' },
      },
    },
    {
      entityId: 'customers:customer_lead',
      requiredFeatures: ['customers.leads.view'],
      entityConfig: {
        tableName: 'customer_leads',
        dateField: 'created_at',
        defaultScopeFields: ['tenant_id', 'organization_id'],
      },
      fieldMappings: {
        id: { dbColumn: 'id', type: 'uuid' },
        pipelineId: { dbColumn: 'pipeline_id', type: 'uuid' },
        stageId: { dbColumn: 'stage_id', type: 'uuid' },
        source: { dbColumn: 'source', type: 'text' },
        ownerUserId: { dbColumn: 'owner_user_id', type: 'uuid' },
        outcome: { dbColumn: 'outcome', type: 'text' },
        lostReasonId: { dbColumn: 'lost_reason_id', type: 'uuid' },
        convertedAt: { dbColumn: 'converted_at', type: 'timestamp' },
        createdAt: { dbColumn: 'created_at', type: 'timestamp' },
      },
    },
  ],
}

export default analyticsConfig
export const config = analyticsConfig
