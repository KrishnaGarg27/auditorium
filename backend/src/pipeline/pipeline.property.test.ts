import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { STYLE_PRESETS } from '../types/index.js';
import type { DramaStyle } from '../types/index.js';
import { buildSceneAdaptationPrompt } from '../scene-adapter/buildPrompt.js';

const allDramaStyles: DramaStyle[] = [
  'anime', 'noir', 'dark-thriller', 'horror', 'cyberpunk',
  'fantasy-epic', 'romance', 'comedy', 'documentary', 'cinematic',
];

const dramaStyleArb: fc.Arbitrary<DramaStyle> = fc.constantFrom(...allDramaStyles);

const sceneDefinition = {
  id: 'scene-1',
  sequenceNumber: 1,
  title: 'Test',
  settingId: 'setting-1',
  participatingCharacterIds: ['char-1'],
  mood: 'tense',
  summary: 'Test scene',
  originalTextRange: { startParagraph: 0, endParagraph: 1 },
};

const metadata = {
  title: 'Test',
  logline: 'A hero ventures forth to save the realm.',
  genre: 'fantasy',
  themes: ['adventure'] as string[],
  timePeriod: 'medieval',
  narrativeArc: {
    exposition: 'A',
    risingAction: 'B',
    climax: 'C',
    fallingAction: 'D',
    resolution: 'E',
  },
  characters: [
    {
      id: 'char-1',
      name: 'Hero',
      aliases: [] as string[],
      physicalDescription: 'Tall',
      personalityTraits: ['brave'] as string[],
      relationships: [] as string[],
      role: 'protagonist' as const,
    },
  ],
  settings: [
    { id: 'setting-1', name: 'Castle', description: 'Grand', mood: 'majestic' },
  ],
};

describe('Feature: audio-drama-engine, Property 3: Drama style propagation', () => {
  /**
   * Validates: Requirements 2.2
   *
   * For any valid DramaStyle selection (from the full palette of 10 styles),
   * when a story is processed through the pipeline, the style value passed to
   * the Story Analyzer, Scene Adapter, and Character Voice Mapper must all
   * equal the originally selected style.
   */
  it('STYLE_PRESETS[style].style equals the originally selected style', () => {
    fc.assert(
      fc.property(dramaStyleArb, (style) => {
        const preset = STYLE_PRESETS[style];
        expect(preset).toBeDefined();
        expect(preset.style).toBe(style);
      }),
      { numRuns: 100 },
    );
  });

  it('style is preserved through buildSceneAdaptationPrompt output', () => {
    fc.assert(
      fc.property(dramaStyleArb, (style) => {
        const preset = STYLE_PRESETS[style];
        const { systemPrompt, userPrompt } = buildSceneAdaptationPrompt(
          sceneDefinition,
          'Some raw scene text for testing.',
          metadata,
          preset,
          null,
          false,
        );

        // The style name must appear in the user prompt header
        expect(userPrompt).toContain(`Style Preset: ${style}`);
        // The preset fields must be injected into the user prompt
        expect(userPrompt).toContain(preset.narration_style);
        expect(userPrompt).toContain(preset.dialogue_style);

        // System prompt must be non-empty (confirms the prompt was built)
        expect(systemPrompt.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('style can be used to look up voice settings presets for all 10 styles', () => {
    fc.assert(
      fc.property(dramaStyleArb, (style) => {
        // Verify the style is a key in STYLE_PRESETS (propagation path to voice mapper)
        expect(style in STYLE_PRESETS).toBe(true);
        // The preset style field round-trips correctly
        expect(STYLE_PRESETS[style].style).toBe(style);
      }),
      { numRuns: 100 },
    );
  });
});
