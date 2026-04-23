/**
 * Test script: ElevenLabs Music Generation
 *
 * Tests music generation in isolation with sample cues.
 * Can also load music cues from the LLM pipeline output.
 *
 * Usage:
 *   npx tsx scripts/test-elevenlabs-music.ts
 *   npx tsx scripts/test-elevenlabs-music.ts --from-script   # use cues from Round 3 output
 *
 * Environment:
 *   ELEVENLABS_API_KEY — required
 */

import 'dotenv/config';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { generateMusic } from '../src/audio-generator/generateMusic.js';
import type { MusicCue, AnnotatedScript } from '../src/types/index.js';
import * as fs from 'fs';
import * as path from 'path';

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error('❌ ELEVENLABS_API_KEY is not set. Export it or add it to backend/.env');
  process.exit(1);
}

const client = new ElevenLabsClient({ apiKey });
const outDir = path.join(process.cwd(), 'output', 'music-test');
const useFromScript = process.argv.includes('--from-script');

const SAMPLE_CUES: MusicCue[] = [
  {
    id: 'mus-test-1',
    mood: 'tense',
    intensity: 0.7,
    durationMs: 15000,
    prompt: 'Dark suspenseful orchestral music with pulsing bass and dissonant strings',
    transition: { in: 'fade-in', out: 'fade-out' },
    isUnderscore: true,
    volume: 0.3,
    styleHints: ['orchestral', 'suspense'],
  },
  {
    id: 'mus-test-2',
    mood: 'triumphant',
    intensity: 0.9,
    durationMs: 20000,
    prompt: 'Epic orchestral fanfare with heroic brass and soaring strings',
    transition: { in: 'hard-cut', out: 'fade-out' },
    isUnderscore: false,
    volume: 0.5,
    styleHints: ['orchestral', 'epic'],
  },
  {
    id: 'mus-test-3',
    mood: 'melancholic',
    intensity: 0.4,
    durationMs: 12000,
    prompt: 'Soft piano melody with gentle strings, melancholic and reflective',
    transition: { in: 'fade-in', out: 'fade-out' },
    isUnderscore: true,
    volume: 0.25,
    styleHints: ['piano', 'strings'],
  },
];

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Audio Drama Engine — ElevenLabs Music Test');
  console.log('═══════════════════════════════════════════════\n');

  let cues: MusicCue[];

  if (useFromScript) {
    const scriptPath = path.join(process.cwd(), 'output', 'llm-test', 'round3-script.json');
    if (!fs.existsSync(scriptPath)) {
      console.error('❌ Script not found at output/llm-test/round3-script.json');
      console.log('  Run test-llm-pipeline.ts first, or omit --from-script to use sample cues.');
      process.exit(1);
    }
    const script: AnnotatedScript = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));
    cues = [];
    for (const scene of script.scenes) {
      cues.push(...scene.musicCues.slice(0, 2)); // take up to 2 per scene
    }
    if (cues.length === 0) {
      console.error('❌ No music cues found in the script output.');
      process.exit(1);
    }
    console.log(`✅ Loaded ${cues.length} music cues from script output\n`);
  } else {
    cues = SAMPLE_CUES;
    console.log(`Using ${cues.length} sample music cues\n`);
  }

  fs.mkdirSync(outDir, { recursive: true });

  for (const cue of cues) {
    console.log(`  🎵 "${cue.prompt.substring(0, 60)}..."`);
    console.log(`     Mood: ${cue.mood}, Intensity: ${cue.intensity}, Duration: ${cue.durationMs}ms`);
    console.log(`     Underscore: ${cue.isUnderscore}, Volume: ${cue.volume}`);

    const start = Date.now();
    const asset = await generateMusic(client, cue, outDir);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`     ✅ Saved: ${path.basename(asset.filePath)} (${elapsed}s)\n`);
  }

  console.log('═══════════════════════════════════════════════');
  console.log('  ✅ Music Test Complete');
  console.log(`  Audio files saved to: ${outDir}/`);
  console.log('');
  console.log('  Listen and evaluate:');
  console.log('  - Does the mood match the prompt?');
  console.log('  - Is underscore music subtle enough?');
  console.log('  - Adjust music prompts in the Scene Adapter');
  console.log('    (src/scene-adapter/buildPrompt.ts) if needed.');
  console.log('═══════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('\n❌ Music test failed:', err.message ?? err);
  process.exit(1);
});
