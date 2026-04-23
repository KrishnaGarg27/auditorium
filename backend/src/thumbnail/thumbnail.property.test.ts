import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { generateThumbnail, STYLE_COLORS, WIDTH, HEIGHT } from './generateThumbnail.js';
import type { DramaStyle } from '../types/index.js';
import { stat, rm, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Use a unique temp directory to avoid race conditions with thumbnail.test.ts
const PROP_TEST_DIR = join(tmpdir(), `thumb-prop-test-${process.pid}`);

const allDramaStyles: DramaStyle[] = [
  'anime', 'noir', 'dark-thriller', 'horror', 'cyberpunk',
  'fantasy-epic', 'romance', 'comedy', 'documentary', 'cinematic',
];

const dramaStyleArb: fc.Arbitrary<DramaStyle> = fc.constantFrom(...allDramaStyles);

beforeAll(async () => {
  await mkdir(PROP_TEST_DIR, { recursive: true });
});

afterAll(async () => {
  await rm(PROP_TEST_DIR, { recursive: true, force: true }).catch(() => {});
});

describe('Feature: audio-drama-engine, Property 24: Thumbnail generation for all styles', () => {
  /**
   * Validates: Requirements 15.1, 15.3
   *
   * For any valid DramaStyle, STYLE_COLORS must exist with valid hex color
   * strings for `from` and `to`, the colors must be distinct per style,
   * and WIDTH/HEIGHT must be 640x360.
   */
  it('every DramaStyle has valid STYLE_COLORS with hex from/to and correct dimensions', () => {
    fc.assert(
      fc.property(dramaStyleArb, (style) => {
        // STYLE_COLORS entry must exist
        const colors = STYLE_COLORS[style];
        expect(colors).toBeDefined();

        // Both from and to must be valid 6-digit hex color strings
        expect(colors.from).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(colors.to).toMatch(/^#[0-9A-Fa-f]{6}$/);

        // Dimensions must be 640x360
        expect(WIDTH).toBe(640);
        expect(HEIGHT).toBe(360);
      }),
      { numRuns: 100 },
    );
  });

  it('no two styles share the same gradient pair', () => {
    const colorPairs = allDramaStyles.map(
      (s) => `${STYLE_COLORS[s].from}-${STYLE_COLORS[s].to}`,
    );
    const unique = new Set(colorPairs);
    expect(unique.size).toBe(allDramaStyles.length);
  });

  it('generateThumbnail produces a valid PNG file for every style', async () => {
    await fc.assert(
      fc.asyncProperty(dramaStyleArb, async (style) => {
        const filePath = await generateThumbnail(`Test ${style}`, style);

        // File must exist and be non-empty
        const fileStat = await stat(filePath);
        expect(fileStat.isFile()).toBe(true);
        expect(fileStat.size).toBeGreaterThan(0);

        // Must be a .png file
        expect(filePath).toMatch(/\.png$/);
      }),
      { numRuns: 100 },
    );
  }, 60_000);
});
