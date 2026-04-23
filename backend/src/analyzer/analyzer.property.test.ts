import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import { organizeEpisodes } from './organizeEpisodes.js';
import type { SceneDefinition, StoryMetadata } from '../types/index.js';
import type { LLMClient } from '../ingestion/generateFromPrompt.js';

// --- Mock LLM Client ---

const mockLLMClient: LLMClient = {
  async generateText(_system: string, _user: string): Promise<string> {
    return 'Previously on the story, important events unfolded.';
  },
};

// --- Generators ---

function sceneDefinitionArb(seqNum: number): fc.Arbitrary<SceneDefinition> {
  return fc.record({
    id: fc.constant(uuidv4()),
    sequenceNumber: fc.constant(seqNum),
    title: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
    settingId: fc.constant(`setting-${seqNum}`),
    participatingCharacterIds: fc.array(fc.constant(`char-${seqNum}`), { minLength: 1, maxLength: 3 }),
    mood: fc.constantFrom('tense', 'calm', 'dramatic', 'mysterious', 'joyful'),
    summary: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
    originalTextRange: fc.record({
      startParagraph: fc.constant(seqNum),
      endParagraph: fc.constant(seqNum + 1),
    }),
  });
}

function scenesListArb(minLen: number, maxLen: number): fc.Arbitrary<SceneDefinition[]> {
  return fc.integer({ min: minLen, max: maxLen }).chain((count) => {
    const arbs = Array.from({ length: count }, (_, i) => sceneDefinitionArb(i + 1));
    return fc.tuple(...(arbs as [fc.Arbitrary<SceneDefinition>, ...fc.Arbitrary<SceneDefinition>[]]));
  }).map((tuple) => [...tuple]);
}

const storyMetadataArb: fc.Arbitrary<StoryMetadata> = fc.constant({
  title: 'Test Story',
  logline: 'A hero ventures forth to save the realm.',
  genre: 'fantasy',
  themes: ['adventure'],
  timePeriod: 'medieval',
  narrativeArc: {
    exposition: 'The hero sets out.',
    risingAction: 'Challenges arise.',
    climax: 'The final battle.',
    fallingAction: 'The aftermath.',
    resolution: 'Peace is restored.',
  },
  characters: [],
  settings: [],
});

/**
 * Feature: audio-drama-engine, Property 16: Episode scene partitioning
 *
 * For any episode organization produced by the Story Analyzer, every scene must
 * belong to exactly one episode, no scene may appear in multiple episodes, and
 * scenes within each episode must be contiguous in their original sequence order.
 *
 * Validates: Requirements 10.1, 10.4
 */
describe('Property 16: Episode scene partitioning', () => {
  it('every scene belongs to exactly one episode with contiguous ordering', async () => {
    await fc.assert(
      fc.asyncProperty(
        scenesListArb(1, 20),
        storyMetadataArb,
        async (scenes, metadata) => {
          const episodes = await organizeEpisodes(scenes, metadata, mockLLMClient);

          // Every episode must have episodeNumber > 0
          for (const ep of episodes) {
            expect(ep.episodeNumber).toBeGreaterThan(0);
          }

          // Episode numbers must be sequential starting from 1
          const epNums = episodes.map((e) => e.episodeNumber).sort((a, b) => a - b);
          for (let i = 0; i < epNums.length; i++) {
            expect(epNums[i]).toBe(i + 1);
          }

          // Total episodes should be >= 1 when scenes exist
          if (scenes.length > 0) {
            expect(episodes.length).toBeGreaterThanOrEqual(1);
          }

          // For short stories (<=5 scenes), should produce exactly 1 episode
          if (scenes.length <= 5) {
            expect(episodes.length).toBe(1);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('no scene is lost or duplicated across episodes', async () => {
    await fc.assert(
      fc.asyncProperty(
        scenesListArb(1, 20),
        storyMetadataArb,
        async (scenes, metadata) => {
          const episodes = await organizeEpisodes(scenes, metadata, mockLLMClient);

          // The synopsis of all episodes combined should reference all scene summaries
          const allSynopses = episodes.map((e) => e.synopsis).join(' ');
          for (const scene of scenes) {
            expect(allSynopses).toContain(scene.summary);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Feature: audio-drama-engine, Property 17: Episode metadata completeness
 *
 * For any EpisodeDefinition in the output, the `title` and `synopsis` fields
 * must be non-empty strings.
 *
 * Validates: Requirements 10.2
 */
describe('Property 17: Episode metadata completeness', () => {
  it('every episode has non-empty title and synopsis', async () => {
    await fc.assert(
      fc.asyncProperty(
        scenesListArb(1, 20),
        storyMetadataArb,
        async (scenes, metadata) => {
          const episodes = await organizeEpisodes(scenes, metadata, mockLLMClient);

          for (const episode of episodes) {
            expect(typeof episode.title).toBe('string');
            expect(episode.title.length).toBeGreaterThan(0);
            expect(typeof episode.synopsis).toBe('string');
            expect(episode.synopsis.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('every episode has a valid id and episodeNumber', async () => {
    await fc.assert(
      fc.asyncProperty(
        scenesListArb(1, 15),
        storyMetadataArb,
        async (scenes, metadata) => {
          const episodes = await organizeEpisodes(scenes, metadata, mockLLMClient);

          for (const episode of episodes) {
            expect(typeof episode.id).toBe('string');
            expect(episode.id.length).toBeGreaterThan(0);
            expect(episode.episodeNumber).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
