import type { StoryInput, StoryMetadata, SceneDecomposition } from '../types/index.js';
import type { LLMClient } from '../ingestion/generateFromPrompt.js';

/**
 * Round 2: Decompose a story into discrete scenes using an LLM.
 * Each scene includes setting, participating characters, mood, summary, and original text range.
 */
export async function decomposeScenes(
  story: StoryInput,
  metadata: StoryMetadata,
  llmClient: LLMClient
): Promise<SceneDecomposition> {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(story, metadata);

  const response = await llmClient.generateText(systemPrompt, userPrompt);
  const decomposition = JSON.parse(response) as SceneDecomposition;
  return decomposition;
}

function buildSystemPrompt(): string {
  return [
    'You are a story structure analyst. Break the provided story into discrete scenes.',
    'Each scene should represent a distinct unit of action in a single location/time.',
    'Respond with ONLY valid JSON matching the SceneDecomposition schema.',
    'Schema: { scenes: [{ id: string, sequenceNumber: number, title: string,',
    '  settingId: string, participatingCharacterIds: string[], mood: string,',
    '  summary: string, originalTextRange: { startParagraph: number, endParagraph: number } }] }',
    'Assign sequential sequenceNumber values starting from 1.',
    'Use character IDs and setting IDs from the provided metadata.',
  ].join('\n');
}

function buildUserPrompt(story: StoryInput, metadata: StoryMetadata): string {
  return [
    'Story metadata (characters, settings, themes):',
    JSON.stringify(metadata, null, 2),
    '',
    'Story text:',
    story.text,
  ].join('\n');
}
