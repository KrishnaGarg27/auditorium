import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import type {
  SceneDecomposition,
  StoryMetadata,
  AnnotatedScene,
  DramaStyle,
} from '../types/index.js';
import type { LLMClient } from '../ingestion/generateFromPrompt.js';
import { adaptAllScenes } from './adaptAllScenes.js';

/**
 * Feature: audio-drama-engine, Property 23: Scene adaptation context passing
 *
 * Verify Scene Adapter makes N LLM calls for N scenes, each call i>0
 * includes previous scene output.
 *
 * Validates: Requirements 3.3
 */
describe('Property 23: Scene adaptation context passing', () => {
  /**
   * Generate a valid StoryMetadata with at least one character and one setting.
   */
  function makeMetadata(): StoryMetadata {
    return {
      title: 'Test Story',
      logline: 'A hero ventures forth to save the realm.',
      genre: 'fantasy',
      themes: ['adventure'],
      timePeriod: 'medieval',
      narrativeArc: {
        exposition: 'A hero sets out.',
        risingAction: 'Challenges arise.',
        climax: 'The final battle.',
        fallingAction: 'The aftermath.',
        resolution: 'Peace is restored.',
      },
      characters: [
        {
          id: 'char-1',
          name: 'Hero',
          aliases: [],
          physicalDescription: 'Tall and strong',
          personalityTraits: ['brave'],
          relationships: [],
          role: 'protagonist',
        },
      ],
      settings: [
        {
          id: 'setting-1',
          name: 'Castle',
          description: 'A grand castle',
          mood: 'majestic',
        },
      ],
    };
  }

  /**
   * Generate a SceneDecomposition with N scenes and matching story text.
   */
  function makeScenes(n: number): { scenes: SceneDecomposition; storyText: string } {
    const paragraphs: string[] = [];
    const sceneDefinitions = [];

    for (let i = 0; i < n; i++) {
      paragraphs.push(`Paragraph for scene ${i + 1}. The hero ventured forth into the unknown.`);
      sceneDefinitions.push({
        id: `scene-${i + 1}`,
        sequenceNumber: i + 1,
        title: `Scene ${i + 1}`,
        settingId: 'setting-1',
        participatingCharacterIds: ['char-1'],
        mood: 'tense',
        summary: `Summary of scene ${i + 1}`,
        originalTextRange: { startParagraph: i, endParagraph: i + 1 },
      });
    }

    return {
      scenes: { scenes: sceneDefinitions },
      storyText: paragraphs.join('\n\n'),
    };
  }

  /**
   * Build a mock AnnotatedScene JSON string for a given scene index.
   */
  function mockAnnotatedSceneJson(sceneIndex: number): string {
    const scene: AnnotatedScene = {
      sceneId: `scene-${sceneIndex + 1}`,
      elements: [
        {
          type: 'dialogue',
          id: `dlg-${sceneIndex + 1}`,
          characterId: 'char-1',
          text: 'Hello',
          expression: 'calm',
        },
      ],
      sfxCues: [],
      musicCues: [],
    };
    return JSON.stringify(scene);
  }

  it('makes exactly N LLM calls for N scenes, with correct context passing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 6 }),
        async (numScenes) => {
          const { scenes, storyText } = makeScenes(numScenes);
          const metadata = makeMetadata();
          const style: DramaStyle = 'cinematic';

          // Track all LLM calls: capture (system, user) prompts
          const calls: { system: string; user: string }[] = [];

          const mockLLM: LLMClient = {
            generateText: vi.fn(async (system: string, user: string) => {
              const callIndex = calls.length;
              calls.push({ system, user });
              return mockAnnotatedSceneJson(callIndex);
            }),
          };

          await adaptAllScenes(scenes, storyText, metadata, style, false, mockLLM);

          // Property 1: Exactly N LLM calls were made
          expect(calls.length).toBe(numScenes);

          // Property 2: First call's user prompt contains "none" for previous scene output
          expect(calls[0].user).toContain('none');

          // Property 3: Each subsequent call's user prompt contains a continuity
          // summary of the previous scene (prev sceneId + the last spoken line).
          for (let i = 1; i < numScenes; i++) {
            const previousSceneId = `scene-${i}`;
            expect(calls[i].user).toContain(previousSceneId);
            // The last dialogue line from the previous scene should be surfaced
            // as continuity context (text and character).
            expect(calls[i].user).toContain('Last line spoken');
            expect(calls[i].user).toContain('char-1');
            expect(calls[i].user).toContain('"Hello"');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
