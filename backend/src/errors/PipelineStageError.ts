import type { PipelineStage } from '../types/pipeline.js';

export class PipelineStageError extends Error {
  constructor(
    public readonly stage: PipelineStage,
    public readonly userMessage: string,
    public readonly technicalDetails: string,
    public readonly retryable: boolean
  ) {
    super(userMessage);
    this.name = 'PipelineStageError';
    Object.setPrototypeOf(this, PipelineStageError.prototype);
  }
}
