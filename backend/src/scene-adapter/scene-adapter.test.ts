import { describe, it, expect } from 'vitest';
import { buildSceneAdaptationPrompt } from './buildPrompt.js';
import { STYLE_PRESETS } from '../types/index.js';
import type { SceneDefinition, StoryMetadata, AnnotatedScene } from '../types/index.js';

const sceneDefinition: SceneDefinition = {
  id: 'scene-1',
  sequenceNumber: 1,
  title: 'The Beginning',
  settingId: 'setting-1',
  participatingCharacterIds: ['char-1'],
  mood: 'tense',
  summary: 'The hero arrives',
  originalTextRange: { startParagraph: 0, endParagraph: 1 },
};

const metadata: StoryMetadata = {
  title: 'Test Story',
  logline: 'A hero ventures forth to save the realm.',
  genre: 'fantasy',
  themes: ['adventure'],
  timePeriod: 'medieval',
  narrativeArc: {
    exposition: 'A',
    risingAction: 'B',
    climax: 'C',
    fallingAction: 'D',
    resolution: 'E',
  },
  characters: [
    {
      id: 'char-1',
      name: 'Hero',
      aliases: [],
      physicalDescription: 'Tall',
      personalityTraits: ['brave'],
      relationships: [],
      role: 'protagonist' as const,
    },
  ],
  settings: [{ id: 'setting-1', name: 'Castle', description: 'Grand', mood: 'majestic' }],
};

const sceneRawText = 'The hero walked through the castle gates.';

describe('buildSceneAdaptationPrompt', () => {
  it('creative mode ON includes creative instructions in system prompt', () => {
    const { systemPrompt } = buildSceneAdaptationPrompt(
      sceneDefinition,
      sceneRawText,
      metadata,
      STYLE_PRESETS['cinematic'],
      null,
      true
    );

    expect(systemPrompt).toContain('Creative Mode: ENABLED');
    expect(systemPrompt).toContain('Rephrase dialogue');
    expect(systemPrompt).toContain('mood-driven SFX');
    expect(systemPrompt).toContain('source: "creative"');
  });

  it('creative mode OFF includes faithful adaptation instructions', () => {
    const { systemPrompt } = buildSceneAdaptationPrompt(
      sceneDefinition,
      sceneRawText,
      metadata,
      STYLE_PRESETS['cinematic'],
      null,
      false
    );

    expect(systemPrompt).toContain('Creative Mode: DISABLED');
    expect(systemPrompt).toContain('Stay faithful to the source');
    expect(systemPrompt).not.toContain('Creative Mode: ENABLED');
  });

  it('style preset fields are injected into user prompt', () => {
    const noirPreset = STYLE_PRESETS['noir'];
    const { userPrompt } = buildSceneAdaptationPrompt(
      sceneDefinition,
      sceneRawText,
      metadata,
      noirPreset,
      null,
      false
    );

    expect(userPrompt).toContain('Style Preset: noir');
    expect(userPrompt).toContain(noirPreset.narration_style);
    expect(userPrompt).toContain(noirPreset.dialogue_style);
    expect(userPrompt).toContain(noirPreset.music_preferences);
    expect(userPrompt).toContain(noirPreset.ambient_preferences);
    expect(userPrompt).toContain(noirPreset.sfx_style);
    expect(userPrompt).toContain(noirPreset.pacing);
    expect(userPrompt).toContain(noirPreset.voice_aesthetic);
  });

  it('first scene receives "none" as previous context', () => {
    const { userPrompt } = buildSceneAdaptationPrompt(
      sceneDefinition,
      sceneRawText,
      metadata,
      STYLE_PRESETS['cinematic'],
      null,
      false
    );

    const previousSection = userPrompt.split('## Previous Scene Continuity')[1]?.split('##')[0];
    expect(previousSection).toBeDefined();
    expect(previousSection!.trim()).toMatch(/^none/);
  });

  it('subsequent scene receives previous scene summary', () => {
    const previousScene: AnnotatedScene = {
      sceneId: 'scene-0',
      elements: [
        { type: 'narration', id: 'n-1', text: 'Once upon a time', tone: 'dramatic' },
      ],
      sfxCues: [],
      musicCues: [],
    };

    const { userPrompt } = buildSceneAdaptationPrompt(
      sceneDefinition,
      sceneRawText,
      metadata,
      STYLE_PRESETS['cinematic'],
      previousScene,
      false
    );

    expect(userPrompt).toContain('"sceneId": "scene-0"');
    expect(userPrompt).toContain('Once upon a time');
  });
});
