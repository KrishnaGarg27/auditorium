import { describe, it, expect } from 'vitest';
import { StoryIngestionError } from './StoryIngestionError.js';
import { PipelineStageError } from './PipelineStageError.js';

describe('StoryIngestionError', () => {
  it('should set code and message for EMPTY_FILE', () => {
    const err = new StoryIngestionError('EMPTY_FILE', 'The uploaded file contains no extractable text.');
    expect(err.code).toBe('EMPTY_FILE');
    expect(err.message).toBe('The uploaded file contains no extractable text.');
    expect(err.name).toBe('StoryIngestionError');
  });

  it('should set code and message for FILE_TOO_LARGE', () => {
    const err = new StoryIngestionError('FILE_TOO_LARGE', 'File exceeds the maximum size of 500KB.');
    expect(err.code).toBe('FILE_TOO_LARGE');
    expect(err.message).toBe('File exceeds the maximum size of 500KB.');
  });

  it('should set code and message for UNSUPPORTED_FORMAT', () => {
    const err = new StoryIngestionError('UNSUPPORTED_FORMAT', 'Only .txt and .md files are supported.');
    expect(err.code).toBe('UNSUPPORTED_FORMAT');
    expect(err.message).toBe('Only .txt and .md files are supported.');
  });

  it('should set code and message for EXTRACTION_FAILED', () => {
    const err = new StoryIngestionError('EXTRACTION_FAILED', 'Failed to extract text.');
    expect(err.code).toBe('EXTRACTION_FAILED');
    expect(err.message).toBe('Failed to extract text.');
  });

  it('should be an instance of Error and StoryIngestionError', () => {
    const err = new StoryIngestionError('EMPTY_FILE', 'test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(StoryIngestionError);
  });
});

describe('PipelineStageError', () => {
  it('should set all fields correctly', () => {
    const err = new PipelineStageError(
      'scene_adaptation',
      'Script generation failed',
      'LLM returned invalid JSON',
      true
    );
    expect(err.stage).toBe('scene_adaptation');
    expect(err.userMessage).toBe('Script generation failed');
    expect(err.technicalDetails).toBe('LLM returned invalid JSON');
    expect(err.retryable).toBe(true);
    expect(err.message).toBe('Script generation failed');
    expect(err.name).toBe('PipelineStageError');
  });

  it('should support non-retryable errors', () => {
    const err = new PipelineStageError(
      'audio_generation',
      'API key invalid',
      '401 Unauthorized',
      false
    );
    expect(err.retryable).toBe(false);
  });

  it('should be an instance of Error and PipelineStageError', () => {
    const err = new PipelineStageError('ingestion', 'msg', 'details', false);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(PipelineStageError);
  });
});
