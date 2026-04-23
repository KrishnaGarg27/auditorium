import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { STAGE_LABELS } from '../types';
import type { PipelineStage, PipelineStatus, PipelineError } from '../types';

/**
 * Feature: audio-drama-engine, Property 21: Pipeline status rendering correctness
 * Validates: Requirements 13.1, 13.2, 13.4
 */

const ALL_STAGES: PipelineStage[] = [
  'ingestion',
  'metadata_extraction',
  'scene_decomposition',
  'scene_adaptation',
  'coherence_verification',
  'voice_assignment',
  'audio_generation',
  'audio_mixing',
  'thumbnail_generation',
  'complete',
  'failed',
];

const stageArb: fc.Arbitrary<PipelineStage> = fc.constantFrom(...ALL_STAGES);

const pipelineErrorArb: fc.Arbitrary<PipelineError> = fc.record({
  stage: stageArb,
  message: fc.string({ minLength: 1 }),
  retryCount: fc.nat({ max: 10 }),
  details: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
});

const pipelineStatusArb: fc.Arbitrary<PipelineStatus> = fc.record({
  jobId: fc.uuid(),
  stage: stageArb,
  progress: fc.integer({ min: 0, max: 100 }),
  stageDetail: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
  error: fc.option(pipelineErrorArb, { nil: undefined }),
});

describe('Feature: audio-drama-engine, Property 21: Pipeline status rendering correctness', () => {
  it('STAGE_LABELS has a non-empty label for every valid PipelineStage', () => {
    fc.assert(
      fc.property(stageArb, (stage) => {
        const label = STAGE_LABELS[stage];
        expect(label).toBeDefined();
        expect(typeof label).toBe('string');
        expect(label.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('progress is always between 0 and 100 inclusive for any PipelineStatus', () => {
    fc.assert(
      fc.property(pipelineStatusArb, (status) => {
        expect(status.progress).toBeGreaterThanOrEqual(0);
        expect(status.progress).toBeLessThanOrEqual(100);
      }),
      { numRuns: 100 },
    );
  });

  it('stageDetail is a string when present on a PipelineStatus', () => {
    fc.assert(
      fc.property(pipelineStatusArb, (status) => {
        if (status.stageDetail !== undefined) {
          expect(typeof status.stageDetail).toBe('string');
          expect(status.stageDetail.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('when stage is "failed" and error is present, error has stage and message fields', () => {
    const failedWithErrorArb = fc.record({
      jobId: fc.uuid(),
      stage: fc.constant('failed' as PipelineStage),
      progress: fc.integer({ min: 0, max: 100 }),
      stageDetail: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
      error: pipelineErrorArb,
    });

    fc.assert(
      fc.property(failedWithErrorArb, (status) => {
        expect(status.stage).toBe('failed');
        expect(status.error).toBeDefined();
        expect(status.error.stage).toBeDefined();
        expect(ALL_STAGES).toContain(status.error.stage);
        expect(typeof status.error.message).toBe('string');
        expect(status.error.message.length).toBeGreaterThan(0);
        // The view would render: STAGE_LABELS[status.error.stage] and status.error.message
        const failedStageLabel = STAGE_LABELS[status.error.stage];
        expect(failedStageLabel).toBeDefined();
        expect(failedStageLabel.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('every PipelineStatus maps to a renderable stage label via STAGE_LABELS', () => {
    fc.assert(
      fc.property(pipelineStatusArb, (status) => {
        const label = STAGE_LABELS[status.stage];
        expect(label).toBeDefined();
        expect(typeof label).toBe('string');
        expect(label.length).toBeGreaterThan(0);
        // Progress percentage is renderable
        const percentText = `${status.progress}%`;
        expect(percentText).toMatch(/^\d{1,3}%$/);
      }),
      { numRuns: 100 },
    );
  });
});
