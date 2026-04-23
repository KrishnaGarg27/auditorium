/**
 * Test script: Manual Audio Mixing
 *
 * Runs just the FFmpeg mixing stage using a saved intermediate format
 * and audio manifest from a previous pipeline run. Use this when the
 * pipeline failed at the mixing stage and you want to retry without
 * re-running LLM or ElevenLabs.
 *
 * Usage:
 *   npx tsx scripts/test-mixing.ts <dramaId>
 *
 * Example:
 *   npx tsx scripts/test-mixing.ts abc123-def456-...
 *
 * This looks for:
 *   output/<dramaId>/intermediate.json
 *   output/<dramaId>/audio-manifest.json
 *
 * Output:
 *   output/<dramaId>/scenes/<sceneId>.mp3   (mixed scene files)
 *   output/<dramaId>/<episodeId>.mp3        (concatenated episode files)
 */

import 'dotenv/config';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';
import * as path from 'path';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

import type { IntermediateFormat, AudioManifest } from '../src/types/index.js';
import { mixScene } from '../src/audio-mixer/mixScene.js';
import { concatenateEpisode } from '../src/audio-mixer/concatenateEpisode.js';
import { buildSceneMixInputs } from '../src/audio-mixer/buildSceneMixInputs.js';

// Point fluent-ffmpeg at the bundled binary
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const dramaId = process.argv[2];

if (!dramaId) {
  console.error('❌ Usage: npx tsx scripts/test-mixing.ts <dramaId>');
  console.log('');
  console.log('  Available drama IDs:');
  const outDir = path.join(process.cwd(), 'output');
  if (fs.existsSync(outDir)) {
    const dirs = fs.readdirSync(outDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && fs.existsSync(path.join(outDir, d.name, 'intermediate.json')));
    for (const d of dirs) {
      console.log(`    ${d.name}`);
    }
    if (dirs.length === 0) {
      console.log('    (none found — run the full pipeline first)');
    }
  }
  process.exit(1);
}

const outDir = path.join(process.cwd(), 'output', dramaId);
const intermediatePath = path.join(outDir, 'intermediate.json');
const manifestPath = path.join(outDir, 'audio-manifest.json');

if (!fs.existsSync(intermediatePath)) {
  console.error(`❌ intermediate.json not found at ${intermediatePath}`);
  process.exit(1);
}
if (!fs.existsSync(manifestPath)) {
  console.error(`❌ audio-manifest.json not found at ${manifestPath}`);
  process.exit(1);
}

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Audio Drama Engine — Manual Mixing');
  console.log(`  Drama ID: ${dramaId}`);
  console.log('═══════════════════════════════════════════════\n');

  const format: IntermediateFormat = JSON.parse(fs.readFileSync(intermediatePath, 'utf-8'));
  const manifest: AudioManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  console.log(`✅ Loaded intermediate format: ${format.title} (${format.style})`);
  console.log(`✅ Loaded audio manifest: ${manifest.assets.length} assets\n`);

  const sceneMixInputs = buildSceneMixInputs(format, manifest);
  console.log(`━━━ Mixing ${sceneMixInputs.length} scenes ━━━`);

  const scenePaths = new Map<string, string>();

  for (let i = 0; i < sceneMixInputs.length; i++) {
    const input = sceneMixInputs[i];
    console.log(`  🎛️ Mixing scene ${i + 1}/${sceneMixInputs.length}: ${input.sceneId}`);
    console.log(`     Tracks: ${input.dialogueTracks.length} dialogue, ${input.sfxTracks.length} SFX, ${input.musicTracks.length} music`);

    const start = Date.now();
    const scenePath = await mixScene(input, outDir);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`     ✅ ${path.basename(scenePath)} (${elapsed}s)`);
    scenePaths.set(input.sceneId, scenePath);
  }

  console.log(`\n━━━ Concatenating episodes ━━━`);

  for (const episode of format.episodes) {
    const paths = episode.scenes
      .map(s => scenePaths.get(s.sceneId))
      .filter((p): p is string => p != null);

    if (paths.length === 0) {
      console.log(`  ⚠️ Episode ${episode.episodeNumber}: no scene audio found, skipping`);
      continue;
    }

    console.log(`  📼 Episode ${episode.episodeNumber}: "${episode.title}" (${paths.length} scenes)`);
    const start = Date.now();
    const epPath = await concatenateEpisode(paths, episode.id, outDir);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`     ✅ ${path.basename(epPath)} (${elapsed}s)`);
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log('  ✅ Mixing Complete');
  console.log(`  Output: ${outDir}/`);
  console.log('═══════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('\n❌ Mixing failed:', err.message ?? err);
  process.exit(1);
});
