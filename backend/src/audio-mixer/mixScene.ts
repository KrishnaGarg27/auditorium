import ffmpeg from 'fluent-ffmpeg';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type { SceneMixInput, TimedAudioTrack } from '../types/audio.js';
import type { MusicTransition } from '../types/core.js';

const OUTPUT_DIR = path.join(process.cwd(), 'output', 'scenes');

const TARGET_SAMPLE_RATE = 44100;
const TARGET_CHANNEL_LAYOUT = 'stereo';
const NORMALIZE_INPUT_FILTER = `aformat=sample_rates=${TARGET_SAMPLE_RATE}:channel_layouts=${TARGET_CHANNEL_LAYOUT}`;

/**
 * Trailing silence after the last element so scene-to-scene transitions
 * breathe. Without this, episodes feel like a continuous TTS stream where
 * one scene's last word bleeds straight into the next scene's first.
 */
const SCENE_TAIL_PAD_MS = 1200;

/**
 * Build the FFmpeg audio filter string for a given MusicTransition type.
 *
 * - fade-in  → afade=t=in
 * - fade-out → afade=t=out
 * - crossfade → acrossfade
 * - hard-cut → no filter (empty string)
 */
export function buildTransitionFilter(
  transition: MusicTransition,
  durationMs: number,
): string {
  const durationSec = durationMs / 1000;
  const fadeDuration = Math.min(durationSec * 0.1, 2); // 10% of duration, max 2s

  switch (transition) {
    case 'fade-in':
      return `afade=t=in:st=0:d=${fadeDuration}`;
    case 'fade-out':
      return `afade=t=out:st=${Math.max(0, durationSec - fadeDuration)}:d=${fadeDuration}`;
    case 'crossfade':
      return `acrossfade=d=${fadeDuration}`;
    case 'hard-cut':
      return '';
  }
}

/**
 * Sidechain compression settings — music and ambient SFX are compressed
 * whenever dialogue is present on the sidechain bus. Threshold/ratio chosen
 * so music drops ~9–12 dB during speech, then rebounds smoothly.
 *
 * threshold=0.04 linear (~ -28 dBFS) triggers reliably on quiet dialogue
 * too. attack=8ms avoids chopping consonants; release ~320ms keeps the
 * duck held through short inter-word gaps so music doesn't flutter up
 * between syllables.
 */
const DUCK_MUSIC = 'sidechaincompress=threshold=0.04:ratio=10:attack=8:release=320:makeup=1';
const DUCK_AMBIENT = 'sidechaincompress=threshold=0.04:ratio=8:attack=10:release=300:makeup=1';

/**
 * Presence-range EQ cut applied to music and ambient beds. Human dialogue
 * fundamentals plus first formants live in ~250–2kHz; carving a gentle
 * scoop there on the beds opens up a spectral pocket for speech without
 * making the music sound thin. Combined with sidechain ducking, this is
 * the classic broadcast "de-mask" technique.
 */
const BED_DUCK_EQ = 'equalizer=f=500:width_type=h:width=900:g=-3';

/**
 * Final safety limiter — catches any peaks that slip above 0 dBFS after the
 * per-N amix compensation. Without this, simultaneous dialogue + unducked
 * momentary SFX could clip at the MP3 encoder.
 */
const FINAL_LIMITER = 'alimiter=limit=0.97:attack=5:release=50';

/**
 * Build the complete FFmpeg filter_complex string for mixing a scene.
 *
 * Volume levels (defaults in buildSceneMixInputs):
 *   - Dialogue: 1.0 (reference level)
 *   - SFX: 0.5 momentary / 0.18 ambient (ambient is EQ-dipped + ducked)
 *   - Music: 0.15 underscore / 0.28 featured (EQ-dipped + ducked)
 *
 * Clarity chain for voice intelligibility:
 *   1. BED_DUCK_EQ carves a -3 dB scoop around 500 Hz on music and ambient
 *      so those layers don't mask the vowel-formant range of speech.
 *   2. Sidechain compression drops beds ~9–12 dB the moment dialogue fires
 *      and releases slowly so the duck holds between syllables.
 *   3. alimiter catches residual peaks (dialogue + undipped momentary SFX).
 */
