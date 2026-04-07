import { TenantDataEncryptionService } from '../tenantDataEncryptionService'

describe('TenantDataEncryptionService map lookup', () => {
  it('deduplicates concurrent cache misses before querying encryption maps', async () => {
    let releaseCacheLookup: (() => void) | null = null
    const cacheLookupStarted = new Promise<void>((resolve) => {
      releaseCacheLookup = resolve
    })
    const cache = {
      get: jest.fn(async () => {
        await cacheLookupStarted
        return null
      }),
      set: jest.fn(async () => undefined),
    }
    const execute = jest.fn(async () => [
      {
        entity_id: 'directory:organization',
        fields_json: [{ field: 'name' }],
      },
    ])
    const service = new TenantDataEncryptionService(
      { getConnection: () => ({ execute }) } as never,
      { cache: cache as never },
    )
    const getMap = (service as unknown as {
      getMap: (key: { entityId: string; tenantId: string | null; organizationId: string | null }) => Promise<unknown>
    }).getMap.bind(service)
    const key = {
      entityId: 'directory:organization',
      tenantId: 'tenant-1',
      organizationId: null,
    }

    const first = getMap(key)
    const second = getMap(key)
    releaseCacheLookup?.()

    await expect(Promise.all([first, second])).resolves.toHaveLength(2)
    expect(execute).toHaveBeenCalledTimes(1)
  })
})
