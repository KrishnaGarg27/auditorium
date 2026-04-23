import { describe, it, expect, afterAll } from 'vitest';
import fc from 'fast-check';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { withRetry } from './retry.js';
import { AudioCache } from './cache.js';

/**
 * Feature: audio-drama-engine, Property 10: Retry with exponential backoff
 *
 * For any ElevenLabs API call that fails with a transient error, the Audio
 * Generator should retry up to 3 times with exponential backoff delays
 * (1s, 2s, 4s). After 3 failed retries, it should report the failure
 * without further retries.
 *
 * Validates: Requirements 8.4
 */
describe('Property 10: Retry with exponential backoff', () => {
  it('retries transient failures up to 3 times, then succeeds or throws after exactly 4 calls', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 5 }),
        async (failureCount: number) => {
          let callCount = 0;

          const fn = async (): Promise<string> => {
            callCount++;
            if (callCount <= failureCount) {
              const err: Record<string, unknown> = new Error('Transient error');
              (err as any).statusCode = 500;
              throw err;
            }
            return 'success';
          };

          const options = { maxRetries: 3, baseDelayMs: 1, timeoutMs: 5000 };

          if (failureCount <= 3) {
            // Should eventually succeed
            const result = await withRetry(fn, options);
            expect(result).toBe('success');
            expect(callCount).toBe(failureCount + 1);
          } else {
            // Should throw after initial + 3 retries = 4 calls
            await expect(withRetry(fn, options)).rejects.toThrow();
            expect(callCount).toBe(4);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('non-retryable errors (401, 422) fail immediately without retries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(401, 422),
        async (statusCode: number) => {
          let callCount = 0;

          const fn = async (): Promise<string> => {
            callCount++;
            const err: any = new Error(`HTTP ${statusCode}`);
            err.statusCode = statusCode;
            throw err;
          };

          const options = { maxRetries: 3, baseDelayMs: 1, timeoutMs: 5000 };

          await expect(withRetry(fn, options)).rejects.toThrow();
          expect(callCount).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });
});


/**
 * Feature: audio-drama-engine, Property 11: Audio asset caching idempotence
 *
 * For any audio generation request (TTS, SFX, or Music), calling the
 * generation function twice with identical parameters should result in
 * exactly one external API call, with the second call returning the
 * cached result.
 *
 * Validates: Requirements 8.5
 */

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-cache-test-'));
  tempDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
});

describe('Property 11: Audio asset caching idempotence', () => {
  it('computeCacheKey returns the same key for identical endpoint and params', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 10 }),
          fc.oneof(fc.string({ maxLength: 20 }), fc.integer(), fc.boolean()),
          { minKeys: 0, maxKeys: 5 },
        ),
        async (endpoint: string, params: Record<string, unknown>) => {
          const cacheDir = makeTempDir();
          const cache = new AudioCache(cacheDir);

          const key1 = cache.computeCacheKey(endpoint, params);
          const key2 = cache.computeCacheKey(endpoint, params);

          expect(key1).toBe(key2);
          expect(typeof key1).toBe('string');
          expect(key1.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('cache.set then cache.get returns the cached file path', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 10 }),
          fc.oneof(fc.string({ maxLength: 20 }), fc.integer(), fc.boolean()),
          { minKeys: 0, maxKeys: 5 },
        ),
        async (endpoint: string, params: Record<string, unknown>) => {
          const cacheDir = makeTempDir();
          const cache = new AudioCache(cacheDir);

          const cacheKey = cache.computeCacheKey(endpoint, params);
          const buffer = Buffer.from('fake-audio-data');

          // Before set, get should return null
          const before = await cache.get(cacheKey);
          expect(before).toBeNull();

          // Set the cache entry
          const filePath = await cache.set(cacheKey, buffer, 'mp3');
          expect(typeof filePath).toBe('string');

          // After set, get should return the file path
          const after = await cache.get(cacheKey);
          expect(after).toBe(filePath);

          // Verify the file actually exists and has correct content
          const content = fs.readFileSync(filePath);
          expect(content.toString()).toBe('fake-audio-data');
        },
      ),
      { numRuns: 100 },
    );
  });
});