export function buildFilterGraph(input: SceneMixInput): {
  filterComplex: string;
  inputArgs: string[];
  streamCount: number;
} {
  const inputArgs: string[] = [];
  const filters: string[] = [];
  let streamIndex = 0;

  // Labels feed either the sidechain bus, the ducking path, or the final mix.
  // Dialogue streams feed BOTH the bus and the mix (via asplit).
  const dialogueLabels: string[] = [];
  const momentarySfxLabels: string[] = [];
  const ambientSfxLabels: string[] = [];
  const musicLabels: string[] = [];

  const lastElementEndMs = Math.max(
    0,
    ...input.dialogueTracks.map((t) => t.startTimeMs + t.durationMs),
    ...input.sfxTracks.map((t) => t.startTimeMs + t.durationMs),
    ...input.musicTracks.map((t) => t.startTimeMs + t.durationMs),
  );
  const sceneDurationMs = lastElementEndMs + SCENE_TAIL_PAD_MS;
  // The 2018 bundled FFmpeg only exposes `whole_len` (samples), not `whole_dur`.
  const sceneSamples = Math.round((sceneDurationMs * TARGET_SAMPLE_RATE) / 1000);
  const padFilter = `apad=whole_len=${sceneSamples}`;

  // --- Dialogue tracks ---
  for (const track of input.dialogueTracks) {
    if (!fs.existsSync(track.assetPath)) {
      console.warn(`[AudioMixer] Missing dialogue asset: ${track.assetPath}, skipping`);
      continue;
    }
    inputArgs.push('-i', track.assetPath);
    const label = `dlg${streamIndex}`;
    const vol = 1.0;
    const delayMs = track.startTimeMs;
    const parts = [NORMALIZE_INPUT_FILTER, `volume=${vol}`];
    if (delayMs > 0) parts.push(`adelay=${delayMs}|${delayMs}`);
    parts.push(padFilter);
    filters.push(`[${streamIndex}:a]${parts.join(',')}[${label}]`);
    dialogueLabels.push(label);
    streamIndex++;
  }

  // --- SFX tracks ---
  for (const track of input.sfxTracks) {
    if (!fs.existsSync(track.assetPath)) {
      console.warn(`[AudioMixer] Missing SFX asset: ${track.assetPath}, skipping`);
      continue;
    }

    if (track.loop) {
      inputArgs.push('-stream_loop', '-1', '-i', track.assetPath);
    } else {
      inputArgs.push('-i', track.assetPath);
    }

    const label = `sfx${streamIndex}`;
    const vol = Math.min(track.volume, 0.99);
    const delayMs = track.startTimeMs;
    const parts = [NORMALIZE_INPUT_FILTER, `volume=${vol}`];

    // atrim must precede adelay: trimming a looped stream caps its content length,
    // then adelay adds the silence prefix. Running adelay first would push silence
    // into the trimmed window and cut real audio short.
    if (track.loop && track.durationMs > 0) {
      const trimEnd = track.durationMs / 1000;
      parts.push(`atrim=0:${trimEnd}`, 'asetpts=PTS-STARTPTS');
    }
    // Ambient beds get the presence-range EQ cut so they don't mask dialogue
    // fundamentals. Momentary SFX (door slams, impacts) bypass the EQ so
    // they keep their full spectral punch when they fire between lines.
    if (track.loop) {
      parts.push(BED_DUCK_EQ);
      // Smooth fade-in (2s) and fade-out (3s) so ambient beds blend naturally
      // into the scene instead of abruptly starting/stopping
      parts.push('afade=t=in:st=0:d=2');
      if (track.durationMs > 3000) {
        const fadeOutStart = Math.max(0, (track.durationMs / 1000) - 3);
        parts.push(`afade=t=out:st=${fadeOutStart}:d=3`);
      }
    }
    if (delayMs > 0) parts.push(`adelay=${delayMs}|${delayMs}`);
    parts.push(padFilter);

    filters.push(`[${streamIndex}:a]${parts.join(',')}[${label}]`);
    if (track.loop) {
      ambientSfxLabels.push(label);
    } else {
      momentarySfxLabels.push(label);
    }
    streamIndex++;
  }

  // --- Music tracks ---
  for (const track of input.musicTracks) {
    if (!fs.existsSync(track.assetPath)) {
      console.warn(`[AudioMixer] Missing music asset: ${track.assetPath}, skipping`);
      continue;
    }
    inputArgs.push('-i', track.assetPath);
    const label = `mus${streamIndex}`;
    const vol = Math.min(track.volume, 0.99);
    const delayMs = track.startTimeMs;
    const parts = [NORMALIZE_INPUT_FILTER, `volume=${vol}`, BED_DUCK_EQ];

    // afade before adelay: fade timing parameters (st=, d=) reference the stream's
    // own timeline. If we delay first, the fade lands on the silence prefix instead
    // of the actual music.
    if (track.transition) {
      const transFilter = buildTransitionFilter(track.transition, track.durationMs);
      if (transFilter && !transFilter.startsWith('acrossfade')) {
        parts.push(transFilter);
      }
    }
    if (delayMs > 0) parts.push(`adelay=${delayMs}|${delayMs}`);
    parts.push(padFilter);

    filters.push(`[${streamIndex}:a]${parts.join(',')}[${label}]`);
    musicLabels.push(label);
    streamIndex++;
  }

  // Build the list of labels that feed the final amix.
  const finalMixLabels: string[] = [...dialogueLabels, ...momentarySfxLabels];
  const duckingTargets = [...ambientSfxLabels, ...musicLabels];
  const canDuck = dialogueLabels.length > 0 && duckingTargets.length > 0;

  if (canDuck) {
    // Each dialogue stream is asplit into two copies: one feeds the final mix,
    // one feeds the sidechain bus. Without asplit, FFmpeg refuses to use the
    // same labelled pad twice.
    const busInputs: string[] = [];
    const mainDialogueLabels: string[] = [];
    for (const dl of dialogueLabels) {
      const mainLbl = `${dl}m`;
      const scLbl = `${dl}s`;
      filters.push(`[${dl}]asplit=2[${mainLbl}][${scLbl}]`);
      mainDialogueLabels.push(mainLbl);
      busInputs.push(`[${scLbl}]`);
    }

    // Sum dialogue copies into one sidechain bus. amix divides by N, so we
    // restore the original per-track level with a post-amix pan multiplier —
    // that way the sidechain threshold means the same thing regardless of how
    // many dialogue tracks the scene has.
    let busLabel: string;
    if (busInputs.length === 1) {
      busLabel = busInputs[0].slice(1, -1); // strip brackets
    } else {
      const n = busInputs.length;
      filters.push(
        `${busInputs.join('')}amix=inputs=${n}:duration=longest:dropout_transition=0[dlgBusPre]`,
      );
      filters.push(`[dlgBusPre]pan=stereo|c0=${n}*c0|c1=${n}*c1[dlgBus]`);
      busLabel = 'dlgBus';
    }

    // asplit the bus into K copies (one per ducking target).
    const k = duckingTargets.length;
    const scCopyLabels: string[] = [];
    for (let i = 0; i < k; i++) scCopyLabels.push(`sb${i}`);
    if (k === 1) {
      filters.push(`[${busLabel}]acopy[${scCopyLabels[0]}]`);
    } else {
      const outs = scCopyLabels.map((l) => `[${l}]`).join('');
      filters.push(`[${busLabel}]asplit=${k}${outs}`);
    }

    // Apply sidechaincompress per ducking target. Ambient gets a gentler
    // ratio/release so background beds don't pump, music gets harder ducking
    // so it stays clearly behind dialogue.
    for (let i = 0; i < duckingTargets.length; i++) {
      const target = duckingTargets[i];
      const sc = scCopyLabels[i];
      const isAmbient = i < ambientSfxLabels.length;
      const duckFilter = isAmbient ? DUCK_AMBIENT : DUCK_MUSIC;
      const ducked = `${target}d`;
      filters.push(`[${target}][${sc}]${duckFilter}[${ducked}]`);
      finalMixLabels.push(ducked);
    }

    // Replace dialogue labels in the final mix with the "main" asplit copies.
    finalMixLabels.splice(0, dialogueLabels.length, ...mainDialogueLabels);
  } else {
    // No ducking needed — everything goes to the final mix raw.
    finalMixLabels.push(...duckingTargets);
  }

  // amix divides the sum by inputs count (1/N normalization). The bundled 2018
  // FFmpeg build has no `normalize=0` option, so we compensate with a post-amix
  // pan that multiplies both channels by N — restoring per-track volumes to
  // their intended absolute levels. All streams are apad-equalized above so N
  // stays constant for the full scene and the boost is exact. An alimiter
  // catches any residual peaks (e.g. dialogue + undipped momentary SFX).
  if (finalMixLabels.length > 1) {
    const n = finalMixLabels.length;
    const mixIns = finalMixLabels.map((l) => `[${l}]`).join('');
    filters.push(
      `${mixIns}amix=inputs=${n}:duration=longest:dropout_transition=0[mixed]`,
    );
    filters.push(`[mixed]pan=stereo|c0=${n}*c0|c1=${n}*c1[boosted]`);
    filters.push(`[boosted]${FINAL_LIMITER}[out]`);
  } else if (finalMixLabels.length === 1) {
    filters.push(`[${finalMixLabels[0]}]${FINAL_LIMITER}[out]`);
  }

  return {
    filterComplex: filters.join(';'),
    inputArgs,
    streamCount: streamIndex,
  };
}

