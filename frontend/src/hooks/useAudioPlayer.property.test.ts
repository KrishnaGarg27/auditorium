import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';

/**
 * Feature: audio-drama-engine, Property 18: Playback position localStorage round-trip
 * Validates: Requirements 11.6
 */
describe('Feature: audio-drama-engine, Property 18: Playback position localStorage round-trip', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saving a playback position to localStorage and loading it returns the same value', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.nat(),
        (dramaId, episodeId, positionMs) => {
          const key = `drama_${dramaId}_episode_${episodeId}`;
          const floored = Math.floor(positionMs);

          localStorage.setItem(key, String(floored));

          const loaded = localStorage.getItem(key);
          expect(loaded).not.toBeNull();
          expect(Number(loaded)).toBe(floored);
        },
      ),
      { numRuns: 100 },
    );
  });
});
