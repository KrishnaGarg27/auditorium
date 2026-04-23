import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Filesystem-backed cache for generated audio assets.
 *
 * Uses SHA-256 hashes of (API endpoint + request params) as cache keys.
 * Cache is per-session — scoped to a single story processing run via the
 * provided `cacheDir`.
 */
export class AudioCache {
  private cacheDir: string;

  constructor(cacheDir: string) {
    this.cacheDir = cacheDir;
  }

  /**
   * Generate a SHA-256 cache key from an API endpoint and its request params.
   */
  computeCacheKey(endpoint: string, params: Record<string, unknown>): string {
    const payload = JSON.stringify({ endpoint, ...params });
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Check if a cached asset exists. Returns its file path if found, null otherwise.
   */
  async get(cacheKey: string): Promise<string | null> {
    const filePath = path.join(this.cacheDir, `${cacheKey}.mp3`);
    try {
      await fs.promises.access(filePath);
      return filePath;
    } catch {
      return null;
    }
  }

  /**
   * Store an audio buffer in the cache and return the written file path.
   */
  async set(cacheKey: string, buffer: Buffer, extension: string): Promise<string> {
    await fs.promises.mkdir(this.cacheDir, { recursive: true });
    const filePath = path.join(this.cacheDir, `${cacheKey}.${extension}`);
    await fs.promises.writeFile(filePath, buffer);
    return filePath;
  }
}
