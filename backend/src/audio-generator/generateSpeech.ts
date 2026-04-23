import type { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import type {
  DialogueLine,
  NarrationLine,
  VoiceAssignment,
  VoiceSettings,
  AudioAsset,
} from '../types/index.js';
import { withRetry } from './retry.js';
import type { AudioCache } from './cache.js';
import { probeDurationMs } from './probe.js';
import { applyExpression } from './expressionModulation.js';
import { streamToBuffer } from './streamToBuffer.js';

/**
 * Shared cleanup for any text sent to TTS. eleven_flash_v2_5 reads stage
 * directions aloud verbatim, so "(gasping) Help!" becomes audibly "left
 * paren gasping right paren Help" instead of a gasp followed by "Help!".
 * Delivery directions must live in the `expression`/`parenthetical` fields,
 * which modulate voice settings rather than being spoken.
 *
 * Handles:
 *   - Parenthetical directions:  "(gasping) Help!"      -> "Help!"
 *   - Bracketed stage tags:      "[whispering] Get down."-> "Get down."
 *   - Asterisk actions:          "*sighs* I know."      -> "I know."
 *   - Underscore actions:        "_laughs_ Right."      -> "Right."
 *   - Stray "— beat —" markers between sentences
 *   - Curly quotes / ellipsis characters -> ASCII equivalents
 */
export function sanitizeTtsText(raw: string): string {
  let text = raw;

  text = text
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/…/g, '...')
    .replace(/[–—]/g, '—');

  text = text.replace(/\([^()]{0,80}?\)/g, ' ');
  text = text.replace(/\[[^\[\]]{0,80}?\]/g, ' ');
  text = text.replace(/\*[^*\n]{1,80}?\*/g, ' ');
  text = text.replace(/(?<=\s|^)_[^_\n]{1,80}?_(?=\s|$|[.,!?;:])/g, ' ');

  text = text.replace(/(?:^|(?<=[.!?]))\s*[—-]\s*beat\s*[—-]?\s*/gi, ' ');
  text = text.replace(/\s*\*+\s*/g, ' ');
  text = text.replace(/\.{4,}/g, '...');
  text = text.replace(/\s+/g, ' ').trim();
  text = text.replace(/^[\s,;:—-]+/, '').replace(/[\s—]+$/, '').trim();

  return text;
}

/**
 * Dialogue-specific cleanup: on top of the shared sanitization, strip
 * narrator attribution tags that the LLM sometimes embeds inside quoted
 * speech ('"I can\'t," she said.' -> '"I can\'t,"'). Narration doesn't get
 * this pass — the narrator may legitimately speak those words.
 */
export function sanitizeDialogueText(raw: string): string {
  let text = sanitizeTtsText(raw);
  text = text.replace(
    /,?\s+(?:he|she|they|it|[A-Z][a-zA-Z'\-]+)\s+(said|asked|replied|whispered|shouted|cried|answered|muttered|murmured|exclaimed|gasped|continued|added|called|snapped|sighed|laughed|growled|hissed|yelled|roared)\b[^.!?]*?(?=[.!?]|$)/g,
    '',
  );
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

/**
 * Build the actual text sent to TTS. We strip stage-direction leakage from
 * `text` (belt-and-braces defense; the scene-adapter prompt forbids them too)
 * and DO NOT prepend the parenthetical — eleven_flash_v2_5 reads parentheses
 * literally. The delivery hint is instead consumed by `applyExpression` to
 * modulate voice settings.
 */
function renderTtsText(text: string, _parenthetical: string | undefined): string {
  const cleaned = sanitizeDialogueText(text);
  return cleaned || text.trim();
}

/**
 * Shared TTS generation logic for both dialogue and narration lines.
 * Expression/tone modulates the voice settings per line so delivery varies
 * with the emotional direction supplied by the scene adapter.
 */
async function generateTTS(
  client: ElevenLabsClient,
  sourceId: string,
  text: string,
  voice: VoiceAssignment,
  settings: VoiceSettings,
  outputDir: string,
  cache?: AudioCache,
): Promise<AudioAsset> {
  const voiceSettings = {
    stability: settings.stability,
    similarityBoost: settings.similarityBoost,
    style: settings.style,
    speed: settings.speed,
    useSpeakerBoost: settings.useSpeakerBoost,
  };

  let cacheKey = '';
  if (cache) {
    cacheKey = cache.computeCacheKey('tts', {
      voiceId: voice.voiceId,
      text,
      modelId: 'eleven_flash_v2_5',
      voiceSettings,
    });
    const cached = await cache.get(cacheKey);
    if (cached) {
      const durationMs = await probeDurationMs(cached);
      return {
        id: uuidv4(),
        sourceId,
        type: 'speech',
        filePath: cached,
        durationMs,
        format: 'mp3',
        cacheKey,
      };
    }
  }

  const audioStream = await withRetry(
    () => client.textToSpeech.convert(voice.voiceId, {
      text,
      modelId: 'eleven_flash_v2_5',
      voiceSettings,
    }),
    { maxRetries: 3, baseDelayMs: 1000, timeoutMs: 60_000 },
  );

  const buffer = Buffer.from(await streamToBuffer(audioStream));

  let filePath: string;
  if (cache) {
    filePath = await cache.set(cacheKey, buffer, 'mp3');
  } else {
    filePath = path.join(outputDir, `${sourceId}.mp3`);
    await fs.promises.mkdir(outputDir, { recursive: true });
    await fs.promises.writeFile(filePath, buffer);
  }

  const durationMs = await probeDurationMs(filePath);

  return {
    id: uuidv4(),
    sourceId,
    type: 'speech',
    filePath,
    durationMs,
    format: 'mp3',
    cacheKey,
  };
}

/**
 * Generate TTS audio for a dialogue line using ElevenLabs.
 *
 * Per-line modulation: the line's `expression` field (e.g. "whispered, afraid")
 * is applied to the voice's baseline settings, and any `parenthetical`
 * (e.g. "(sighing)") is prepended to the spoken text.
 */
export async function generateSpeech(
  client: ElevenLabsClient,
  line: DialogueLine,
  voice: VoiceAssignment,
  outputDir: string,
  cache?: AudioCache,
): Promise<AudioAsset> {
  // Fold the parenthetical into the expression so it still influences voice
  // settings, now that we no longer speak it aloud.
  const parenthetical = line.parenthetical?.trim().replace(/^[()\s]+|[()\s]+$/g, '');
  const expression = parenthetical
    ? `${line.expression}, ${parenthetical}`
    : line.expression;
  const modulatedSettings = applyExpression(voice.voiceSettings, expression);
  const text = renderTtsText(line.text, line.parenthetical);
  return generateTTS(client, line.id, text, voice, modulatedSettings, outputDir, cache);
}

/**
 * Generate TTS audio for a narration line using ElevenLabs.
 * The `tone` field modulates settings the same way dialogue `expression` does.
 */
export async function generateNarration(
  client: ElevenLabsClient,
  line: NarrationLine,
  voice: VoiceAssignment,
  outputDir: string,
  cache?: AudioCache,
): Promise<AudioAsset> {
  const modulatedSettings = applyExpression(voice.voiceSettings, line.tone);
  const text = sanitizeTtsText(line.text) || line.text.trim();
  return generateTTS(client, line.id, text, voice, modulatedSettings, outputDir, cache);
}
