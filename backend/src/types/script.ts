import type { SFXDurationType, MusicTransition } from './core.js';

export type ScriptElement = DialogueLine | NarrationLine | ActionCue;

export interface DialogueLine {
  type: 'dialogue';
  id: string;
  characterId: string;
  text: string;
  expression: string;
  parenthetical?: string;
}

export interface NarrationLine {
  type: 'narration';
  id: string;
  text: string;
  tone: string;
}

export interface ActionCue {
  type: 'action';
  id: string;
  description: string;
}

export interface AnnotatedScript {
  scenes: AnnotatedScene[];
}

export interface VerifiedScript extends AnnotatedScript {
  verified: true;
  issues: CoherenceIssue[];
}

export interface CoherenceIssue {
  type: 'information-loss' | 'inconsistency' | 'pacing' | 'creative-fidelity';
  description: string;
  severity: 'low' | 'medium' | 'high';
}

export interface AnnotatedScene {
  sceneId: string;
  elements: ScriptElement[];
  sfxCues: SFXCue[];
  musicCues: MusicCue[];
}

export interface SFXCue {
  id: string;
  description: string;
  durationType: SFXDurationType;
  durationMs?: number;
  triggerAfterElementId: string;
  triggerOffsetMs: number;
  volume: number;
  source: 'explicit' | 'inferred' | 'emotional-ambience' | 'creative';
}

export interface MusicCue {
  id: string;
  mood: string;
  intensity: number;
  durationMs: number;
  prompt: string;
  transition: {
    in: MusicTransition;
    out: MusicTransition;
  };
  isUnderscore: boolean;
  volume: number;
  styleHints: string[];
}
