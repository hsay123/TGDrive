import { errors } from 'telegram'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isFloodWaitError(error: unknown): error is errors.FloodWaitError {
  return error instanceof errors.FloodWaitError
}

function getFloodWaitSeconds(error: unknown): number {
  if (isFloodWaitError(error)) {
    return error.seconds
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'seconds' in error &&
    typeof (error as { seconds: unknown }).seconds === 'number'
  ) {
    return (error as { seconds: number }).seconds
  }
  return 1
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: unknown
  let attempt = 0

  while (true) {
    try {
      await telegramRateLimiter.throttle()
      return await fn()
    } catch (error) {
      lastError = error

      if (isFloodWaitError(error)) {
        await sleep(getFloodWaitSeconds(error) * 1000)
        continue
      }

      if (attempt >= maxRetries) {
        break
      }

      await sleep(baseDelayMs * Math.pow(2, attempt))
      attempt++
    }
  }

  throw lastError
}

/**
 * Like withRetry, but detects "Could not find the input entity" errors and
 * refreshes gramjs's entity cache before retrying once.
 */
export async function withEntityRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)

    if (msg.includes('Could not find the input entity')) {
      console.warn(
        '[entity-retry] Entity not found, refreshing cache and retrying once...'
      )
      const { warmEntityCache } = await import('./client')
      await warmEntityCache()
      return await fn()
    }

    throw error
  }
}

export class RateLimiter {
  private tokens: number
  private lastRefill: number
  private readonly maxTokens: number
  private readonly refillRate: number

  constructor(callsPerSecond: number) {
    this.maxTokens = callsPerSecond
    this.tokens = callsPerSecond
    this.refillRate = callsPerSecond / 1000
    this.lastRefill = Date.now()
  }

  async throttle(): Promise<void> {
    while (true) {
      const now = Date.now()
      const elapsed = now - this.lastRefill
      this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate)
      this.lastRefill = now

      if (this.tokens >= 1) {
        this.tokens -= 1
        return
      }

      const waitMs = Math.ceil((1 - this.tokens) / this.refillRate)
      await sleep(waitMs)
    }
  }
}

export const telegramRateLimiter = new RateLimiter(20)
