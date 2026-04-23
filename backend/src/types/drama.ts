import type { DramaStyle } from './core.js';

export interface Drama {
  id: string;
  title: string;
  /** Short pitch shown on the detail view; set from StoryMetadata.logline. */
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

