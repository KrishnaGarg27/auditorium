/**
 * Integration tests for the Audio Drama Engine pipeline.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 8.1, 8.2, 8.3, 9.1, 2.4, 10.5, 13.4, 14.2, 14.8
 */
import { describe, it, expect, vi, afterAll } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { adaptAllScenes } from '../scene-adapter/adaptAllScenes.js';
import { buildSceneAdaptationPrompt } from '../scene-adapter/buildPrompt.js';
import { buildFilterGraph } from '../audio-mixer/mixScene.js';
import { organizeEpisodes } from '../analyzer/organizeEpisodes.js';
import {
  STYLE_PRESETS,
  type DramaStyle,
  type SceneDefinition,
  type SceneDecomposition,
  type StoryMetadata,
  type AnnotatedScene,
  type IntermediateFormat,
  type SceneMixInput,
  type StylePreset,
} from '../types/index.js';
import type { LLMClient } from '../ingestion/generateFromPrompt.js';

// Mock node:fs for filter graph tests (same pattern as audio-mixer tests)
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn((p: string) => {
      if (typeof p === 'string' && (p.startsWith('/test/') || p.includes('tmp'))) return true;
      return actual.existsSync(p);
    }),
  };
});

// --- Shared test fixtures ---

const metadata: StoryMetadata = {
  title: 'Test Story',
  logline: 'A hero ventures forth to save the realm.',
  genre: 'fantasy',
  themes: ['adventure'],
  timePeriod: 'medieval',
  narrativeArc: {
    exposition: 'A hero appears',
    risingAction: 'Challenges arise',
    climax: 'The final battle',
    fallingAction: 'Aftermath',
    resolution: 'Peace restored',
  },
  characters: [
    {
      id: 'char-1',
      name: 'Hero',
      aliases: [],
      physicalDescription: 'Tall warrior',
      personalityTraits: ['brave'],
      relationships: [],
      role: 'protagonist' as const,
    },
    {
      id: 'char-2',
      name: 'Villain',
      aliases: [],
      physicalDescription: 'Dark figure',
      personalityTraits: ['cunning'],
      relationships: [],
      role: 'antagonist' as const,
    },
  ],
  settings: [{ id: 'setting-1', name: 'Castle', description: 'Grand castle', mood: 'majestic' }],
};

function makeScene(id: string, seq: number): SceneDefinition {
  return {
    id,
    sequenceNumber: seq,
    title: `Scene ${seq}`,
    settingId: 'setting-1',
    participatingCharacterIds: ['char-1'],
    mood: 'tense',
    summary: `Events of scene ${seq}`,
    originalTextRange: { startParagraph: seq - 1, endParagraph: seq },
  };
}

function makeAnnotatedScene(sceneId: string): AnnotatedScene {
  return {
    sceneId,
    elements: [
      { type: 'dialogue', id: `dlg-${sceneId}`, characterId: 'char-1', text: 'Hello', expression: 'calm' },
    ],
    sfxCues: [
      {
        id: `sfx-${sceneId}`,
        description: 'Door creak',
        durationType: 'momentary',
        triggerAfterElementId: `dlg-${sceneId}`,
        triggerOffsetMs: 0,
        volume: 0.5,
        source: 'inferred',
      },
    ],
    musicCues: [
      {
        id: `mus-${sceneId}`,
        mood: 'tense',
        intensity: 0.6,
        durationMs: 10000,
        prompt: 'Tense orchestral underscore',
        transition: { in: 'fade-in', out: 'fade-out' },
        isUnderscore: true,
        volume: 0.3,
        styleHints: ['orchestral'],
      },
    ],
  };
}

const storyText = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.';

// ─── 1. Scene adaptation context passing (mock LLM) ───

