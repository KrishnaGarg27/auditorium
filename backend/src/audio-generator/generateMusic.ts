import type { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import type { MusicCue, AudioAsset } from '../types/index.js';
import { withRetry } from './retry.js';
import type { AudioCache } from './cache.js';
import { probeDurationMs } from './probe.js';
import { streamToBuffer } from './streamToBuffer.js';

/**
 * Generate a music audio clip using the ElevenLabs Music API.
 *
 * Calls `client.music.compose()` with the music cue's prompt, duration,
 * and instrumental flag. Writes the resulting audio to `{outputDir}/{cue.id}.mp3`
 * and returns an AudioAsset descriptor.
 */
export async function generateMusic(
  client: ElevenLabsClient,
  cue: MusicCue,
  outputDir: string,
  cache?: AudioCache,
): Promise<AudioAsset> {
  const forceInstrumental = cue.isUnderscore ? true : undefined;

  let cacheKey = '';
  if (cache) {
    cacheKey = cache.computeCacheKey('music', {
      prompt: cue.prompt,
      musicLengthMs: cue.durationMs,
      forceInstrumental,
    });
    const cached = await cache.get(cacheKey);
    if (cached) {
      const durationMs = await probeDurationMs(cached);
      return {
        id: uuidv4(),
        sourceId: cue.id,
        type: 'music',
        filePath: cached,
        durationMs,
        format: 'mp3',
        cacheKey,
      };
    }
  }

  const audioStream = await withRetry(
    () => client.music.compose({
      prompt: cue.prompt,
      musicLengthMs: cue.durationMs,
      ...(cue.isUnderscore ? { forceInstrumental: true } : {}),
    }),
    { maxRetries: 3, baseDelayMs: 1000, timeoutMs: 120_000 },
  );

  const buffer = Buffer.from(await streamToBuffer(audioStream));

  let filePath: string;
  if (cache) {
    filePath = await cache.set(cacheKey, buffer, 'mp3');
  } else {
    filePath = path.join(outputDir, `${cue.id}.mp3`);
    await fs.promises.mkdir(outputDir, { recursive: true });
    await fs.promises.writeFile(filePath, buffer);
  }

  const durationMs = await probeDurationMs(filePath);

  return {
    id: uuidv4(),
    sourceId: cue.id,
    type: 'music',
    filePath,
    durationMs,
    format: 'mp3',
    cacheKey,
  };
}
