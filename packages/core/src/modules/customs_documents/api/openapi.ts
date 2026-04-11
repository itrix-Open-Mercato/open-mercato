import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'

export function createCustomsDocumentsOpenApi(methods: OpenApiRouteDoc['methods']): OpenApiRouteDoc {
  return {
    tag: 'Customs Documents',
    methods,
  }
}
