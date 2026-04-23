import type { StoryInput, DramaStyle } from '../types/index.js';
import type { LLMClient } from '../ingestion/generateFromPrompt.js';

const VALID_STYLES: DramaStyle[] = [
  'anime', 'noir', 'dark-thriller', 'horror', 'cyberpunk',
  'fantasy-epic', 'romance', 'comedy', 'documentary', 'cinematic'
];

/**
 * Infer an appropriate DramaStyle from story content when none is selected by the user.
 * Calls the LLM to analyze genre, themes, and tone, then returns a valid DramaStyle.
 */
export async function inferStyle(
  story: StoryInput,
  llmClient: LLMClient
): Promise<DramaStyle> {
  const styleDescriptions = [
    '- anime: Dramatic, emotionally heightened with inner monologue and exaggerated reactions',
    '- noir: World-weary, sardonic with hard-boiled wit and cynical dialogue',
    '- dark-thriller: Tense, urgent with psychological suspense and mounting pressure',
    '- horror: Unsettling, dread-building with understatement and sudden shocks',
    '- cyberpunk: Edgy, street-smart mixing high-tech with low-life grit',
    '- fantasy-epic: Grand, sweeping with ancient lore, heroic declarations, and destiny',
    '- romance: Warm, intimate with emotional vulnerability and tenderness',
    '- comedy: Witty, self-aware with comedic timing and playful asides',
    '- documentary: Authoritative, measured with journalistic clarity and gravitas',
    '- cinematic: Balanced, versatile adapting to the emotional needs of each scene',
  ].join('\n');

  const systemPrompt = [
    'You are a genre and style classification expert.',
    'Analyze the provided story text and determine which drama style best fits it.',
    'Valid styles are:',
    styleDescriptions,
    'Respond with ONLY the style name as a single word (e.g., "noir"). No other text.',
  ].join('\n');

  const userPrompt = `Classify the drama style for this story:\n\n${story.text}`;

  const response = await llmClient.generateText(systemPrompt, userPrompt);
  const style = response.trim().toLowerCase() as DramaStyle;

  if (VALID_STYLES.includes(style)) {
    return style;
  }

  // Fallback: if LLM returns something unexpected, default to cinematic
  return 'cinematic';
}
