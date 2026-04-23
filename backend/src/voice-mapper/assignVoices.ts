import type { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import type { ElevenLabs } from '@elevenlabs/elevenlabs-js';
import type {
  CharacterMetadata,
  DramaStyle,
  VoiceAssignment,
  VoiceSettings,
} from '../types/index.js';

/**
 * Style-aware voice-settings baselines. These are starting points; per-character
 * tweaks in `deriveVoiceSettings` adjust each character's settings based on role,
 * age, and personality. Settings meanings:
 *   - stability: 0 (more expressive, variable) ↔ 1 (steadier, flatter)
 *   - similarityBoost: how closely to match the original voice timbre
 *   - style: 0 (minimal style) ↔ 1 (maximal stylistic exaggeration)
 *   - speed: 0.7–1.2, 1.0 = natural pace
 *
 * Tuning notes: baseline stability biased low (more expressive) because the
 * earlier flat-delivery pass landed squarely in the "uncanny audiobook"
 * range. Style biased up a touch so modulation deltas land on a livelier
 * floor. Expression deltas in expressionModulation.ts still clamp within
 * ElevenLabs' safe range (0–1).
 */
const VOICE_SETTINGS_PRESETS: Record<DramaStyle, VoiceSettings> = {
  anime: { stability: 0.25, similarityBoost: 0.8, style: 0.6, speed: 1.0, useSpeakerBoost: true },
  noir: { stability: 0.5, similarityBoost: 0.75, style: 0.4, speed: 0.95, useSpeakerBoost: true },
  horror: { stability: 0.35, similarityBoost: 0.8, style: 0.5, speed: 0.95, useSpeakerBoost: true },
  cyberpunk: { stability: 0.4, similarityBoost: 0.75, style: 0.5, speed: 1.0, useSpeakerBoost: true },
  'dark-thriller': { stability: 0.45, similarityBoost: 0.75, style: 0.45, speed: 1.0, useSpeakerBoost: true },
  'fantasy-epic': { stability: 0.45, similarityBoost: 0.8, style: 0.5, speed: 0.98, useSpeakerBoost: true },
  romance: { stability: 0.5, similarityBoost: 0.8, style: 0.45, speed: 0.98, useSpeakerBoost: true },
  comedy: { stability: 0.25, similarityBoost: 0.7, style: 0.6, speed: 1.05, useSpeakerBoost: true },
  documentary: { stability: 0.65, similarityBoost: 0.8, style: 0.25, speed: 1.0, useSpeakerBoost: true },
  cinematic: { stability: 0.4, similarityBoost: 0.78, style: 0.5, speed: 1.0, useSpeakerBoost: true },
};

/**
 * Per-trait keyword clusters. When a character's personality traits or physical
 * description matches any keyword in a cluster, the voice gets +5 score. The
 * clusters are broader than raw word-match so "brave" matches voices described
 * as "confident", "commanding", or "firm".
 */
const TRAIT_SYNONYMS: Record<string, string[]> = {
  brave: ['brave', 'confident', 'commanding', 'firm', 'bold', 'assertive', 'heroic'],
  cunning: ['cunning', 'sly', 'clever', 'calculating', 'smooth', 'crafty'],
  menacing: ['menacing', 'dark', 'villain', 'sinister', 'deep', 'gravelly', 'threatening'],
  warm: ['warm', 'kind', 'friendly', 'gentle', 'soft', 'caring', 'nurturing'],
  cold: ['cold', 'clinical', 'detached', 'emotionless', 'flat', 'stoic'],
  young: ['young', 'youthful', 'bright', 'energetic', 'teen', 'child'],
  old: ['old', 'aged', 'elderly', 'wise', 'weathered', 'mature', 'grandfatherly', 'grandmotherly'],
  raspy: ['raspy', 'gravelly', 'gruff', 'hoarse', 'rough'],
  smooth: ['smooth', 'silky', 'velvety', 'refined', 'polished'],
  authoritative: ['authoritative', 'commanding', 'powerful', 'booming', 'deep'],
  comedic: ['comedy', 'comedic', 'quirky', 'playful', 'animated', 'whimsical', 'silly'],
  intellectual: ['intellectual', 'thoughtful', 'professorial', 'measured', 'articulate'],
  nervous: ['nervous', 'anxious', 'shaky', 'tentative', 'hesitant'],
  seductive: ['seductive', 'sultry', 'breathy', 'intimate', 'sensual'],
};

const AGE_BUCKETS: { keywords: string[]; bucket: string }[] = [
  { keywords: ['child', 'kid', 'young child', 'infant'], bucket: 'child' },
  { keywords: ['teen', 'teenage', 'teenager', 'adolescent', 'youth'], bucket: 'young' },
  { keywords: ['young', 'young adult', '20s', 'early 20s', 'late teens'], bucket: 'young' },
  { keywords: ['adult', 'middle aged', '30s', '40s', 'middle-aged'], bucket: 'middle' },
  { keywords: ['old', 'elderly', 'aged', 'senior', '60s', '70s', '80s', 'elder'], bucket: 'old' },
];

function bucketAge(age: string | undefined): string | null {
  if (!age) return null;
  const lower = age.toLowerCase();
  for (const b of AGE_BUCKETS) {
    if (b.keywords.some((kw) => lower.includes(kw))) return b.bucket;
  }
  return null;
}

function norm(s: string | undefined): string {
  return (s ?? '').toLowerCase().trim();
}

/**
 * Signature used to measure how similar two voices sound on paper, so we can
 * penalize assigning near-identical voices to different characters in the
 * same drama. Two female adult voices with the same accent/descriptor bag
 * will score high against each other and trigger the diversity penalty in
 * `scoreVoice`.
 */
interface VoiceSignature {
  gender: string;
  age: string;
  accent: string;
  descriptors: Set<string>;
}

const DIVERSITY_DESCRIPTORS = [
  'deep', 'high', 'low', 'raspy', 'smooth', 'gruff', 'soft', 'booming',
  'warm', 'cold', 'bright', 'dark', 'nasal', 'breathy', 'rich', 'thin',
  'silky', 'gravelly', 'husky', 'clear',
];

function voiceSignature(voice: ElevenLabs.Voice): VoiceSignature {
  const labels = voice.labels ?? {};
  const allText = [norm(voice.description), norm(voice.name), ...Object.values(labels).map(norm)].join(' ');
  const descriptors = new Set<string>();
  for (const d of DIVERSITY_DESCRIPTORS) if (allText.includes(d)) descriptors.add(d);
  return {
    gender: norm(labels['gender']),
    age: norm(labels['age']),
    accent: norm(labels['accent']),
    descriptors,
  };
}

function similarityPenalty(voice: ElevenLabs.Voice, usedSignatures: VoiceSignature[]): number {
  if (usedSignatures.length === 0) return 0;
  const sig = voiceSignature(voice);
  let worst = 0;
  for (const used of usedSignatures) {
    let overlap = 0;
    if (sig.gender && used.gender && sig.gender === used.gender) overlap += 6;
    if (sig.age && used.age && sig.age === used.age) overlap += 5;
    if (sig.accent && used.accent && sig.accent === used.accent) overlap += 3;
    for (const d of sig.descriptors) if (used.descriptors.has(d)) overlap += 2;
    if (overlap > worst) worst = overlap;
  }
  return worst;
}

/**
 * Score how well a voice matches a character. Higher = better.
 *
 * Signals (in order of weight):
 *   1. Gender match (strongest — mismatched gender is almost always wrong)
 *   2. Age bucket match
 *   3. Personality traits via TRAIT_SYNONYMS clusters
 *   4. Physical description keywords in voice metadata
 *   5. Role-based accent/use_case preferences
 *   6. Diversity penalty: voices that closely resemble an already-assigned
 *      voice lose points, so two female leads don't sound interchangeable.
 */
function scoreVoice(
  voice: ElevenLabs.Voice,
  character: CharacterMetadata,
  usedSignatures: VoiceSignature[] = [],
): number {
  let score = 0;
  const labels = voice.labels ?? {};
  const description = norm(voice.description);
  const voiceName = norm(voice.name);
  const allVoiceText = [
    description,
    voiceName,
    ...Object.values(labels).map(norm),
  ].join(' ');

  // 1. Gender match
  const charGender = norm(character.gender);
  const voiceGender = norm(labels['gender']);
  if (charGender && voiceGender) {
    if (charGender === voiceGender) {
      score += 30;
    } else if (charGender.includes(voiceGender) || voiceGender.includes(charGender)) {
      score += 15;
    } else {
      score -= 25;
    }
  }

  // 2. Age bucket match
  const charBucket = bucketAge(character.age);
  const voiceBucket = bucketAge(norm(labels['age']));
  if (charBucket && voiceBucket) {
    score += charBucket === voiceBucket ? 20 : -8;
  }

  // 3. Personality traits via synonym clusters
  const traitText = character.personalityTraits.map(norm).join(' ');
  const physicalText = norm(character.physicalDescription);
  const characterText = `${traitText} ${physicalText}`;

  for (const [cluster, synonyms] of Object.entries(TRAIT_SYNONYMS)) {
    const characterMentionsCluster = synonyms.some((s) => characterText.includes(s));
    if (!characterMentionsCluster) continue;
    const voiceMentionsCluster = synonyms.some((s) => allVoiceText.includes(s));
    if (voiceMentionsCluster) score += 6;
    // soft penalty for traits that actively clash: warm-voiced for a menacing role
    if (cluster === 'menacing' && /\b(warm|gentle|kind)\b/.test(allVoiceText)) score -= 6;
    if (cluster === 'warm' && /\b(menacing|villain|sinister)\b/.test(allVoiceText)) score -= 6;
  }

  // 4. Physical description → voice description keyword overlap
  const physicalKeywords = ['deep', 'high-pitched', 'raspy', 'smooth', 'gruff', 'soft', 'booming'];
  for (const kw of physicalKeywords) {
    if (physicalText.includes(kw) && allVoiceText.includes(kw)) score += 4;
  }

  // 5. Role-specific accent / use_case preferences
  if (character.role === 'protagonist' || character.role === 'antagonist') {
    if (labels['use_case'] === 'characters' || labels['use_case'] === 'narrative_story') {
      score += 3;
    }
  }

  // 6. Diversity penalty — push apart voices that resemble already-assigned
  // ones so two female leads don't end up sounding like clones.
  score -= similarityPenalty(voice, usedSignatures);

  return score;
}

function scoreNarratorVoice(voice: ElevenLabs.Voice): number {
  let score = 0;
  const labels = voice.labels ?? {};
  const description = norm(voice.description);
  const voiceName = norm(voice.name);
  const allText = [description, voiceName, ...Object.values(labels).map(norm)].join(' ');

  const narratorKeywords = ['narrator', 'narration', 'storytell', 'audiobook', 'documentary', 'authoritative'];
  for (const kw of narratorKeywords) {
    if (allText.includes(kw)) score += 10;
  }

  if (norm(labels['use_case']) === 'narration' || norm(labels['use_case']) === 'narrative_story') {
    score += 15;
  }

  if (voice.settings?.stability != null && voice.settings.stability >= 0.6) {
    score += 5;
  }

  return score;
}

/**
 * Derive per-character voice settings from the style baseline.
 *
 * Tweaks applied:
 *   - Antagonists: lower stability (+0.05 more expression), higher style (+0.05)
 *   - Minor roles: higher stability (consistent, less attention-grabbing)
 *   - Old characters: slower speed (-0.05), higher stability (+0.1)
 *   - Young characters: slightly faster speed (+0.05)
 *   - Nervous/anxious trait: lower stability (more wavering)
 *   - Authoritative/commanding trait: higher stability (steadier)
 *
 * All values clamped to ElevenLabs' accepted ranges.
 */
function deriveVoiceSettings(
  baseline: VoiceSettings,
  character: CharacterMetadata,
): VoiceSettings {
  let { stability, similarityBoost, style, speed, useSpeakerBoost } = baseline;

  if (character.role === 'antagonist') {
    stability -= 0.05;
    style += 0.05;
  } else if (character.role === 'minor') {
    stability += 0.05;
  }

  const ageBucket = bucketAge(character.age);
  if (ageBucket === 'old') {
    speed -= 0.05;
    stability += 0.1;
  } else if (ageBucket === 'young' || ageBucket === 'child') {
    speed += 0.05;
    style += 0.05;
  }

  const traitText = character.personalityTraits.map(norm).join(' ');
  if (/\b(nervous|anxious|scared|timid)\b/.test(traitText)) stability -= 0.08;
  if (/\b(authoritative|commanding|stoic|calm)\b/.test(traitText)) stability += 0.08;
  if (/\b(comedic|playful|quirky|eccentric)\b/.test(traitText)) style += 0.1;
  if (/\b(menacing|sinister|cold|cruel)\b/.test(traitText)) {
    stability += 0.05;
    style += 0.05;
  }

  // Clamp
  stability = Math.max(0, Math.min(1, stability));
  similarityBoost = Math.max(0, Math.min(1, similarityBoost));
  style = Math.max(0, Math.min(1, style));
  speed = Math.max(0.7, Math.min(1.2, speed));

  return { stability, similarityBoost, style, speed, useSpeakerBoost };
}

/**
 * Assign distinct ElevenLabs voices to each character and a narrator.
 *
 * Deterministic: voices sorted by ID before scoring, ties broken lexicographically.
 * Each character gets settings derived from the style baseline + character-specific
 * tweaks, so two characters in the same style still sound individuated.
 */
export async function assignVoices(
  client: ElevenLabsClient,
  characters: CharacterMetadata[],
  style: DramaStyle,
): Promise<VoiceAssignment[]> {
  const response = await client.voices.getAll();
  const allVoices = [...response.voices].sort((a, b) =>
    a.voiceId.localeCompare(b.voiceId),
  );

  if (allVoices.length === 0) {
    throw new Error('No voices available from ElevenLabs');
  }

  const baseline = VOICE_SETTINGS_PRESETS[style];
  const usedVoiceIds = new Set<string>();
  const usedSignatures: VoiceSignature[] = [];
  const assignments: VoiceAssignment[] = [];

  // Assign protagonists/antagonists first so they get the best available voice.
  const rolePriority: Record<string, number> = {
    protagonist: 0,
    antagonist: 1,
    supporting: 2,
    minor: 3,
  };
  const sortedCharacters = [...characters].sort((a, b) => {
    const pa = rolePriority[a.role] ?? 99;
    const pb = rolePriority[b.role] ?? 99;
    if (pa !== pb) return pa - pb;
    return a.id.localeCompare(b.id);
  });

  for (const character of sortedCharacters) {
    const availableVoices = allVoices.filter((v) => !usedVoiceIds.has(v.voiceId));
    if (availableVoices.length === 0) {
      throw new Error(
        `Not enough distinct voices available. Need ${characters.length + 1} (characters + narrator), but only ${allVoices.length} available.`,
      );
    }

    const scored = availableVoices
      .map((voice) => ({ voice, score: scoreVoice(voice, character, usedSignatures) }))
      .sort((a, b) =>
        b.score !== a.score
          ? b.score - a.score
          : a.voice.voiceId.localeCompare(b.voice.voiceId),
      );

    const bestVoice = scored[0].voice;
    usedVoiceIds.add(bestVoice.voiceId);
    usedSignatures.push(voiceSignature(bestVoice));

    assignments.push({
      characterId: character.id,
      characterName: character.name,
      voiceId: bestVoice.voiceId,
      voiceSettings: deriveVoiceSettings(baseline, character),
      role: 'character',
    });
  }

  const narratorCandidates = allVoices.filter((v) => !usedVoiceIds.has(v.voiceId));
  if (narratorCandidates.length === 0) {
    throw new Error(
      `Not enough distinct voices for narrator. Need ${characters.length + 1} voices, but only ${allVoices.length} available.`,
    );
  }

  const narratorScored = narratorCandidates
    .map((voice) => ({ voice, score: scoreNarratorVoice(voice) }))
    .sort((a, b) =>
      b.score !== a.score
        ? b.score - a.score
        : a.voice.voiceId.localeCompare(b.voice.voiceId),
    );

  const narratorVoice = narratorScored[0].voice;

  // Narrators get the baseline with extra stability for measured delivery
  const narratorSettings: VoiceSettings = {
    ...baseline,
    stability: Math.min(1, baseline.stability + 0.15),
    style: Math.max(0, baseline.style - 0.1),
  };

  assignments.push({
    characterId: 'narrator',
    characterName: 'Narrator',
    voiceId: narratorVoice.voiceId,
    voiceSettings: narratorSettings,
    role: 'narrator',
  });

  // Restore original character order for the return value (so consumers that
  // index by position align with the metadata they passed in)
  const byId = new Map(assignments.map((a) => [a.characterId, a]));
  const ordered: VoiceAssignment[] = [];
  for (const c of characters) {
    const a = byId.get(c.id);
    if (a) ordered.push(a);
  }
  const narratorEntry = byId.get('narrator');
  if (narratorEntry) ordered.push(narratorEntry);
  return ordered;
}
