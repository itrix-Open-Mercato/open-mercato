import { AccessLogService } from '../accessLogService'

describe('AccessLogService rotation', () => {
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('throttles retention cleanup so access logging does not run deletes per request', async () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-04-07T00:00:00.000Z'))

    const service = new AccessLogService({} as unknown as ConstructorParameters<typeof AccessLogService>[0])
    const rotate = (service as unknown as { rotate: (fork: unknown) => Promise<void> }).rotate.bind(service)
    const fork = {
      nativeDelete: jest.fn().mockResolvedValue(0),
    }

    await rotate(fork)
    await rotate(fork)

    expect(fork.nativeDelete).toHaveBeenCalledTimes(2)

    jest.setSystemTime(new Date('2026-04-07T00:01:00.001Z'))
    await rotate(fork)

    expect(fork.nativeDelete).toHaveBeenCalledTimes(4)
  })
})