describe('Scene adaptation context passing', () => {
  it('calls LLM for each scene with correct context passing', async () => {
    const scenes: SceneDecomposition = {
      scenes: [makeScene('s1', 1), makeScene('s2', 2), makeScene('s3', 3)],
    };

    const mockLLM: LLMClient = {
      generateText: vi.fn()
        .mockResolvedValueOnce(JSON.stringify(makeAnnotatedScene('s1')))
        .mockResolvedValueOnce(JSON.stringify(makeAnnotatedScene('s2')))
        .mockResolvedValueOnce(JSON.stringify(makeAnnotatedScene('s3'))),
    };

    const result = await adaptAllScenes(scenes, storyText, metadata, 'cinematic', false, mockLLM);

    // 3 scenes → 3 LLM calls
    expect(mockLLM.generateText).toHaveBeenCalledTimes(3);
    expect(result.scenes).toHaveLength(3);

    // First call: no previous context (prompt contains "none")
    const firstCallArgs = (mockLLM.generateText as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(firstCallArgs[1]).toContain('none');

    // Second call: includes scene s1 output as previous context
    const secondCallArgs = (mockLLM.generateText as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(secondCallArgs[1]).toContain('"sceneId": "s1"');

    // Third call: includes scene s2 output as previous context
    const thirdCallArgs = (mockLLM.generateText as ReturnType<typeof vi.fn>).mock.calls[2];
    expect(thirdCallArgs[1]).toContain('"sceneId": "s2"');
  });
});

// ─── 2. Style preset injection into LLM prompts ───

describe('Style preset injection into LLM prompts', () => {
  const allStyles: DramaStyle[] = [
    'anime', 'noir', 'dark-thriller', 'horror', 'cyberpunk',
    'fantasy-epic', 'romance', 'comedy', 'documentary', 'cinematic',
  ];

  const scene = makeScene('s1', 1);

  it.each(allStyles)('injects all style preset fields for style "%s"', (style) => {
    const preset = STYLE_PRESETS[style];
    const { userPrompt } = buildSceneAdaptationPrompt(
      scene,
      'Some raw text.',
      metadata,
      preset,
      null,
      false,
    );

    expect(userPrompt).toContain(`Style Preset: ${style}`);
    expect(userPrompt).toContain(preset.narration_style);
    expect(userPrompt).toContain(preset.dialogue_style);
    expect(userPrompt).toContain(preset.music_preferences);
    expect(userPrompt).toContain(preset.ambient_preferences);
    expect(userPrompt).toContain(preset.sfx_style);
    expect(userPrompt).toContain(preset.pacing);
    expect(userPrompt).toContain(preset.voice_aesthetic);
  });
});

// ─── 3. Creative mode changes adaptation prompts ───

describe('Creative mode changes adaptation prompts', () => {
  const scene = makeScene('s1', 1);
  const preset = STYLE_PRESETS['cinematic'];

  it('creative mode ON includes creative instructions', () => {
    const { systemPrompt } = buildSceneAdaptationPrompt(
      scene, 'Text.', metadata, preset, null, true,
    );

    expect(systemPrompt).toContain('Creative Mode: ENABLED');
    expect(systemPrompt).toContain('Rephrase dialogue');
    expect(systemPrompt).toContain('mood-driven SFX');
    expect(systemPrompt).toContain('Score scenes with music more liberally');
  });

  it('creative mode OFF includes standard instructions', () => {
    const { systemPrompt } = buildSceneAdaptationPrompt(
      scene, 'Text.', metadata, preset, null, false,
    );

    expect(systemPrompt).toContain('Creative Mode: DISABLED');
    expect(systemPrompt).toContain('Stay faithful to the source');
    expect(systemPrompt).not.toContain('Creative Mode: ENABLED');
  });
});

// ─── 4. Granular progress callbacks from Audio Generator ───

describe('Granular progress callbacks from Audio Generator', () => {
  function fakeAudioStream(): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([0xFF, 0xFB, 0x90, 0x00]));
        controller.close();
      },
    });
  }

  // We need to test generateAll directly, but it calls generateSpeech/generateSFX/generateMusic
  // which use withRetry. We mock the entire sub-modules to avoid retry complexity.
  it('fires progress callbacks for each voice, SFX, and music item', async () => {
    // Dynamically import generateAll so mocks are in place
    const { generateAll } = await import('../audio-generator/generateAll.js');

    const mockClient = {
      textToSpeech: {
        convert: vi.fn().mockImplementation(() => Promise.resolve(fakeAudioStream())),
      },
      textToSoundEffects: {
        convert: vi.fn().mockImplementation(() => Promise.resolve(fakeAudioStream())),
      },
      music: {
        compose: vi.fn().mockImplementation(() => Promise.resolve(fakeAudioStream())),
      },
    } as unknown as ElevenLabsClient;

    const format: IntermediateFormat = {
      version: '1.0',
      dramaId: 'drama-1',
      title: 'Test',
      style: 'cinematic',
      creativeMode: false,
      metadata,
      voiceAssignments: [
        {
          characterId: 'char-1',
          characterName: 'Hero',
          voiceId: 'voice-1',
          voiceSettings: { stability: 0.5, similarityBoost: 0.5, style: 0.5, speed: 1.0, useSpeakerBoost: false },
          role: 'character',
        },
        {
          characterId: 'narrator',
          characterName: 'Narrator',
          voiceId: 'voice-narrator',
          voiceSettings: { stability: 0.5, similarityBoost: 0.5, style: 0.5, speed: 1.0, useSpeakerBoost: false },
          role: 'narrator',
        },
      ],
      episodes: [
        {
          id: 'ep-1',
          episodeNumber: 1,
          title: 'Episode 1',
          synopsis: 'Test',
          sceneIds: ['scene-1'],
          scenes: [
            {
              sceneId: 'scene-1',
              elements: [
                { type: 'dialogue', id: 'dlg-1', characterId: 'char-1', text: 'Hello world', expression: 'calm' },
                { type: 'dialogue', id: 'dlg-2', characterId: 'char-1', text: 'Goodbye', expression: 'sad' },
              ],
              sfxCues: [
                {
                  id: 'sfx-1',
                  description: 'Thunder rumble',
                  durationType: 'momentary' as const,
                  triggerAfterElementId: 'dlg-1',
                  triggerOffsetMs: 0,
                  volume: 0.5,
                  source: 'explicit' as const,
                },
              ],
              musicCues: [
                {
                  id: 'mus-1',
                  mood: 'tense',
                  intensity: 0.7,
                  durationMs: 15000,
                  prompt: 'Dark orchestral tension',
                  transition: { in: 'fade-in' as const, out: 'fade-out' as const },
                  isUnderscore: true,
                  volume: 0.3,
                  styleHints: ['orchestral'],
                },
              ],
            },
          ],
        },
      ],
    };

    const tmpDir = path.join(os.tmpdir(), `integration-test-${Date.now()}`);
    const progressMessages: string[] = [];

    try {
      await generateAll(
        mockClient,
        format,
        tmpDir,
        (detail) => progressMessages.push(detail),
      );
    } catch {
      // generateAll may fail on file writes in some environments; we only care about progress
    }

    expect(progressMessages).toContain('Generating voice 1 of 2');
    expect(progressMessages).toContain('Generating voice 2 of 2');
    expect(progressMessages).toContain('Generating sound effect 1 of 1');
    expect(progressMessages).toContain('Generating music track 1 of 1');

    // Cleanup
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });
});

