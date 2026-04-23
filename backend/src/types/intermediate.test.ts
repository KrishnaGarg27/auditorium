import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { IntermediateFormat } from './intermediate.js';
import type { AnnotatedScene, ScriptElement, SFXCue, MusicCue } from './script.js';
import type { VoiceAssignment } from './audio.js';
import type { StoryMetadata, CharacterMetadata } from './story.js';
import type { DramaStyle, SFXDurationType, MusicTransition } from './core.js';

// --- Arbitraries ---

const dramaStyleArb: fc.Arbitrary<DramaStyle> = fc.constantFrom(
  'anime', 'noir', 'dark-thriller', 'horror', 'cyberpunk',
  'fantasy-epic', 'romance', 'comedy', 'documentary', 'cinematic'
);

const sfxDurationTypeArb: fc.Arbitrary<SFXDurationType> = fc.constantFrom('momentary', 'ambient');

const musicTransitionArb: fc.Arbitrary<MusicTransition> = fc.constantFrom(
  'fade-in', 'fade-out', 'crossfade', 'hard-cut'
);

const nonEmptyString = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);

const characterMetadataArb = (id: string): fc.Arbitrary<CharacterMetadata> =>
  fc.record({
    id: fc.constant(id),
    name: nonEmptyString,
    aliases: fc.array(nonEmptyString, { minLength: 0, maxLength: 2 }),
    age: fc.option(nonEmptyString, { nil: undefined }),
    gender: fc.option(nonEmptyString, { nil: undefined }),
    physicalDescription: nonEmptyString,
    personalityTraits: fc.array(nonEmptyString, { minLength: 1, maxLength: 3 }),
    relationships: fc.constant([]),
    role: fc.constantFrom('protagonist', 'antagonist', 'supporting', 'minor') as fc.Arbitrary<'protagonist' | 'antagonist' | 'supporting' | 'minor'>,
  });

const storyMetadataArb = (characterIds: string[]): fc.Arbitrary<StoryMetadata> =>
  fc.record({
    title: nonEmptyString,
    genre: nonEmptyString,
    themes: fc.array(nonEmptyString, { minLength: 1, maxLength: 3 }),
    timePeriod: nonEmptyString,
    narrativeArc: fc.record({
      exposition: nonEmptyString,
      risingAction: nonEmptyString,
      climax: nonEmptyString,
      fallingAction: nonEmptyString,
      resolution: nonEmptyString,
    }),
    characters: fc.tuple(
      ...characterIds.map(id => characterMetadataArb(id))
    ) as unknown as fc.Arbitrary<CharacterMetadata[]>,
    settings: fc.array(
      fc.record({
        id: nonEmptyString,
        name: nonEmptyString,
        description: nonEmptyString,
        timePeriod: fc.option(nonEmptyString, { nil: undefined }),
        mood: nonEmptyString,
      }),
      { minLength: 1, maxLength: 2 }
    ),
  });

const voiceAssignmentArb = (characterId: string, voiceId: string, role: 'character' | 'narrator'): fc.Arbitrary<VoiceAssignment> =>
  fc.record({
    characterId: fc.constant(characterId),
    characterName: nonEmptyString,
    voiceId: fc.constant(voiceId),
    voiceSettings: fc.record({
      stability: fc.double({ min: 0, max: 1, noNaN: true }),
      similarityBoost: fc.double({ min: 0, max: 1, noNaN: true }),
      style: fc.double({ min: 0, max: 1, noNaN: true }),
      speed: fc.double({ min: 0.7, max: 1.2, noNaN: true }),
      useSpeakerBoost: fc.boolean(),
    }),
    role: fc.constant(role),
  });


/**
 * Generates a valid IntermediateFormat with unique IDs across all elements.
 * Uses a counter-based ID scheme to guarantee uniqueness within the generated structure.
 */
