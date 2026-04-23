/**
 * Test script: LLM Pipeline (Rounds 1–4)
 *
 * Tests the full LLM analysis pipeline without any ElevenLabs or FFmpeg calls.
 * Use this to evaluate script quality and compare LLM models before spending
 * on audio generation.
 *
 * Usage:
 *   npx tsx scripts/test-llm-pipeline.ts [path-to-story.txt] [style]
 *
 * Examples:
 *   npx tsx scripts/test-llm-pipeline.ts test-story.txt noir
 *   npx tsx scripts/test-llm-pipeline.ts test-story.txt          # auto-infer style
 *
 * Environment:
 *   OPENAI_API_KEY   — required
 *   OPENAI_MODEL     — optional, defaults to gpt-4o
 */

import 'dotenv/config';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { ingestFile } from '../src/ingestion/ingestFile.js';
import { extractMetadata } from '../src/analyzer/extractMetadata.js';
import { decomposeScenes } from '../src/analyzer/decomposeScenes.js';
import { adaptAllScenes } from '../src/scene-adapter/adaptAllScenes.js';
import { verifyCoherence } from '../src/analyzer/verifyCoherence.js';
import { inferStyle } from '../src/analyzer/inferStyle.js';
import { organizeEpisodes } from '../src/analyzer/organizeEpisodes.js';
import type { LLMClient } from '../src/ingestion/generateFromPrompt.js';
import type { DramaStyle } from '../src/types/index.js';

const VALID_STYLES: DramaStyle[] = [
  'anime', 'noir', 'dark-thriller', 'horror', 'cyberpunk',
  'fantasy-epic', 'romance', 'comedy', 'documentary', 'cinematic',
];

// --- Setup ---

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('❌ OPENAI_API_KEY is not set. Export it or add it to backend/.env');
  process.exit(1);
}

const model = process.env.OPENAI_MODEL ?? 'gpt-4o';
const openai = new OpenAI({ apiKey });

let callCount = 0;
const llmClient: LLMClient = {
  async generateText(systemPrompt: string, userPrompt: string): Promise<string> {
    callCount++;
    const callNum = callCount;
    console.log(`\n  📡 LLM call #${callNum} (model: ${model})`);
    console.log(`     System prompt: ${systemPrompt.length} chars`);
    console.log(`     User prompt: ${userPrompt.length} chars`);

    const start = Date.now();
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
    });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const text = response.choices[0]?.message?.content ?? '';
    const usage = response.usage;

    console.log(`     Response: ${text.length} chars in ${elapsed}s`);
    if (usage) {
      console.log(`     Tokens: ${usage.prompt_tokens} prompt + ${usage.completion_tokens} completion = ${usage.total_tokens} total`);
    }
    return text;
  },
};

// --- Parse args ---

const storyPath = process.argv[2] ?? 'test-story.txt';
const requestedStyle = process.argv[3] as DramaStyle | undefined;

if (requestedStyle && !VALID_STYLES.includes(requestedStyle)) {
  console.error(`❌ Invalid style "${requestedStyle}". Valid styles: ${VALID_STYLES.join(', ')}`);
  process.exit(1);
}

// --- Helpers ---

function saveJSON(filename: string, data: unknown): void {
  const outDir = path.join(process.cwd(), 'output', 'llm-test');
  fs.mkdirSync(outDir, { recursive: true });
  const filePath = path.join(outDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`  💾 Saved: ${filePath}`);
}

