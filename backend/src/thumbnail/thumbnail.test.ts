import { describe, it, expect } from 'vitest';
import { generateThumbnail, STYLE_COLORS, WIDTH, HEIGHT } from './generateThumbnail.js';
import { createCanvas } from 'canvas';
import { stat } from 'fs/promises';
import type { DramaStyle } from '../types/index.js';

const ALL_STYLES: DramaStyle[] = [
  'anime', 'noir', 'dark-thriller', 'horror', 'cyberpunk',
  'fantasy-epic', 'romance', 'comedy', 'documentary', 'cinematic',
];

describe('generateThumbnail', () => {
  it('should generate a PNG file and return its path', async () => {
    const filePath = await generateThumbnail('Test Drama', 'noir');
    expect(filePath).toMatch(/\.png$/);
    const fileStat = await stat(filePath);
    expect(fileStat.isFile()).toBe(true);
    expect(fileStat.size).toBeGreaterThan(0);
  });

  it('should produce a 640x360 canvas', () => {
    expect(WIDTH).toBe(640);
    expect(HEIGHT).toBe(360);
    const canvas = createCanvas(WIDTH, HEIGHT);
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(360);
  });

  it('should have color palettes for all 10 styles', () => {
    for (const style of ALL_STYLES) {
      const colors = STYLE_COLORS[style];
      expect(colors).toBeDefined();
      expect(colors.from).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(colors.to).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('should produce distinct gradients for each style', () => {
    const colorPairs = ALL_STYLES.map(s => `${STYLE_COLORS[s].from}-${STYLE_COLORS[s].to}`);
    const unique = new Set(colorPairs);
    expect(unique.size).toBe(ALL_STYLES.length);
  });

  it('should generate thumbnails for all styles without error', async () => {
    for (const style of ALL_STYLES) {
      const filePath = await generateThumbnail(`Drama: ${style}`, style);
      const fileStat = await stat(filePath);
      expect(fileStat.isFile()).toBe(true);
    }
  });
});
