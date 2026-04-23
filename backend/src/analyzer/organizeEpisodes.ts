import { v4 as uuidv4 } from 'uuid';
import type { SceneDefinition, StoryMetadata, EpisodeDefinition } from '../types/index.js';
import type { LLMClient } from '../ingestion/generateFromPrompt.js';

/**
 * Organize scenes into episodes based on narrative arc boundaries and pacing.
 * Short stories produce a single episode. No mid-scene splits.
 * For multi-episode dramas, generates a recap narration for episodes 2+.
 */
export async function organizeEpisodes(
  scenes: SceneDefinition[],
  metadata: StoryMetadata,
  llmClient: LLMClient
): Promise<EpisodeDefinition[]> {
  if (scenes.length === 0) {
    return [];
  }

  // Sort scenes by sequenceNumber to ensure correct ordering
  const sorted = [...scenes].sort((a, b) => a.sequenceNumber - b.sequenceNumber);

  // Short stories (≤5 scenes) → single episode
  if (sorted.length <= 5) {
    return [
      buildEpisode(1, sorted, metadata),
    ];
  }

  // Longer stories: split at narrative arc boundaries
  const episodes: EpisodeDefinition[] = [];
  const groups = splitByNarrativeArc(sorted);

  for (let i = 0; i < groups.length; i++) {
    episodes.push(buildEpisode(i + 1, groups[i], metadata));
  }

  // Generate recap narration for episodes 2+
  for (let i = 1; i < episodes.length; i++) {
    const prevEpisode = episodes[i - 1];
    episodes[i].recapNarration = await generateRecapNarration(prevEpisode, metadata, llmClient);
  }

  return episodes;
}

function buildEpisode(
  episodeNumber: number,
  scenes: SceneDefinition[],
  metadata: StoryMetadata
): EpisodeDefinition {
  const title = episodeNumber === 1 && scenes.length <= 5
    ? metadata.title
    : `Episode ${episodeNumber}: ${scenes[0].title}`;

  const synopsis = scenes.map((s) => s.summary).join(' ');

  return {
    id: uuidv4(),
    episodeNumber,
    title,
    synopsis,
    sceneIds: scenes.map((s) => s.id),
    scenes: [], // AnnotatedScene[] filled in later by the pipeline
  };
}

/**
 * Generate a "Previously on..." recap narration for an episode by summarizing
 * the previous episode's events via LLM.
 */
async function generateRecapNarration(
  prevEpisode: EpisodeDefinition,
  metadata: StoryMetadata,
  llmClient: LLMClient
): Promise<string> {
  const systemPrompt = 'You are a narrator for an audio drama series. Generate a brief "Previously on..." recap narration of 1-2 sentences summarizing the key events of the previous episode. Output only the recap text, no quotes or additional formatting.';

  const userPrompt = `Previous episode title: ${prevEpisode.title}\nPrevious episode synopsis: ${prevEpisode.synopsis}\nDrama title: ${metadata.title}`;

  return llmClient.generateText(systemPrompt, userPrompt);
}

/**
 * Split scenes into groups based on approximate narrative arc boundaries.
 * Uses a simple heuristic: split roughly into 3-7 scene groups,
 * trying to keep groups contiguous and balanced.
 */
function splitByNarrativeArc(sorted: SceneDefinition[]): SceneDefinition[][] {
  const targetGroupSize = Math.max(3, Math.min(7, Math.ceil(sorted.length / 3)));
  const groups: SceneDefinition[][] = [];
  let current: SceneDefinition[] = [];

  for (const scene of sorted) {
    current.push(scene);
    if (current.length >= targetGroupSize) {
      groups.push(current);
      current = [];
    }
  }

  // Remaining scenes go into the last group
  if (current.length > 0) {
    if (groups.length > 0 && current.length < 2) {
      // Merge very small remainder into last group to avoid tiny episodes
      groups[groups.length - 1].push(...current);
    } else {
      groups.push(current);
    }
  }

  return groups;
}