// --- Main ---

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Audio Drama Engine — LLM Pipeline Test');
  console.log(`  Model: ${model}`);
  console.log('═══════════════════════════════════════════════\n');

  // 1. Ingest story
  if (!fs.existsSync(storyPath)) {
    console.error(`❌ Story file not found: ${storyPath}`);
    console.log('  Create a test-story.txt file or pass a path as the first argument.');
    process.exit(1);
  }

  const storyBuffer = fs.readFileSync(storyPath);
  const storyInput = await ingestFile(storyBuffer, path.basename(storyPath));
  console.log(`✅ Story ingested (${storyInput.text.length} chars)`);
  console.log(`   Preview: "${storyInput.text.substring(0, 120).replace(/\n/g, ' ')}..."\n`);

  // 2. Style inference or use provided
  let style: DramaStyle;
  if (requestedStyle) {
    style = requestedStyle;
    console.log(`✅ Using requested style: ${style}\n`);
  } else {
    console.log('🔍 Inferring style from story content...');
    style = await inferStyle(storyInput, llmClient);
    console.log(`✅ Inferred style: ${style}\n`);
  }

  // 3. Round 1: Metadata extraction
  console.log('━━━ Round 1: Metadata Extraction ━━━');
  const metadata = await extractMetadata(storyInput, style, llmClient);
  console.log(`✅ Metadata extracted`);
  console.log(`   Title: ${metadata.title}`);
  console.log(`   Genre: ${metadata.genre}`);
  console.log(`   Themes: ${metadata.themes.join(', ')}`);
  console.log(`   Characters (${metadata.characters.length}):`);
  for (const c of metadata.characters) {
    console.log(`     - ${c.name} (${c.role}) — ${c.personalityTraits.slice(0, 3).join(', ')}`);
  }
  console.log(`   Settings (${metadata.settings.length}):`);
  for (const s of metadata.settings) {
    console.log(`     - ${s.name} — ${s.mood}`);
  }
  saveJSON('round1-metadata.json', metadata);

  // 4. Round 2: Scene decomposition
  console.log('\n━━━ Round 2: Scene Decomposition ━━━');
  const scenes = await decomposeScenes(storyInput, metadata, llmClient);
  console.log(`✅ Decomposed into ${scenes.scenes.length} scenes`);
  for (const s of scenes.scenes) {
    console.log(`   Scene ${s.sequenceNumber}: "${s.title}" [${s.mood}] — ${s.participatingCharacterIds.length} characters`);
  }
  saveJSON('round2-scenes.json', scenes);

  // 5. Round 3: Combined scene adaptation
  console.log('\n━━━ Round 3: Scene-by-Scene Adaptation ━━━');
  const annotatedScript = await adaptAllScenes(
    scenes,
    storyInput.text,
    metadata,
    style,
    false, // creativeMode off for baseline test
    llmClient,
    (detail) => console.log(`   ⏳ ${detail}`),
  );
  console.log(`✅ All ${annotatedScript.scenes.length} scenes adapted`);

  let totalDialogue = 0;
  let totalNarration = 0;
  let totalAction = 0;
  let totalSFX = 0;
  let totalMusic = 0;

  for (const scene of annotatedScript.scenes) {
    const dialogue = scene.elements.filter(e => e.type === 'dialogue').length;
    const narration = scene.elements.filter(e => e.type === 'narration').length;
    const action = scene.elements.filter(e => e.type === 'action').length;
    totalDialogue += dialogue;
    totalNarration += narration;
    totalAction += action;
    totalSFX += scene.sfxCues.length;
    totalMusic += scene.musicCues.length;
    console.log(`   Scene ${scene.sceneId}: ${dialogue} dialogue, ${narration} narration, ${action} action, ${scene.sfxCues.length} SFX, ${scene.musicCues.length} music`);
  }
  console.log(`\n   Totals: ${totalDialogue} dialogue, ${totalNarration} narration, ${totalAction} action, ${totalSFX} SFX, ${totalMusic} music`);
  console.log(`   Dialogue-dominant: ${totalDialogue > totalNarration ? '✅ YES' : '❌ NO (narration exceeds dialogue)'}`);

  // Check expression tags
  let missingExpressions = 0;
  for (const scene of annotatedScript.scenes) {
    for (const el of scene.elements) {
      if (el.type === 'dialogue' && (!el.expression || el.expression.trim() === '')) {
        missingExpressions++;
      }
    }
  }
  console.log(`   Expression tags: ${missingExpressions === 0 ? '✅ all present' : `❌ ${missingExpressions} missing`}`);

  saveJSON('round3-script.json', annotatedScript);

  // 6. Round 4: Coherence verification
  console.log('\n━━━ Round 4: Coherence Verification ━━━');
  const verified = await verifyCoherence(storyInput, metadata, annotatedScript, false, llmClient);
  console.log(`✅ Coherence: ${verified.verified ? 'PASSED' : 'ISSUES FOUND'}`);
  if (verified.issues.length > 0) {
    for (const issue of verified.issues) {
      const icon = issue.severity === 'high' ? '🔴' : issue.severity === 'medium' ? '🟡' : '🟢';
      console.log(`   ${icon} [${issue.severity}] ${issue.type}: ${issue.description}`);
    }
  } else {
    console.log('   No issues detected.');
  }
  saveJSON('round4-verified.json', verified);

  // 7. Episode organization
  console.log('\n━━━ Episode Organization ━━━');
  const episodes = await organizeEpisodes(scenes.scenes, metadata, llmClient);
  console.log(`✅ Organized into ${episodes.length} episode(s)`);
  for (const ep of episodes) {
    console.log(`   Episode ${ep.episodeNumber}: "${ep.title}" — ${ep.scenes.length} scenes`);
    if (ep.recapNarration) {
      console.log(`     Recap: "${ep.recapNarration}"`);
    }
  }
  saveJSON('episodes.json', episodes);

  // Summary
  console.log('\n═══════════════════════════════════════════════');
  console.log('  ✅ LLM Pipeline Test Complete');
  console.log(`  Total LLM calls: ${callCount}`);
  console.log(`  Output saved to: output/llm-test/`);
  console.log('');
  console.log('  Inspect the JSON files to evaluate quality.');
  console.log('  To test with Creative Mode, edit this script');
  console.log('  and set creativeMode to true in Round 3.');
  console.log('═══════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('\n❌ Pipeline failed:', err.message ?? err);
  process.exit(1);
});
