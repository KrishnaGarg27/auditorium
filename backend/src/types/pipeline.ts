import type { IntermediateFormat } from './intermediate.js';
import type { AudioManifest } from './audio.js';

export type PipelineStage =
  | 'ingestion'
  | 'metadata_extraction'
  | 'scene_decomposition'
  | 'scene_adaptation'
  | 'coherence_verification'
  | 'voice_assignment'
  | 'audio_generation'
  | 'audio_mixing'
  | 'thumbnail_generation'
  | 'complete'
  | 'failed';

export interface PipelineStatus {
  jobId: string;
  stage: PipelineStage;
  progress: number;
  stageDetail?: string;
  error?: PipelineError;
}

export interface PipelineJob {
  id: string;
  dramaId: string;
  stage: PipelineStage;
  progress: number;
  stageDetail?: string;
  intermediateFormat?: IntermediateFormat;
  audioManifest?: AudioManifest;
  error?: PipelineError;
  startedAt: string;
  updatedAt: string;
}

export interface PipelineError {
  stage: PipelineStage;
  message: string;
  retryCount: number;
  details?: string;
}
