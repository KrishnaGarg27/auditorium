import Replicate from 'replicate';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DramaStyle, StoryMetadata } from '../types/index.js';
import type { LLMClient } from '../ingestion/generateFromPrompt.js';
import { getThumbnailPath } from '../db/fileStorage.js';

const REPLICATE_MODEL = process.env.REPLICATE_MODEL ?? 'recraft-ai/recraft-v3';

/**
 * Style-specific visual direction for thumbnail prompts.
 * These guide the LLM to produce prompts that match each genre's visual language.
 */
const STYLE_VISUAL_DIRECTION: Record<DramaStyle, string> = {
  anime: 'anime art style, vibrant colors, dramatic lighting, cel-shaded, Japanese animation aesthetic, expressive characters, dynamic composition',
  noir: 'film noir style, high contrast black and white with amber accents, dramatic shadows, rain-slicked streets, venetian blinds light, 1940s detective aesthetic',
  'dark-thriller': 'psychological thriller aesthetic, desaturated cold tones, sharp shadows, claustrophobic framing, tension-filled atmosphere, muted blues and grays',
  horror: 'horror movie poster style, deep blacks and blood reds, unsettling atmosphere, fog and darkness, eerie lighting, dread-inducing composition',
  cyberpunk: 'cyberpunk aesthetic, neon lights in purple and cyan, rain-soaked futuristic cityscape, holographic elements, dark urban atmosphere, high-tech low-life',
  'fantasy-epic': 'epic fantasy art, sweeping landscapes, golden hour lighting, majestic and grand scale, rich greens and golds, heroic composition, painterly style',
  romance: 'romantic and warm aesthetic, soft golden light, blush pinks and warm tones, intimate atmosphere, dreamy bokeh, tender mood',
  comedy: 'bright and playful style, warm saturated colors, cheerful lighting, dynamic and fun composition, inviting atmosphere, vibrant energy',
  documentary: 'photojournalistic style, natural lighting, muted earth tones, authentic and grounded, cinematic documentary framing, real-world texture',
  cinematic: 'cinematic movie poster style, dramatic lighting, rich color grading, widescreen composition feel, professional film aesthetic, atmospheric depth',
};

/**
 * Style-specific tagline flavors to guide the LLM's tagline generation.
 */
const STYLE_TAGLINE_FLAVOR: Record<DramaStyle, string> = {
  anime: 'dramatic, emotional, epic — like an anime movie tagline',
  noir: 'cynical, hard-boiled, mysterious — classic noir one-liner',
  'dark-thriller': 'ominous, unsettling, psychological — makes you uneasy',
  horror: 'terrifying, dread-inducing, visceral — horror movie tagline',
  cyberpunk: 'edgy, rebellious, tech-noir — cyberpunk attitude',
  'fantasy-epic': 'grand, mythic, destiny-laden — epic fantasy tagline',
  romance: 'tender, longing, bittersweet — romance novel tagline',
  comedy: 'witty, playful, punchy — comedy movie tagline',
  documentary: 'thought-provoking, grounded, revelatory — documentary tagline',
  cinematic: 'cinematic, evocative, compelling — movie poster tagline',
};

/**
 * Use the LLM to generate a compelling image prompt for the thumbnail.
 * The prompt includes the drama title as prominent text and a short tagline.
 * Recraft V3 is excellent at rendering text in images.
 */
