import { v4 as uuidv4 } from 'uuid';
import type { StoryInput, StoryGenOptions } from '../types/index.js';
import { STYLE_PRESETS } from '../types/index.js';
import type { DramaStyle } from '../types/index.js';

/**
 * Interface for the LLM client used to generate stories.
 * Allows dependency injection for testing.
 */
export interface LLMClient {
  generateText(systemPrompt: string, userPrompt: string): Promise<string>;
}

/**
 * Generate a story from a user prompt via LLM.
 * Returns a StoryInput with source: 'generated'.
 */
export async function generateFromPrompt(
  prompt: string,
  llmClient: LLMClient,
  options?: StoryGenOptions
): Promise<StoryInput> {
  const systemPrompt = buildSystemPrompt(options);
  const text = await llmClient.generateText(systemPrompt, prompt);

  return {
    id: uuidv4(),
    text,
    source: 'generated',
  };
}

function buildSystemPrompt(options?: StoryGenOptions): string {
  const parts: string[] = [
    'You are a creative fiction writer. Generate an original story based on the user\'s prompt.',
    'Output only the story text with no additional commentary or metadata.',
  ];

  if (options?.style) {
    const preset = STYLE_PRESETS[options.style as DramaStyle];
    if (preset) {
      parts.push(`Write in a ${options.style} style. The tone should feature: ${preset.narration_style}. Dialogue should be: ${preset.dialogue_style}. Pacing should be: ${preset.pacing}.`);
    } else {
      parts.push(`Write in a ${options.style} style.`);
    }
  }

  if (options?.lengthPreference) {
    const lengthGuide: Record<string, string> = {
      short: 'Keep the story concise, around 500-1000 words.',
      medium: 'Write a medium-length story, around 2000-4000 words.',
      long: 'Write a longer story, around 5000-8000 words.',
    };
    parts.push(lengthGuide[options.lengthPreference]);
  }

  return parts.join(' ');
}
