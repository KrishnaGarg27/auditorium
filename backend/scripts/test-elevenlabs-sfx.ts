/**
 * Test script: ElevenLabs Sound Effects Generation
 *
 * Tests SFX generation in isolation with sample cues.
 * Can also load SFX cues from the LLM pipeline output.
 *
 * Usage:
 *   npx tsx scripts/test-elevenlabs-sfx.ts
 *   npx tsx scripts/test-elevenlabs-sfx.ts --from-script   # use cues from Round 3 output
 *
 * Environment:
 *   ELEVENLABS_API_KEY — required
 */

import 'dotenv/config';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { generateSFX } from '../src/audio-generator/generateSFX.js';
import type { SFXCue, AnnotatedScript } from '../src/types/index.js';
import * as fs from 'fs';
import * as path from 'path';

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error('❌ ELEVENLABS_API_KEY is not set. Export it or add it to backend/.env');
  process.exit(1);
}

const client = new ElevenLabsClient({ apiKey });
const outDir = path.join(process.cwd(), 'output', 'sfx-test');
const useFromScript = process.argv.includes('--from-script');

const SAMPLE_CUES: SFXCue[] = [
  {
    id: 'sfx-test-1',
    description: 'Heavy rain on a tin roof with occasional thunder',
    durationType: 'ambient',
    durationMs: 5000,
    triggerAfterElementId: '',
    triggerOffsetMs: 0,
    volume: 0.5,
    source: 'inferred',
  },
  {
    id: 'sfx-test-2',
    description: 'Glass shattering on a hard floor',
    durationType: 'momentary',
    triggerAfterElementId: 'dlg-1',
    triggerOffsetMs: 200,
    volume: 0.7,
    source: 'explicit',
  },
  {
    id: 'sfx-test-3',
    description: 'Distant thunder rumbling ominously',
    durationType: 'ambient',
    durationMs: 8000,
    triggerAfterElementId: '',
    triggerOffsetMs: 0,
    volume: 0.4,
    source: 'emotional-ambience',
  },
  {
    id: 'sfx-test-4',
    description: 'Footsteps on wet pavement, slow and deliberate',
    durationType: 'ambient',
    durationMs: 4000,
    triggerAfterElementId: '',
    triggerOffsetMs: 0,
    volume: 0.5,
    source: 'inferred',
  },
  {
    id: 'sfx-test-5',
    description: 'A heavy wooden door creaking open slowly',
    durationType: 'momentary',
    triggerAfterElementId: 'act-1',
    triggerOffsetMs: 0,
    volume: 0.6,
    source: 'explicit',
  },
];

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Audio Drama Engine — ElevenLabs SFX Test');
  console.log('═══════════════════════════════════════════════\n');

  let cues: SFXCue[];

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
      cues.push(...scene.sfxCues.slice(0, 3)); // take up to 3 per scene to limit API calls
    }
    if (cues.length === 0) {
      console.error('❌ No SFX cues found in the script output.');
      process.exit(1);
    }
    console.log(`✅ Loaded ${cues.length} SFX cues from script output\n`);
  } else {
    cues = SAMPLE_CUES;
    console.log(`Using ${cues.length} sample SFX cues\n`);
  }

  fs.mkdirSync(outDir, { recursive: true });

  for (const cue of cues) {
    console.log(`  🔊 "${cue.description}"`);
    console.log(`     Type: ${cue.durationType}, Duration: ${cue.durationMs ?? 'default'}ms, Source: ${cue.source}`);

    const start = Date.now();
    const asset = await generateSFX(client, cue, outDir);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`     ✅ Saved: ${path.basename(asset.filePath)} (${elapsed}s)\n`);
  }

  console.log('═══════════════════════════════════════════════');
  console.log('  ✅ SFX Test Complete');
  console.log(`  Audio files saved to: ${outDir}/`);
  console.log('');
  console.log('  Listen and evaluate:');
  console.log('  - Do sounds match their descriptions?');
  console.log('  - Are ambient sounds suitable for looping?');
  console.log('  - Adjust SFX prompts in the Scene Adapter');
  console.log('    (src/scene-adapter/buildPrompt.ts) if needed.');
  console.log('═══════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('\n❌ SFX test failed:', err.message ?? err);
  process.exit(1);
});
