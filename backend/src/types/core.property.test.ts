import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { STYLE_PRESETS } from './core.js';
import type { DramaStyle } from './core.js';

const allDramaStyles: DramaStyle[] = [
  'anime', 'noir', 'dark-thriller', 'horror', 'cyberpunk',
  'fantasy-epic', 'romance', 'comedy', 'documentary', 'cinematic'
];

const dramaStyleArb: fc.Arbitrary<DramaStyle> = fc.constantFrom(...allDramaStyles);

describe('Feature: audio-drama-engine, Property 22: Style preset completeness', () => {
  /**
   * Validates: Requirements 2.5
   *
   * Every DramaStyle value must have a corresponding StylePreset entry
   * in STYLE_PRESETS with all fields populated (non-empty strings).
   */
  it('every DramaStyle has a StylePreset with non-empty fields', () => {
    fc.assert(
      fc.property(dramaStyleArb, (style) => {
        const preset = STYLE_PRESETS[style];

        // Preset must exist
        expect(preset).toBeDefined();

        // All fields must be non-empty strings
        expect(preset.style).toBe(style);
        expect(preset.narration_style.trim().length).toBeGreaterThan(0);
        expect(preset.dialogue_style.trim().length).toBeGreaterThan(0);
        expect(preset.music_preferences.trim().length).toBeGreaterThan(0);
        expect(preset.ambient_preferences.trim().length).toBeGreaterThan(0);
        expect(preset.sfx_style.trim().length).toBeGreaterThan(0);
        expect(preset.pacing.trim().length).toBeGreaterThan(0);
        expect(preset.voice_aesthetic.trim().length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });
});
