export function fetchDriversForSessions<
  TSession extends { sessionKey: number },
  TDriver,
>(
  sessions: TSession[],
  dependencies: {
    getDriversForSession: (sessionKey: number) => Promise<TDriver[]>
  },
  options?: {
    concurrency?: number
    logger?: {
      warn: (message: string) => void
    }
  },
): Promise<Array<{ session: TSession; drivers: TDriver[] }>>
