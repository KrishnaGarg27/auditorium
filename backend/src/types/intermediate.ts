import type { DramaStyle } from './core.js';
import type { StoryMetadata } from './story.js';
import type { AnnotatedScene } from './script.js';
import type { VoiceAssignment } from './audio.js';

export interface IntermediateFormat {
  version: string;
  dramaId: string;
  title: string;
  style: DramaStyle;
  creativeMode: boolean;
  metadata: StoryMetadata;
  voiceAssignments: VoiceAssignment[];
  episodes: EpisodeDefinition[];
}

export interface EpisodeDefinition {
  id: string;
  episodeNumber: number;
  title: string;
  synopsis: string;
  recapNarration?: string;
  /** Scene IDs assigned during episode organization, used to distribute AnnotatedScenes in the pipeline */
  sceneIds: string[];
  scenes: AnnotatedScene[];
}