/**
 * Mix all audio layers for a single scene into a single MP3 file.
 *
 * Output: MP3 44.1kHz 192kbps (from design spec).
 *
 * Handles missing/failed assets gracefully with console.warn.
 * Returns the path to the mixed output file.
 */
export async function mixScene(
  input: SceneMixInput,
  outputDir?: string,
): Promise<string> {
  const outDir = outputDir ?? OUTPUT_DIR;
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outputPath = path.join(outDir, `${input.sceneId}.mp3`);

  const allTracks = [
    ...input.dialogueTracks,
    ...input.sfxTracks,
    ...input.musicTracks,
  ];

  // Filter to only tracks with existing assets
  const validTracks = allTracks.filter((t) => {
    if (!fs.existsSync(t.assetPath)) {
      console.warn(`[AudioMixer] Missing asset: ${t.assetPath}, skipping`);
      return false;
    }
    return true;
  });

  if (validTracks.length === 0) {
    console.warn(`[AudioMixer] No valid audio tracks for scene ${input.sceneId}, producing silence`);
    // Produce a short silent file
    return new Promise<string>((resolve, reject) => {
      ffmpeg()
        .input('anullsrc=r=44100:cl=stereo')
        .inputFormat('lavfi')
        .duration(1)
        .audioCodec('libmp3lame')
        .audioBitrate('192k')
        .audioFrequency(44100)
        .audioChannels(2)
        .output(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', (err: Error) => {
          console.warn(`[AudioMixer] FFmpeg error for scene ${input.sceneId}:`, err.message);
          reject(err);
        })
        .run();
    });
  }

  const { filterComplex, inputArgs, streamCount } = buildFilterGraph(input);

  if (streamCount === 0) {
    console.warn(`[AudioMixer] No streams after filtering for scene ${input.sceneId}`);
    return outputPath;
  }

  return new Promise<string>((resolve, reject) => {
    const cmd = ffmpeg();

    // Add input arguments (pairs of flag + value)
    for (let i = 0; i < inputArgs.length; i++) {
      const arg = inputArgs[i];
      if (arg === '-i') {
        cmd.input(inputArgs[i + 1]);
        i++; // skip the path
      } else if (arg === '-stream_loop') {
        // inputArgs layout: '-stream_loop', '-1', '-i', '<filepath>'
        const filePath = inputArgs[i + 3];
        cmd.input(filePath);
        cmd.inputOptions(['-stream_loop', inputArgs[i + 1]]);
        i += 3; // skip -1, -i, and the filepath
      }
    }

    cmd
      .complexFilter(filterComplex, 'out')
      .audioCodec('libmp3lame')
      .audioBitrate('192k')
      .audioFrequency(44100)
      .audioChannels(2)
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err: Error) => {
        console.warn(`[AudioMixer] FFmpeg error for scene ${input.sceneId}:`, err.message);
        reject(err);
      })
      .run();
  });
}
