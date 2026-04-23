import type {
  AudioAsset,
  AudioManifest,
  IntermediateFormat,
  ScriptElement,
  SceneMixInput,
  TimedAudioTrack,
} from '../types/index.js';

/**
 * Pacing constants — silent gaps inserted between script elements so the
 * output sounds like a human-paced audio drama rather than a back-to-back
 * TTS dump. Tuned so same-speaker continuations feel tight (breath), speaker
 * changes land with a response beat, and narration↔dialogue shifts give the
 * listener a moment to reorient.
 */
export const GAP_SAME_SPEAKER_MS = 250;
export const GAP_DIFFERENT_SPEAKER_MS = 600;
export const GAP_DIALOGUE_NARRATION_MS = 800;
export const GAP_NARRATION_NARRATION_MS = 500;
export const GAP_AROUND_ACTION_MS = 500;
export const ACTION_BEAT_MS = 700;

/** Fallback when an asset is missing — keeps downstream timing sane. */
const MISSING_ASSET_FALLBACK_MS = 3000;

/** Context-aware silent gap between two adjacent script elements. */
export function gapBetween(prev: ScriptElement, next: ScriptElement): number {
  if (prev.type === 'action' || next.type === 'action') {
    return GAP_AROUND_ACTION_MS;
  }
  if (prev.type === 'dialogue' && next.type === 'dialogue') {
    return prev.characterId === next.characterId
      ? GAP_SAME_SPEAKER_MS
      : GAP_DIFFERENT_SPEAKER_MS;
  }
  if (
    (prev.type === 'dialogue' && next.type === 'narration') ||
    (prev.type === 'narration' && next.type === 'dialogue')
  ) {
    return GAP_DIALOGUE_NARRATION_MS;
  }
  return GAP_NARRATION_NARRATION_MS;
}

export interface ElementTiming {
  id: string;
  startMs: number;
  endMs: number;
}

/**
 * Walk the scene's element list once, computing start/end times for every
 * element (including silent action beats). Action cues produce no audio but
 * consume time so SFX anchored via `triggerAfterElementId` fire at the right
 * moment.
 */
export function computeElementTimings(
  elements: ScriptElement[],
  assetMap: Map<string, AudioAsset>,
): ElementTiming[] {
  const timings: ElementTiming[] = [];
  let cursorMs = 0;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (i > 0) cursorMs += gapBetween(elements[i - 1], el);
    let durationMs: number;
    if (el.type === 'action') {
      durationMs = ACTION_BEAT_MS;
    } else {
      const asset = assetMap.get(el.id);
      durationMs = asset?.durationMs ?? MISSING_ASSET_FALLBACK_MS;
    }
    timings.push({ id: el.id, startMs: cursorMs, endMs: cursorMs + durationMs });
    cursorMs += durationMs;
  }
  return timings;
}

/**
 * Build SceneMixInput objects from AudioManifest and IntermediateFormat.
 *
 * Applies context-aware pacing between elements and anchors each SFX cue to
 * its `triggerAfterElementId` (so "after the door slams" fires after the
 * door-slam action, not at a raw offset from scene start).
 */
export function buildSceneMixInputs(
  format: IntermediateFormat,
  manifest: AudioManifest,
): SceneMixInput[] {
  const assetMap = new Map<string, AudioAsset>();
  for (const asset of manifest.assets) {
    assetMap.set(asset.sourceId, asset);
  }

  const mixInputs: SceneMixInput[] = [];

  for (const episode of format.episodes) {
    for (const scene of episode.scenes) {
      const dialogueTracks: TimedAudioTrack[] = [];
      const sfxTracks: TimedAudioTrack[] = [];
      const musicTracks: TimedAudioTrack[] = [];

      const timings = computeElementTimings(scene.elements, assetMap);
      const timingById = new Map(timings.map((t) => [t.id, t]));

      for (const element of scene.elements) {
        if (element.type !== 'dialogue' && element.type !== 'narration') continue;
        const asset = assetMap.get(element.id);
        const timing = timingById.get(element.id);
        if (!asset || !timing) continue;
        dialogueTracks.push({
          assetPath: asset.filePath,
          startTimeMs: timing.startMs,
          durationMs: asset.durationMs,
          volume: 1.0,
        });
      }

      // Compute total scene duration for ambient SFX coverage
      const sceneDurationMs = timings.length > 0
        ? timings[timings.length - 1].endMs + 1200 // include trailing pad
        : 30000;

      for (const cue of scene.sfxCues) {
        const asset = assetMap.get(cue.id);
        if (!asset) continue;
        const anchor = timingById.get(cue.triggerAfterElementId);
        const isAmbient = cue.durationType === 'ambient';

        // Ambient SFX start at the beginning of the scene (or their anchor)
        // and run for the full scene duration so they feel continuous
        let startTimeMs: number;
        let durationMs: number;

        if (isAmbient) {
          // Ambient beds start at scene beginning (or anchor if specified)
          startTimeMs = anchor ? anchor.startMs : 0;
          // Cover the rest of the scene from the start point
          durationMs = Math.max(sceneDurationMs - startTimeMs, asset.durationMs);
        } else {
          // Momentary SFX fire after their anchor element
          startTimeMs = anchor
            ? anchor.endMs + (cue.triggerOffsetMs ?? 0)
            : (cue.triggerOffsetMs ?? 0);
          durationMs = asset.durationMs;
        }

        // Ambient beds sit under dialogue for the full scene, so they need a
        // much lower baseline than momentary hits. Caps prevent a single cue
        // with a high `volume` from drowning speech before ducking kicks in.
        const baseVolume = cue.volume ?? (isAmbient ? 0.18 : 0.5);
        const cap = isAmbient ? 0.22 : 0.55;
        sfxTracks.push({
          assetPath: asset.filePath,
          startTimeMs,
          durationMs,
          volume: Math.min(baseVolume, cap),
          loop: isAmbient,
          // Ambient SFX get fade-in/fade-out for smooth blending
          transition: isAmbient ? ('fade-in' as const) : undefined,
        });
      }

      for (const cue of scene.musicCues) {
        const asset = assetMap.get(cue.id);
        if (!asset) continue;
        musicTracks.push({
          assetPath: asset.filePath,
          startTimeMs: 0,
          durationMs: asset.durationMs,
          // Reduced from 0.3/0.5 — the mixer ducks music under dialogue and
          // applies a presence-range EQ cut, so the baseline can be low
          // without losing presence in quiet moments, and peaks stay clear
          // of speech.
          volume: cue.isUnderscore ? 0.15 : 0.28,
          transition: cue.transition?.in,
        });
      }

      mixInputs.push({
        sceneId: scene.sceneId,
        dialogueTracks,
        sfxTracks,
        musicTracks,
      });
    }
  }

  return mixInputs;
}