async function generateImagePrompt(
  metadata: StoryMetadata,
  style: DramaStyle,
  llmClient: LLMClient,
): Promise<{ imagePrompt: string; tagline: string }> {
  const visualDirection = STYLE_VISUAL_DIRECTION[style];
  const mainCharacters = metadata.characters
    .filter(c => c.role === 'protagonist' || c.role === 'antagonist')
    .slice(0, 2)
    .map(c => `${c.name} (${c.physicalDescription || c.personalityTraits.slice(0, 2).join(', ')})`)
    .join(', ');
  const setting = metadata.settings[0];
  const taglineFlavor = STYLE_TAGLINE_FLAVOR[style];

  const systemPrompt = `You are an expert cinematic poster designer. You will output TWO things separated by "---":

1. A short, punchy tagline (max 8 words) for the audio drama. Style: ${taglineFlavor}. Examples: "listen to your death", "a gothic audio drama", "every signal has a price", "the city never forgets". Do NOT use the title in the tagline.

2. An image generation prompt for Recraft V3 to create a stunning 9:16 portrait title card.

Rules for the image prompt:
- The image MUST prominently display the title "${metadata.title}" as large, stylish text — this is the most important element.
- Below the title, include the tagline as smaller text.
- The text should use a font/style that matches the genre (e.g., gothic serif for horror, sleek sans-serif for cyberpunk, elegant script for romance).
- Behind the text, describe a moody atmospheric background scene that conveys the genre.
- Focus on mood, atmosphere, lighting, and composition.
- Include specific details about colors and lighting.
- Keep the image prompt under 200 words.

Output format (exactly):
TAGLINE: <your tagline>
---
PROMPT: <your image prompt>`;

  const userPrompt = `Create a title card for:

Title: ${metadata.title}
Genre: ${metadata.genre}
Style: ${style}
Themes: ${metadata.themes.join(', ')}
Setting: ${setting ? `${setting.name} — ${setting.description}` : 'unspecified'}
Key Characters: ${mainCharacters || 'unspecified'}
Logline: ${metadata.logline || metadata.narrativeArc?.exposition || ''}

Visual direction: ${visualDirection}`;

  const response = await llmClient.generateText(systemPrompt, userPrompt);

  // Parse the response
  let tagline = 'an audio drama';
  let imagePrompt = response.trim();

  const taglineMatch = response.match(/TAGLINE:\s*(.+)/i);
  const promptMatch = response.match(/PROMPT:\s*([\s\S]+)/i);

  if (taglineMatch) tagline = taglineMatch[1].trim().replace(/^["']|["']$/g, '');
  if (promptMatch) imagePrompt = promptMatch[1].trim().replace(/^["']|["']$/g, '');

  // If parsing failed, build a fallback prompt with the title baked in
  if (!promptMatch) {
    imagePrompt = `A cinematic 9:16 portrait title card with the title "${metadata.title}" in large stylish text and the tagline "${tagline}" below it. ${visualDirection}. Atmospheric background scene, dramatic lighting, professional poster design.`;
  }

  return { imagePrompt, tagline };
}

/**
 * Generate an AI-powered thumbnail using Replicate's recraft-v3 model.
 * Falls back to the canvas-based generator if Replicate fails.
 */
export async function generateAIThumbnail(
  dramaId: string,
  metadata: StoryMetadata,
  style: DramaStyle,
  llmClient: LLMClient,
): Promise<string> {
  const apiToken = process.env.REPLICATE_API_TOKEN;
  if (!apiToken) {
    throw new Error('REPLICATE_API_TOKEN not set — cannot generate AI thumbnail');
  }

  // Generate the image prompt via LLM
  const { imagePrompt, tagline } = await generateImagePrompt(metadata, style, llmClient);
  console.log(`[Thumbnail] Tagline: "${tagline}"`);
  console.log(`[Thumbnail] AI prompt: ${imagePrompt.substring(0, 120)}...`);

  // Call Replicate
  const replicate = new Replicate({ auth: apiToken });

  const output = await replicate.run(REPLICATE_MODEL as `${string}/${string}`, {
    input: {
      prompt: imagePrompt,
      size: '1024x1820', // 9:16 portrait
      style: 'realistic_image',
    },
  });

  // Output is a ReadableStream or FileOutput — convert to buffer
  let buffer: Buffer;
  if (output instanceof ReadableStream) {
    const reader = (output as ReadableStream<Uint8Array>).getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    buffer = Buffer.concat(chunks);
  } else if (output && typeof (output as { url?: () => string }).url === 'function') {
    // FileOutput — fetch the URL
    const url = (output as { url: () => string }).url();
    const response = await fetch(url);
    buffer = Buffer.from(await response.arrayBuffer());
  } else {
    throw new Error('Unexpected Replicate output format');
  }

  // Save to the organized storage
  const filePath = getThumbnailPath(dramaId);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  // Save as webp (Recraft outputs webp) — rename to .webp
  const webpPath = filePath.replace(/\.png$/, '.webp');
  fs.writeFileSync(webpPath, buffer);

  return webpPath;
}
