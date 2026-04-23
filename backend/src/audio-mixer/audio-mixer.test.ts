import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { buildTransitionFilter, buildFilterGraph } from './mixScene.js';
import type { SceneMixInput } from '../types/audio.js';
import type { MusicTransition } from '../types/core.js';

// Mock fs.existsSync to return true for test asset paths
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn((p: string) => {
      // Return true for test asset paths
      if (typeof p === 'string' && p.startsWith('/test/')) return true;
      return actual.existsSync(p);
    }),
  };
});

describe('buildTransitionFilter', () => {
  it('returns afade=t=in for fade-in transition', () => {
    const result = buildTransitionFilter('fade-in', 10000);
    expect(result).toContain('afade=t=in');
  });

  it('returns afade=t=out for fade-out transition', () => {
    const result = buildTransitionFilter('fade-out', 10000);
    expect(result).toContain('afade=t=out');
  });

  it('returns acrossfade for crossfade transition', () => {
    const result = buildTransitionFilter('crossfade', 10000);
    expect(result).toContain('acrossfade');
  });

  it('returns empty string for hard-cut transition', () => {
    const result = buildTransitionFilter('hard-cut', 10000);
    expect(result).toBe('');
  });

  it('caps fade duration at 2 seconds', () => {
    // 60s track → 10% = 6s, but capped at 2s
    const result = buildTransitionFilter('fade-in', 60000);
    expect(result).toContain('d=2');
  });
});

describe('buildFilterGraph', () => {
  it('assigns dialogue volume of 1.0 (reference level)', () => {
    const input: SceneMixInput = {
      sceneId: 'scene-1',
      dialogueTracks: [
        { assetPath: '/test/dlg1.mp3', startTimeMs: 0, durationMs: 5000, volume: 1.0 },
      ],
      sfxTracks: [],
      musicTracks: [],
    };

    const { filterComplex } = buildFilterGraph(input);
    expect(filterComplex).toContain('volume=1');
  });

  it('ensures dialogue volume > SFX volume (Property 12)', () => {
    const input: SceneMixInput = {
      sceneId: 'scene-1',
      dialogueTracks: [
        { assetPath: '/test/dlg1.mp3', startTimeMs: 0, durationMs: 5000, volume: 1.0 },
      ],
      sfxTracks: [
        { assetPath: '/test/sfx1.mp3', startTimeMs: 0, durationMs: 3000, volume: 0.6 },
      ],
      musicTracks: [],
    };

    const { filterComplex } = buildFilterGraph(input);
    // Dialogue volume=1, SFX volume=0.6
    expect(filterComplex).toMatch(/volume=1/);
    expect(filterComplex).toMatch(/volume=0\.6/);
  });

  it('ensures dialogue volume > music volume (Property 12)', () => {
    const input: SceneMixInput = {
      sceneId: 'scene-1',
      dialogueTracks: [
        { assetPath: '/test/dlg1.mp3', startTimeMs: 0, durationMs: 5000, volume: 1.0 },
      ],
      sfxTracks: [],
      musicTracks: [
        { assetPath: '/test/mus1.mp3', startTimeMs: 0, durationMs: 10000, volume: 0.3, transition: 'fade-in' },
      ],
    };

    const { filterComplex } = buildFilterGraph(input);
    expect(filterComplex).toMatch(/volume=1/);
    expect(filterComplex).toMatch(/volume=0\.3/);
  });

  it('caps SFX and music volume below 1.0 to maintain dialogue priority', () => {
    const input: SceneMixInput = {
      sceneId: 'scene-1',
      dialogueTracks: [
        { assetPath: '/test/dlg1.mp3', startTimeMs: 0, durationMs: 5000, volume: 1.0 },
      ],
      sfxTracks: [
        { assetPath: '/test/sfx1.mp3', startTimeMs: 0, durationMs: 3000, volume: 1.0 },
      ],
      musicTracks: [
        { assetPath: '/test/mus1.mp3', startTimeMs: 0, durationMs: 10000, volume: 1.0 },
      ],
    };

    const { filterComplex } = buildFilterGraph(input);
    // SFX and music should be capped at 0.99
    expect(filterComplex).toMatch(/volume=0\.99/);
  });

  it('applies adelay for track start time offsets', () => {
    const input: SceneMixInput = {
      sceneId: 'scene-1',
      dialogueTracks: [
        { assetPath: '/test/dlg1.mp3', startTimeMs: 2000, durationMs: 5000, volume: 1.0 },
      ],
      sfxTracks: [],
      musicTracks: [],
    };

    const { filterComplex } = buildFilterGraph(input);
    expect(filterComplex).toContain('adelay=2000|2000');
  });

  it('applies atrim for looped ambient SFX (Property 14)', () => {
    const input: SceneMixInput = {
      sceneId: 'scene-1',
      dialogueTracks: [],
      sfxTracks: [
        { assetPath: '/test/ambient.mp3', startTimeMs: 0, durationMs: 30000, volume: 0.4, loop: true },
      ],
      musicTracks: [],
    };

    const { filterComplex, inputArgs } = buildFilterGraph(input);
    // Should have -stream_loop -1 in input args
    expect(inputArgs).toContain('-stream_loop');
    expect(inputArgs).toContain('-1');
    // Should trim to 30 seconds
    expect(filterComplex).toContain('atrim=0:30');
  });

  it('applies transition filter for music tracks (Property 13)', () => {
    const input: SceneMixInput = {
      sceneId: 'scene-1',
      dialogueTracks: [],
      sfxTracks: [],
      musicTracks: [
        { assetPath: '/test/mus1.mp3', startTimeMs: 0, durationMs: 10000, volume: 0.3, transition: 'fade-in' },
      ],
    };

    const { filterComplex } = buildFilterGraph(input);
    expect(filterComplex).toContain('afade=t=in');
  });

  it('uses amix to combine multiple streams', () => {
    const input: SceneMixInput = {
      sceneId: 'scene-1',
      dialogueTracks: [
        { assetPath: '/test/dlg1.mp3', startTimeMs: 0, durationMs: 5000, volume: 1.0 },
      ],
      sfxTracks: [
        { assetPath: '/test/sfx1.mp3', startTimeMs: 0, durationMs: 3000, volume: 0.6 },
      ],
      musicTracks: [
        { assetPath: '/test/mus1.mp3', startTimeMs: 0, durationMs: 10000, volume: 0.3 },
      ],
    };

    const { filterComplex } = buildFilterGraph(input);
    expect(filterComplex).toContain('amix=inputs=3');
  });

  it('skips missing assets with warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const input: SceneMixInput = {
      sceneId: 'scene-1',
      dialogueTracks: [
        { assetPath: '/missing/dlg1.mp3', startTimeMs: 0, durationMs: 5000, volume: 1.0 },
      ],
      sfxTracks: [],
      musicTracks: [],
    };

    const { streamCount } = buildFilterGraph(input);
    expect(streamCount).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Missing dialogue asset'),
    );

    warnSpy.mockRestore();
  });

  it('handles empty scene with no tracks', () => {
    const input: SceneMixInput = {
      sceneId: 'scene-empty',
      dialogueTracks: [],
      sfxTracks: [],
      musicTracks: [],
    };

    const { filterComplex, streamCount } = buildFilterGraph(input);
    expect(streamCount).toBe(0);
    expect(filterComplex).toBe('');
  });
});
