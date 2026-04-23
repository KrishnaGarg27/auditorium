/**
 * Test script: ElevenLabs TTS Voice Generation
 *
 * Tests voice assignment and TTS generation in isolation.
 * Requires Round 1 metadata output from test-llm-pipeline.ts.
 *
 * Usage:
 *   npx tsx scripts/test-elevenlabs-tts.ts [style]
 *
 * Prerequisites:
 *   Run test-llm-pipeline.ts first to generate output/llm-test/round1-metadata.json
 *
 * Environment:
 *   ELEVENLABS_API_KEY — required
 */

import 'dotenv/config';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { assignVoices } from '../src/voice-mapper/assignVoices.js';
import { generateSpeech, generateNarration } from '../src/audio-generator/generateSpeech.js';
import type { DramaStyle } from '../src/types/index.js';
import * as fs from 'fs';
import * as path from 'path';

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error('❌ ELEVENLABS_API_KEY is not set. Export it or add it to backend/.env');
  process.exit(1);
}

const client = new ElevenLabsClient({ apiKey });
const style = (process.argv[2] ?? 'cinematic') as DramaStyle;
const outDir = path.join(process.cwd(), 'output', 'tts-test');

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Audio Drama Engine — ElevenLabs TTS Test');
  console.log(`  Style: ${style}`);
  console.log('═══════════════════════════════════════════════\n');

  // Load metadata from LLM pipeline test
  const metadataPath = path.join(process.cwd(), 'output', 'llm-test', 'round1-metadata.json');
  if (!fs.existsSync(metadataPath)) {
    console.error('❌ Metadata not found at output/llm-test/round1-metadata.json');
    console.log('  Run test-llm-pipeline.ts first to generate it.');
    process.exit(1);
  }

  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
  console.log(`✅ Loaded metadata: ${metadata.characters.length} characters\n`);

  // Assign voices
  console.log('━━━ Voice Assignment ━━━');
  const voices = await assignVoices(client, metadata.characters, style);
  console.log(`✅ Assigned ${voices.length} voices:`);
  for (const v of voices) {
    console.log(`   ${v.characterName} (${v.role}) → voice ${v.voiceId}`);
    console.log(`     Settings: stability=${v.voiceSettings.stability}, similarity=${v.voiceSettings.similarityBoost}, style=${v.voiceSettings.style}`);
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'voice-assignments.json'), JSON.stringify(voices, null, 2));

  // Generate sample dialogue for each character
  console.log('\n━━━ TTS Generation ━━━');

  const sampleTexts = [
    'I never thought it would end like this. But here we are.',
    'You always say that. But this time, everything is different.',
    'Listen carefully. What I am about to tell you changes everything.',
    'The silence was deafening. Nobody dared to speak first.',
    'We have to move. Now. Before they realize what happened.',
  ];

  const characterVoices = voices.filter(v => v.role === 'character');
  for (let i = 0; i < characterVoices.length; i++) {
    const voice = characterVoices[i];
    const text = sampleTexts[i % sampleTexts.length];
    const line = {
      type: 'dialogue' as const,
      id: `test-dlg-${i}`,
      characterId: voice.characterId,
      text,
      expression: 'dramatic, intense',
    };

    console.log(`\n  🎤 ${voice.characterName}: "${text.substring(0, 50)}..."`);
    const start = Date.now();
    const asset = await generateSpeech(client, line, voice, outDir);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`     ✅ Saved: ${path.basename(asset.filePath)} (${elapsed}s)`);
  }

  // Generate narrator sample
  const narratorVoice = voices.find(v => v.role === 'narrator');
  if (narratorVoice) {
    const narrationLine = {
      type: 'narration' as const,
      id: 'test-narr-1',
      text: 'The city never sleeps. And tonight, neither would its secrets.',
      tone: 'ominous',
    };

    console.log(`\n  🎙️ Narrator: "${narrationLine.text}"`);
    const start = Date.now();
    const asset = await generateNarration(client, narrationLine, narratorVoice, outDir);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`     ✅ Saved: ${path.basename(asset.filePath)} (${elapsed}s)`);
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log('  ✅ TTS Test Complete');
  console.log(`  Audio files saved to: ${outDir}/`);
  console.log('');
  console.log('  Listen to the files and evaluate:');
  console.log('  - Do voices match character descriptions?');
  console.log('  - Is the emotional delivery appropriate?');
  console.log('  - Adjust VOICE_SETTINGS_PRESETS in');
  console.log('    src/voice-mapper/assignVoices.ts if needed.');
  console.log('═══════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('\n❌ TTS test failed:', err.message ?? err);
  process.exit(1);
});
