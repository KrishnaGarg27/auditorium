import type { StoryInput, StoryMetadata, DramaStyle } from '../types/index.js';
import type { LLMClient } from '../ingestion/generateFromPrompt.js';

const STYLE_TONAL_HINTS: Record<DramaStyle, string> = {
  anime: 'Focus on expressive emotions, dramatic reveals, and character archetypes common in anime storytelling.',
  noir: 'Emphasize moral ambiguity, cynicism, shadowy atmospheres, and hard-boiled character traits.',
  'dark-thriller': 'Highlight tension, psychological depth, paranoia, and high-stakes danger.',
  horror: 'Focus on dread, the uncanny, vulnerability, and sources of fear or revulsion.',
  cyberpunk: 'Emphasize technology, corporate dystopia, street-level grit, and transhumanist themes.',
  'fantasy-epic': 'Emphasize grand scope, mythic destiny, heroic journeys, and ancient lore.',
  romance: 'Focus on emotional vulnerability, intimate connections, longing, and tenderness.',
  comedy: 'Highlight wit, comedic timing, playful dynamics, and humorous situations.',
  documentary: 'Emphasize factual clarity, journalistic objectivity, and grounded realism.',
  cinematic: 'Balance all tonal elements, adapting emphasis to the story\'s natural genre and emotional needs.',
};

/**
 * Round 1: Extract metadata from story text using an LLM.
 * Produces a StoryMetadata object with characters, settings, themes, etc.
 */
export async function extractMetadata(
  story: StoryInput,
  style: DramaStyle,
  llmClient: LLMClient
): Promise<StoryMetadata> {
  const systemPrompt = buildSystemPrompt(style);
  const userPrompt = buildUserPrompt(story);

  const response = await llmClient.generateText(systemPrompt, userPrompt);
  const metadata = JSON.parse(response) as StoryMetadata;
  return metadata;
}

function buildSystemPrompt(style: DramaStyle): string {
  const tonalHint = STYLE_TONAL_HINTS[style];
  return [
    'You are a story analysis expert. Extract structured metadata from the provided story text.',
    `The target drama style is "${style}". ${tonalHint}`,
    'Apply this tonal lens when identifying character traits, mood, and thematic elements.',
    'Respond with ONLY valid JSON matching the StoryMetadata schema.',
    'The `logline` must be a vivid, spoiler-light 1–2 sentence pitch written for a listener deciding whether to press play (not a scene-by-scene summary). Lead with the protagonist and the central dramatic question.',
    '',
    '## Voice-casting fields (critical — these drive TTS voice selection):',
    'Downstream, each character is cast to a distinct TTS voice. The cast matches `age`, `gender`, and keywords from `physicalDescription` / `personalityTraits` against voice labels. So:',
    '- `age`: SPECIFIC bucket — "child", "teenager", "young adult (20s)", "middle-aged (40s)", "elderly (70s)". Never leave this blank if the text gives any hint (a grandmother is elderly; a schoolkid is a child). Vague ages produce clone voices.',
    '- `physicalDescription`: include vocal-timbre cues — "deep gravelly voice", "high airy voice", "raspy from smoking", "soft-spoken", "booming". Even if the source never explicitly describes the voice, infer a plausible vocal signature from age, build, and role. ONE such descriptor per character is the difference between distinct casting and two characters that sound identical.',
    '- `personalityTraits`: concrete adjectives a voice director would use — "nervous", "commanding", "playful", "weary", "menacing", "warm", "detached". Avoid abstract nouns ("kindness", "bravery") — use descriptive adjectives instead.',
    '- When two characters are of the same gender and similar age, DELIBERATELY differentiate their physicalDescription and personalityTraits so they will cast to different voices (e.g. "old lady, warm soft-spoken, wavering voice" vs. "niece, bright energetic, quick clipped speech").',
    '',
    'Schema: { title: string, logline: string, genre: string, themes: string[], timePeriod: string,',
    '  narrativeArc: { exposition: string, risingAction: string, climax: string, fallingAction: string, resolution: string },',
    '  characters: [{ id: string, name: string, aliases: string[], age?: string, gender?: string,',
    '    physicalDescription: string, personalityTraits: string[],',
    '    relationships: [{ characterId: string, relationship: string }],',
    '    role: "protagonist"|"antagonist"|"supporting"|"minor" }],',
    '  settings: [{ id: string, name: string, description: string, timePeriod?: string, mood: string }] }',
  ].join('\n');
}

function buildUserPrompt(story: StoryInput): string {
  return `Analyze the following story and extract metadata:\n\n${story.text}`;
}
