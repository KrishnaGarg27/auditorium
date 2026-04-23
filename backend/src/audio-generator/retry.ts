/**
 * Reusable retry wrapper with exponential backoff for ElevenLabs API calls.
 */

export interface RetryOptions {
  /** Maximum number of retry attempts. Default: 3 */
  maxRetries: number;
  /** Base delay in milliseconds for exponential backoff. Default: 1000 */
  baseDelayMs: number;
  /** Timeout per attempt in milliseconds. */
  timeoutMs: number;
}

/**
 * Checks whether an error has a non-retryable HTTP status (401 or 422).
 * These indicate permanent failures (invalid API key or invalid parameters).
 */
export function isNonRetryableStatus(error: unknown): boolean {
  if (error == null || typeof error !== 'object') return false;
  const err = error as Record<string, unknown>;
  const status = err.statusCode ?? err.status ?? err.code;
  return status === 401 || status === 422;
}

/**
 * Extracts a Retry-After delay (in ms) from an error object, if present.
 * The Retry-After value is expected in seconds.
 * Returns null if no valid Retry-After value is found.
 */
export function getRetryAfterMs(error: unknown): number | null {
  if (error == null || typeof error !== 'object') return null;
  const err = error as Record<string, unknown>;

  // Check for retryAfter on the error itself
  let raw: unknown = err.retryAfter;

  // Check nested headers object
  if (raw == null && err.headers != null && typeof err.headers === 'object') {
    const headers = err.headers as Record<string, unknown>;
    raw = headers['retry-after'] ?? headers['Retry-After'];
  }

  if (raw == null) return null;

  const seconds = typeof raw === 'number' ? raw : Number(raw);
  if (Number.isNaN(seconds) || seconds <= 0) return null;

  return seconds * 1000;
}

function isRateLimited(error: unknown): boolean {
  if (error == null || typeof error !== 'object') return false;
  const err = error as Record<string, unknown>;
  const status = err.statusCode ?? err.status ?? err.code;
  return status === 429;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wraps an async function with retry logic and per-attempt timeouts.
 *
 * - Retries up to `maxRetries` times on transient errors (5xx, network, timeout).
 * - Fails immediately on 401 (invalid API key) and 422 (invalid params).
 * - Respects 429 rate-limit responses: uses Retry-After header if present,
 *   otherwise falls back to exponential backoff.
 * - Each attempt is bounded by `timeoutMs` using Promise.race.
 * - Backoff delays: baseDelayMs * 2^attempt (1s, 2s, 4s for defaults).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const { maxRetries, baseDelayMs, timeoutMs } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request timed out')), timeoutMs),
        ),
      ]);
      return result;
    } catch (error: unknown) {
      lastError = error;

      // Non-retryable status codes — fail immediately
      if (isNonRetryableStatus(error)) {
        throw error;
      }

      // If we've exhausted all retries, throw
      if (attempt >= maxRetries) {
        throw error;
      }

      // Calculate delay
      const backoffMs = baseDelayMs * Math.pow(2, attempt);

      if (isRateLimited(error)) {
        const retryAfter = getRetryAfterMs(error);
        await delay(retryAfter ?? backoffMs);
      } else {
        await delay(backoffMs);
      }
    }
  }

  // Should never reach here, but just in case
  throw lastError;
}
