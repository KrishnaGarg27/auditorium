export type DramaStyle =
  | 'anime'
  | 'noir'
  | 'dark-thriller'
  | 'horror'
  | 'cyberpunk'
  | 'fantasy-epic'
  | 'romance'
  | 'comedy'
  | 'documentary'
  | 'cinematic';

export const DRAMA_STYLES: { value: DramaStyle; label: string }[] = [
  { value: 'anime', label: 'Anime' },
  { value: 'noir', label: 'Noir' },
  { value: 'dark-thriller', label: 'Dark Thriller' },
  { value: 'horror', label: 'Horror' },
  { value: 'cyberpunk', label: 'Cyberpunk' },
  { value: 'fantasy-epic', label: 'Fantasy Epic' },
  { value: 'romance', label: 'Romance' },
  { value: 'comedy', label: 'Comedy' },
  { value: 'documentary', label: 'Documentary' },
  { value: 'cinematic', label: 'Cinematic' },
];

export interface DramaSummary {
  id: string;
  title: string;
  synopsis?: string;
  style: DramaStyle;
  status: 'processing' | 'complete' | 'failed';
  episodeCount: number;
  thumbnailPath?: string;
  createdAt: string;
}

export interface Drama {
  id: string;
  title: string;
  synopsis?: string;
  style: DramaStyle;
  creativeMode: boolean;
  thumbnailPath?: string;
  source: 'upload' | 'generated';
  status: 'processing' | 'complete' | 'failed';
  createdAt: string;
  episodes: Episode[];
}

export interface Episode {
  id: string;
  dramaId: string;
  episodeNumber: number;
  title: string;
  synopsis: string;
  recapNarration?: string;
  durationMs: number;
  audioFilePath: string;
  scenes: { sceneId: string; title: string }[];
}

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

export interface PipelineError {
  stage: PipelineStage;
  message: string;
  retryCount: number;
  details?: string;
}

export interface PipelineStatus {
  jobId: string;
  stage: PipelineStage;
  progress: number;
  stageDetail?: string;
  error?: PipelineError;
}

export const STAGE_LABELS: Record<PipelineStage, string> = {
  ingestion: 'Ingesting story',
  metadata_extraction: 'Analyzing story',
  scene_decomposition: 'Decomposing scenes',
  scene_adaptation: 'Adapting scenes',
  coherence_verification: 'Verifying coherence',
  voice_assignment: 'Assigning voices',
  audio_generation: 'Producing audio',
  audio_mixing: 'Mixing audio',
  thumbnail_generation: 'Generating thumbnail',
  complete: 'Complete',
  failed: 'Failed',
};
