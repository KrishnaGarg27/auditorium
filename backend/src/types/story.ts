import type { DramaStyle } from './core.js';

export interface StoryInput {
  id: string;
  text: string;
  source: 'upload' | 'generated';
  title?: string;
}

export interface StoryGenOptions {
  style?: DramaStyle;
  lengthPreference?: 'short' | 'medium' | 'long';
}

export interface StoryMetadata {
  title: string;
  /** 1–2 sentence pitch shown on the drama card and detail view. */
  logline: string;
  genre: string;
  themes: string[];
  timePeriod: string;
  narrativeArc: {
    exposition: string;
    risingAction: string;
    climax: string;
    fallingAction: string;
    resolution: string;
  };
  characters: CharacterMetadata[];
  settings: SettingMetadata[];
}

export interface CharacterMetadata {
  id: string;
  name: string;
  aliases: string[];
  age?: string;
  gender?: string;
  physicalDescription: string;
  personalityTraits: string[];
  relationships: { characterId: string; relationship: string }[];
  role: 'protagonist' | 'antagonist' | 'supporting' | 'minor';
}

export interface SettingMetadata {
  id: string;
  name: string;
  description: string;
  timePeriod?: string;
  mood: string;
}

export interface SceneDecomposition {
  scenes: SceneDefinition[];
}

export interface SceneDefinition {
  id: string;
  sequenceNumber: number;
  title: string;
  settingId: string;
  participatingCharacterIds: string[];
  mood: string;
  summary: string;
  originalTextRange: { startParagraph: number; endParagraph: number };
}
