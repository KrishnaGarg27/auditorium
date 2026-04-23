import type { MusicTransition } from './core.js';

export interface AudioAsset {
  id: string;
  sourceId: string;
  type: 'speech' | 'sfx' | 'music';
  filePath: string;
  durationMs: number;
  format: 'mp3';
  cacheKey: string;
}

export interface AudioManifest {
  dramaId: string;
  assets: AudioAsset[];
  generatedAt: string;
}

export interface VoiceAssignment {
  characterId: string;
  characterName: string;
  voiceId: string;
  voiceSettings: VoiceSettings;
  role: 'character' | 'narrator';
}

export interface VoiceSettings {
  stability: number;
  similarityBoost: number;
  style: number;
  speed: number;
  useSpeakerBoost: boolean;
}

export interface SceneMixInput {
  sceneId: string;
  dialogueTracks: TimedAudioTrack[];
  sfxTracks: TimedAudioTrack[];
  musicTracks: TimedAudioTrack[];
}

export interface TimedAudioTrack {
  assetPath: string;
  startTimeMs: number;
  durationMs: number;
  volume: number;
  transition?: MusicTransition;
  loop?: boolean;
}
