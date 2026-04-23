import { describe, it, expect } from 'vitest';
import {
  DRAMA_STYLES,
  STAGE_LABELS,
  type PipelineStage,
  type PipelineStatus,
  type DramaStyle,
} from '../types';
import { STYLE_COLORS, styleGradient, styleBadgeBg } from '../styleColors';

/**
 * Validates: Requirements 11.1, 11.4, 11.6, 13.1, 13.3, 13.4, 14.1
 */

describe('DRAMA_STYLES has all 10 styles', () => {
  it('contains exactly 10 entries', () => {
    expect(DRAMA_STYLES).toHaveLength(10);
  });

  it('each entry has a non-empty value and label', () => {
    for (const s of DRAMA_STYLES) {
      expect(s.value).toBeTruthy();
      expect(s.label).toBeTruthy();
    }
  });

  it('values match the DramaStyle union members', () => {
    const expected: DramaStyle[] = [
      'anime', 'noir', 'dark-thriller', 'horror', 'cyberpunk',
      'fantasy-epic', 'romance', 'comedy', 'documentary', 'cinematic',
    ];
    const values = DRAMA_STYLES.map((s) => s.value);
    expect(values).toEqual(expect.arrayContaining(expected));
    expect(expected).toEqual(expect.arrayContaining(values));
  });
});

describe('STAGE_LABELS covers all pipeline stages', () => {
  const allStages: PipelineStage[] = [
    'ingestion', 'metadata_extraction', 'scene_decomposition',
    'scene_adaptation', 'coherence_verification', 'voice_assignment',
    'audio_generation', 'audio_mixing', 'thumbnail_generation',
    'complete', 'failed',
  ];

  it('has a non-empty label for every PipelineStage', () => {
    for (const stage of allStages) {
      expect(STAGE_LABELS[stage]).toBeTruthy();
      expect(typeof STAGE_LABELS[stage]).toBe('string');
    }
  });
});

describe('Style colors exist for all styles', () => {
  const hexPattern = /^#[0-9A-Fa-f]{6}$/;

  it('STYLE_COLORS has entries for all 10 styles with valid hex colors', () => {
    for (const s of DRAMA_STYLES) {
      const colors = STYLE_COLORS[s.value];
      expect(colors).toBeDefined();
      expect(colors.from).toMatch(hexPattern);
      expect(colors.to).toMatch(hexPattern);
    }
  });
});

describe('styleGradient returns valid CSS gradient', () => {
  it('returns a string containing "linear-gradient" for each style', () => {
    for (const s of DRAMA_STYLES) {
      const gradient = styleGradient(s.value);
      expect(gradient).toContain('linear-gradient');
      expect(gradient).toContain(STYLE_COLORS[s.value].from);
      expect(gradient).toContain(STYLE_COLORS[s.value].to);
    }
  });
});

describe('styleBadgeBg returns the "from" color', () => {
  it('returns the from color for each style', () => {
    for (const s of DRAMA_STYLES) {
      const bg = styleBadgeBg(s.value);
      expect(bg).toBe(STYLE_COLORS[s.value].from);
    }
  });
});

describe('localStorage playback position key format', () => {
  it('key format drama_${dramaId}_episode_${episodeId} works for save/load', () => {
    const dramaId = 'drama-abc-123';
    const episodeId = 'ep-001';
    const key = `drama_${dramaId}_episode_${episodeId}`;

    expect(key).toBe('drama_drama-abc-123_episode_ep-001');

    // Simulate save
    localStorage.setItem(key, String(42000));
    // Simulate load
    const raw = localStorage.getItem(key);
    expect(raw).toBe('42000');
    const positionMs = Number(raw);
    expect(positionMs).toBe(42000);

    // Cleanup
    localStorage.removeItem(key);
  });
});

describe('PipelineStatus with stageDetail', () => {
  it('can be constructed and accessed with stageDetail', () => {
    const status: PipelineStatus = {
      jobId: 'job-1',
      stage: 'audio_generation',
      progress: 55,
      stageDetail: 'Generating speech for scene 3 of 8',
    };

    expect(status.jobId).toBe('job-1');
    expect(status.stage).toBe('audio_generation');
    expect(status.progress).toBe(55);
    expect(status.stageDetail).toBe('Generating speech for scene 3 of 8');
    expect(status.error).toBeUndefined();
  });
});

describe('PipelineStatus with error', () => {
  it('failed status with error has all required fields', () => {
    const status: PipelineStatus = {
      jobId: 'job-2',
      stage: 'failed',
      progress: 30,
      error: {
        stage: 'voice_assignment',
        message: 'Voice API rate limit exceeded',
        retryCount: 3,
        details: 'HTTP 429',
      },
    };

    expect(status.stage).toBe('failed');
    expect(status.error).toBeDefined();
    expect(status.error!.stage).toBe('voice_assignment');
    expect(status.error!.message).toBe('Voice API rate limit exceeded');
    expect(status.error!.retryCount).toBe(3);
    expect(status.error!.details).toBe('HTTP 429');
  });
});