// ─── 5. FFmpeg filter graph construction ───

describe('FFmpeg filter graph construction', () => {
  it('builds correct filter_complex for dialogue, SFX, and music tracks', () => {
    const input: SceneMixInput = {
      sceneId: 'scene-mix-1',
      dialogueTracks: [
        { assetPath: '/test/dlg1.mp3', startTimeMs: 0, durationMs: 5000, volume: 1.0 },
        { assetPath: '/test/dlg2.mp3', startTimeMs: 5000, durationMs: 3000, volume: 1.0 },
      ],
      sfxTracks: [
        { assetPath: '/test/sfx1.mp3', startTimeMs: 1000, durationMs: 2000, volume: 0.6 },
      ],
      musicTracks: [
        { assetPath: '/test/mus1.mp3', startTimeMs: 0, durationMs: 10000, volume: 0.3, transition: 'fade-in' },
      ],
    };

    const { filterComplex, inputArgs, streamCount } = buildFilterGraph(input);

    // 4 streams total
    expect(streamCount).toBe(4);

    // Should have 4 input files
    const inputFileCount = inputArgs.filter((a) => a === '-i').length;
    expect(inputFileCount).toBe(4);

    // Dialogue at volume=1
    expect(filterComplex).toContain('volume=1');
    // SFX at volume=0.6
    expect(filterComplex).toContain('volume=0.6');
    // Music at volume=0.3
    expect(filterComplex).toContain('volume=0.3');
    // Music fade-in transition
    expect(filterComplex).toContain('afade=t=in');
    // amix with 4 inputs
    expect(filterComplex).toContain('amix=inputs=4');
  });
});

// ─── 6. Recap narration for episodes 2+ ───

describe('Recap narration for episodes 2+', () => {
  it('episode 1 has no recapNarration, episodes 2+ have recapNarration', async () => {
    // Create 8 scenes to trigger multi-episode organization (>5 scenes)
    const scenes: SceneDefinition[] = [];
    for (let i = 1; i <= 8; i++) {
      scenes.push(makeScene(`scene-${i}`, i));
    }

    const mockLLM: LLMClient = {
      generateText: vi.fn().mockResolvedValue('Previously on Test Story, the hero faced great challenges.'),
    };

    const episodes = await organizeEpisodes(scenes, metadata, mockLLM);

    // Should produce multiple episodes
    expect(episodes.length).toBeGreaterThanOrEqual(2);

    // Episode 1 should NOT have recapNarration
    expect(episodes[0].recapNarration).toBeUndefined();

    // Episodes 2+ should have recapNarration
    for (let i = 1; i < episodes.length; i++) {
      expect(episodes[i].recapNarration).toBeDefined();
      expect(typeof episodes[i].recapNarration).toBe('string');
      expect(episodes[i].recapNarration!.length).toBeGreaterThan(0);
    }
  });

  it('single episode (≤5 scenes) has no recapNarration', async () => {
    const scenes: SceneDefinition[] = [];
    for (let i = 1; i <= 4; i++) {
      scenes.push(makeScene(`scene-${i}`, i));
    }

    const mockLLM: LLMClient = {
      generateText: vi.fn(),
    };

    const episodes = await organizeEpisodes(scenes, metadata, mockLLM);

    expect(episodes).toHaveLength(1);
    expect(episodes[0].recapNarration).toBeUndefined();
    // LLM should not be called for recap when there's only 1 episode
    expect(mockLLM.generateText).not.toHaveBeenCalled();
  });
});
