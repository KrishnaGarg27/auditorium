import type {
  SceneDefinition,
  StoryMetadata,
  StylePreset,
  AnnotatedScene,
} from '../types/index.js';
import type { LLMClient } from '../ingestion/generateFromPrompt.js';
import { buildSceneAdaptationPrompt } from './buildPrompt.js';

/**
 * Adapt a single scene into an AnnotatedScene with dialogue, narration,
 * action cues, SFX cues, and music cues via a single LLM call.
 */
export async function adaptScene(
  sceneDefinition: SceneDefinition,
  sceneRawText: string,
  metadata: StoryMetadata,
  stylePreset: StylePreset,
  previousSceneOutput: AnnotatedScene | null,
  creativeMode: boolean,
  llmClient: LLMClient
): Promise<AnnotatedScene> {
  const { systemPrompt, userPrompt } = buildSceneAdaptationPrompt(
    sceneDefinition,
    sceneRawText,
    metadata,
    stylePreset,
    previousSceneOutput,
    creativeMode
  );

  const response = await llmClient.generateText(systemPrompt, userPrompt);
  const annotatedScene = JSON.parse(response) as AnnotatedScene;
  return annotatedScene;
}
