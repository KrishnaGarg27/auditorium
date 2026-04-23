import type { VoiceSettings } from '../types/index.js';

/**
 * Turn a DialogueLine.expression or NarrationLine.tone string into a small
 * delta applied to the voice's baseline VoiceSettings. This is what makes
 * "whispered, afraid" actually sound quieter and steadier than "shouted,
 * furious" even when both lines go through the same voice.
 *
 * ElevenLabs' eleven_flash_v2_5 model doesn't accept inline emotion tags the
 * way v3 does, so voice settings are the only lever we have here.
 *
 * All deltas are additive; values are clamped to ElevenLabs-accepted ranges.
 */
interface ExpressionDelta {
  stability: number;
  style: number;
  speed: number;
}

/**
 * Keyword → delta. Keywords are checked as substrings (case-insensitive) in
 * the expression/tone string, so `"whispered, afraid"` matches both "whisper"
 * and "afraid". Multiple matches stack (capped by final clamp).
 */
const EXPRESSION_DELTAS: { keywords: string[]; delta: ExpressionDelta }[] = [
  // Quiet / intimate — steadier, slower, less stylized
  {
    keywords: ['whisper', 'quiet', 'hushed', 'murmur', 'muttered', 'under his breath', 'under her breath'],
    delta: { stability: 0.2, style: -0.15, speed: -0.08 },
  },
  // Loud / aggressive — more expressive, faster
  {
    keywords: ['shout', 'yell', 'scream', 'furious', 'angry', 'rage', 'roaring', 'bellow'],
    delta: { stability: -0.22, style: 0.22, speed: 0.05 },
  },
  // Panicked / urgent — faster, less stable
  {
    keywords: ['panic', 'urgent', 'frantic', 'desperate', 'alarmed', 'breathless', 'gasping', 'gasp'],
    delta: { stability: -0.18, style: 0.12, speed: 0.08 },
  },
  // Sad / defeated — slower, steadier, duller
  {
    keywords: ['sad', 'sorrow', 'grief', 'defeated', 'weary', 'tired', 'resigned', 'melancholy', 'mournful'],
    delta: { stability: 0.12, style: -0.08, speed: -0.1 },
  },
  // Menacing / cold — steady, slow, deliberate
  {
    keywords: ['menacing', 'sinister', 'cold', 'cruel', 'threatening', 'deadly', 'predatory'],
    delta: { stability: 0.1, style: 0.08, speed: -0.07 },
  },
  // Sarcastic / wry — more style, slight speed bump
  {
    keywords: ['sarcastic', 'wry', 'amused', 'smirk', 'playful', 'teasing', 'mocking'],
    delta: { stability: -0.1, style: 0.15, speed: 0.03 },
  },
  // Excited / joyful — faster, more stylized
  {
    keywords: ['excited', 'enthusiastic', 'joyful', 'elated', 'thrilled', 'ecstatic', 'laughing'],
    delta: { stability: -0.15, style: 0.18, speed: 0.07 },
  },
  // Afraid / anxious — less stable, slightly faster
  {
    keywords: ['afraid', 'scared', 'terrified', 'nervous', 'anxious', 'trembling', 'shaking'],
    delta: { stability: -0.18, style: 0.08, speed: 0.05 },
  },
  // Confident / commanding — steadier, more authoritative
  {
    keywords: ['confident', 'commanding', 'firm', 'assertive', 'resolute', 'determined', 'authoritative'],
    delta: { stability: 0.1, style: 0.05, speed: -0.03 },
  },
  // Flat / deadpan — very steady, minimal style
  {
    keywords: ['flat', 'deadpan', 'monotone', 'emotionless', 'detached', 'robotic'],
    delta: { stability: 0.2, style: -0.2, speed: 0 },
  },
  // Intimate / seductive — slower, breathier
  {
    keywords: ['intimate', 'seductive', 'sultry', 'tender', 'loving', 'soft'],
    delta: { stability: 0.12, style: 0.12, speed: -0.1 },
  },
  // Ominous / foreboding narration — very steady, slower
  {
    keywords: ['ominous', 'foreboding', 'grave', 'solemn', 'dread'],
    delta: { stability: 0.12, style: -0.05, speed: -0.07 },
  },
  // Contemplative / thoughtful — steadier, slower
  {
    keywords: ['contemplative', 'thoughtful', 'pondering', 'reflective', 'pensive', 'musing'],
    delta: { stability: 0.1, style: -0.03, speed: -0.06 },
  },
  // Sighing / exasperated — slower, more style
  {
    keywords: ['sigh', 'exasperated', 'resigned', 'frustrated'],
    delta: { stability: -0.05, style: 0.08, speed: -0.05 },
  },
];

/**
 * Apply an expression/tone string to a baseline VoiceSettings. Returns a new
 * settings object with deltas from every matched keyword cluster summed in
 * and then clamped.
 */
export function applyExpression(
  baseline: VoiceSettings,
  expression: string | undefined,
): VoiceSettings {
  if (!expression) return baseline;
  const expr = expression.toLowerCase();

  let stability = baseline.stability;
  let style = baseline.style;
  let speed = baseline.speed;

  for (const { keywords, delta } of EXPRESSION_DELTAS) {
    if (keywords.some((kw) => expr.includes(kw))) {
      stability += delta.stability;
      style += delta.style;
      speed += delta.speed;
    }
  }

  return {
    stability: Math.max(0, Math.min(1, stability)),
    similarityBoost: baseline.similarityBoost,
    style: Math.max(0, Math.min(1, style)),
    speed: Math.max(0.7, Math.min(1.2, speed)),
    useSpeakerBoost: baseline.useSpeakerBoost,
  };
}