function intermediateFormatArb(): fc.Arbitrary<IntermediateFormat> {
  return fc.record({
    numEpisodes: fc.integer({ min: 1, max: 3 }),
    scenesPerEpisode: fc.integer({ min: 1, max: 3 }),
    elementsPerScene: fc.integer({ min: 1, max: 4 }),
    sfxPerScene: fc.integer({ min: 0, max: 2 }),
    musicPerScene: fc.integer({ min: 0, max: 2 }),
    numCharacters: fc.integer({ min: 1, max: 3 }),
    style: dramaStyleArb,
    creativeMode: fc.boolean(),
  }).chain(params => {
    const characterIds = Array.from({ length: params.numCharacters }, (_, i) => `char-${i}`);
    const voiceIds = [...characterIds.map((_, i) => `voice-${i}`), 'voice-narrator'];
    const allAssignmentIds = [...characterIds, 'narrator'];

    return fc.tuple(
      storyMetadataArb(characterIds),
      fc.tuple(
        ...allAssignmentIds.map((cId, i) =>
          voiceAssignmentArb(cId, voiceIds[i], cId === 'narrator' ? 'narrator' : 'character')
        )
      ) as unknown as fc.Arbitrary<VoiceAssignment[]>,
      nonEmptyString, // title
      nonEmptyString, // dramaId
    ).map(([metadata, voiceAssignments, title, dramaId]) => {
      let idCounter = 0;
      const nextId = () => `id-${idCounter++}`;

      const episodes = Array.from({ length: params.numEpisodes }, (_, epIdx) => {
        const scenes: AnnotatedScene[] = Array.from({ length: params.scenesPerEpisode }, (_, scIdx) => {
          const elements: ScriptElement[] = Array.from({ length: params.elementsPerScene }, (_, elIdx) => {
            const elementId = nextId();
            // Alternate between dialogue, narration, and action
            const typeIdx = (elIdx) % 3;
            if (typeIdx === 0) {
              return {
                type: 'dialogue' as const,
                id: elementId,
                characterId: characterIds[elIdx % characterIds.length],
                text: `Line ${elIdx}`,
                expression: 'neutral',
              };
            } else if (typeIdx === 1) {
              return {
                type: 'narration' as const,
                id: elementId,
                text: `Narration ${elIdx}`,
                tone: 'calm',
              };
            } else {
              return {
                type: 'action' as const,
                id: elementId,
                description: `Action ${elIdx}`,
              };
            }
          });

          // Get a valid element ID for trigger references
          const firstElementId = elements[0].id;

          const sfxCues: SFXCue[] = Array.from({ length: params.sfxPerScene }, (_, sfxIdx) => {
            const durationType: SFXDurationType = sfxIdx % 2 === 0 ? 'ambient' : 'momentary';
            return {
              id: nextId(),
              description: `SFX ${sfxIdx}`,
              durationType,
              durationMs: durationType === 'ambient' ? 5000 : undefined,
              triggerAfterElementId: firstElementId,
              triggerOffsetMs: 100 * sfxIdx,
              volume: 0.6,
              source: 'inferred' as const,
            };
          });

          const musicCues: MusicCue[] = Array.from({ length: params.musicPerScene }, (_, mIdx) => ({
            id: nextId(),
            mood: 'tense',
            intensity: 0.7,
            durationMs: 30000,
            prompt: `Music ${mIdx}`,
            transition: { in: 'fade-in' as MusicTransition, out: 'fade-out' as MusicTransition },
            isUnderscore: true,
            volume: 0.3,
            styleHints: ['orchestral'],
          }));

          return {
            sceneId: `scene-${epIdx}-${scIdx}`,
            elements,
            sfxCues,
            musicCues,
          };
        });

        return {
          id: `episode-${epIdx}`,
          episodeNumber: epIdx + 1,
          title: `Episode ${epIdx + 1}`,
          synopsis: `Synopsis for episode ${epIdx + 1}`,
          sceneIds: scenes.map((s: { sceneId: string }) => s.sceneId),
          scenes,
        };
      });

      const format: IntermediateFormat = {
        version: '1.0.0',
        dramaId,
        title,
        style: params.style,
        creativeMode: params.creativeMode,
        metadata,
        voiceAssignments,
        episodes,
      };

      return format;
    });
  });
}

// --- Property Tests ---

// Feature: audio-drama-engine, Property 19: Intermediate format schema completeness
describe('Property 19: Intermediate format schema completeness', () => {
  it('every valid IntermediateFormat must contain at least one episode, each with at least one scene, each scene with at least one element, and all elements must have required fields', () => {
    fc.assert(
      fc.property(intermediateFormatArb(), (format) => {
        // Must have at least one episode
        expect(format.episodes.length).toBeGreaterThanOrEqual(1);

        for (const episode of format.episodes) {
          // Each episode must have at least one scene
          expect(episode.scenes.length).toBeGreaterThanOrEqual(1);

          for (const scene of episode.scenes) {
            // Each scene must have at least one script element
            expect(scene.elements.length).toBeGreaterThanOrEqual(1);

            for (const element of scene.elements) {
              if (element.type === 'dialogue') {
                // Dialogue must have characterId matching a voice assignment
                const matchingVoice = format.voiceAssignments.find(
                  va => va.characterId === element.characterId
                );
                expect(matchingVoice).toBeDefined();
                // Must have non-empty expression
                expect(element.expression.length).toBeGreaterThan(0);
                // Must have non-empty text
                expect(element.text.length).toBeGreaterThan(0);
              }
            }

            // Every SFX cue must have durationType and timing
            for (const sfx of scene.sfxCues) {
              expect(['momentary', 'ambient']).toContain(sfx.durationType);
              expect(sfx.triggerAfterElementId).toBeDefined();
              expect(typeof sfx.triggerOffsetMs).toBe('number');
              if (sfx.durationType === 'ambient') {
                expect(sfx.durationMs).toBeDefined();
                expect(sfx.durationMs!).toBeGreaterThan(0);
              }
            }

            // Every music cue must have mood and transition
            for (const music of scene.musicCues) {
              expect(music.mood.length).toBeGreaterThan(0);
              expect(music.transition).toBeDefined();
              expect(['fade-in', 'fade-out', 'crossfade', 'hard-cut']).toContain(music.transition.in);
              expect(['fade-in', 'fade-out', 'crossfade', 'hard-cut']).toContain(music.transition.out);
            }
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: audio-drama-engine, Property 20: Unique identifiers across all cues
describe('Property 20: Unique identifiers across all cues', () => {
  it('all id values from dialogue lines, narration lines, action cues, SFX cues, and music cues must be unique across the entire IntermediateFormat', () => {
    fc.assert(
      fc.property(intermediateFormatArb(), (format) => {
        const allIds: string[] = [];

        for (const episode of format.episodes) {
          for (const scene of episode.scenes) {
            // Collect element IDs
            for (const element of scene.elements) {
              allIds.push(element.id);
            }
            // Collect SFX cue IDs
            for (const sfx of scene.sfxCues) {
              allIds.push(sfx.id);
            }
            // Collect music cue IDs
            for (const music of scene.musicCues) {
              allIds.push(music.id);
            }
          }
        }

        // All IDs must be unique — set size equals array length
        const idSet = new Set(allIds);
        expect(idSet.size).toBe(allIds.length);
      }),
      { numRuns: 100 }
    );
  });
});
