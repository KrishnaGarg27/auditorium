import type { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import type { SFXCue, AudioAsset } from '../types/index.js';
import { withRetry } from './retry.js';
import type { AudioCache } from './cache.js';
import { probeDurationMs } from './probe.js';
import { streamToBuffer } from './streamToBuffer.js';

/**
 * Default duration in seconds for momentary SFX when no durationMs is specified.
 */
const DEFAULT_DURATION_SECONDS = 3;

/**
 * Default prompt influence for sound effect generation.
 */
const DEFAULT_PROMPT_INFLUENCE = 0.7;

/**
 * Generate a sound effect audio clip using the ElevenLabs Sound Effects API.
 *
 * Calls `client.textToSoundEffects.convert()` with the SFX cue description as the prompt,
 * writes the resulting audio to `{outputDir}/{cue.id}.mp3`, and returns
 * an AudioAsset descriptor.
 */
export async function generateSFX(
  client: ElevenLabsClient,
  cue: SFXCue,
  outputDir: string,
  cache?: AudioCache,
): Promise<AudioAsset> {
  const durationSeconds = cue.durationMs
    ? cue.durationMs / 1000
    : DEFAULT_DURATION_SECONDS;

  let cacheKey = '';
  if (cache) {
    cacheKey = cache.computeCacheKey('sfx', {
      text: cue.description,
      durationSeconds,
      promptInfluence: DEFAULT_PROMPT_INFLUENCE,
    });
    const cached = await cache.get(cacheKey);
    if (cached) {
      const durationMs = await probeDurationMs(cached);
      return {
        id: uuidv4(),
        sourceId: cue.id,
        type: 'sfx',
        filePath: cached,
        durationMs,
        format: 'mp3',
        cacheKey,
      };
    }
  }

  const audioStream = await withRetry(
    () => client.textToSoundEffects.convert({
      text: cue.description,
      durationSeconds,
      promptInfluence: DEFAULT_PROMPT_INFLUENCE,
    }),
    { maxRetries: 3, baseDelayMs: 1000, timeoutMs: 60_000 },
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
    type: 'sfx',
    filePath,
    durationMs,
    format: 'mp3',
    cacheKey,
  };
}
