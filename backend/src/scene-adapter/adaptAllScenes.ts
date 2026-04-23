import type {
  SceneDecomposition,
  StoryMetadata,
  DramaStyle,
  AnnotatedScript,
  AnnotatedScene,
} from '../types/index.js';
import { STYLE_PRESETS } from '../types/index.js';
import type { LLMClient } from '../ingestion/generateFromPrompt.js';
import { adaptScene } from './adaptScene.js';

/**
 * Extract raw text for a scene from the full story text using originalTextRange.
 * Splits the story into paragraphs and returns the paragraphs in the specified range.
 */
function extractSceneText(
  storyText: string,
  startParagraph: number,
  endParagraph: number
): string {
  const paragraphs = storyText.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const start = Math.max(0, startParagraph);
  const end = Math.min(paragraphs.length, endParagraph);
  return paragraphs.slice(start, end).join('\n\n');
}

/**
 * Round 3: Adapt all scenes one by one with context passing.
 *
 * Iterates over scenes from SceneDecomposition, calling adaptScene for each.
 * Each call receives the previous scene's AnnotatedScene output (or null for the first scene).
 * Concatenates all AnnotatedScene results into a single AnnotatedScript.
 */
export async function adaptAllScenes(
  scenes: SceneDecomposition,
  storyText: string,
  metadata: StoryMetadata,
  style: DramaStyle,
  creativeMode: boolean,
  llmClient: LLMClient,
  onProgress?: (detail: string) => void
): Promise<AnnotatedScript> {
  const stylePreset = STYLE_PRESETS[style];
  const annotatedScenes: AnnotatedScene[] = [];
  let previousSceneOutput: AnnotatedScene | null = null;
  const totalScenes = scenes.scenes.length;

  for (let i = 0; i < totalScenes; i++) {
    const sceneDefinition = scenes.scenes[i];
    onProgress?.(`Adapting scene ${i + 1} of ${totalScenes}`);

    const sceneRawText = extractSceneText(
      storyText,
      sceneDefinition.originalTextRange.startParagraph,
      sceneDefinition.originalTextRange.endParagraph
    );

    const annotatedScene = await adaptScene(
      sceneDefinition,
      sceneRawText,
      metadata,
      stylePreset,
      previousSceneOutput,
      creativeMode,
      llmClient
    );

    annotatedScenes.push(annotatedScene);
    previousSceneOutput = annotatedScene;
  }

  return { scenes: annotatedScenes };
}
