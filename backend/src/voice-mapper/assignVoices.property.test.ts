import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { assignVoices } from './assignVoices.js';
import type { CharacterMetadata, DramaStyle, VoiceAssignment } from '../types/index.js';
import type { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

/**
 * Feature: audio-drama-engine, Property 6: Voice assignment uniqueness and consistency
 *
 * For any set of CharacterMetadata and a narrator, the Character Voice Mapper
 * must produce VoiceAssignments where:
 * (a) all voiceId values are unique across characters and narrator, and
 * (b) each characterId maps to exactly one voiceId.
 *
 * Validates: Requirements 5.1, 5.2, 5.3
 */

const ALL_STYLES: DramaStyle[] = [
  'anime', 'noir', 'dark-thriller', 'horror', 'cyberpunk',
  'fantasy-epic', 'romance', 'comedy', 'documentary', 'cinematic',
];

const ROLES: CharacterMetadata['role'][] = ['protagonist', 'antagonist', 'supporting', 'minor'];

/** Arbitrary for CharacterMetadata */
const characterArb: fc.Arbitrary<CharacterMetadata> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 20 }),
  aliases: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 3 }),
  age: fc.option(fc.constantFrom('young', 'middle-aged', 'old'), { nil: undefined }),
  gender: fc.option(fc.constantFrom('male', 'female', 'non-binary'), { nil: undefined }),
  physicalDescription: fc.string({ minLength: 0, maxLength: 50 }),
  personalityTraits: fc.array(fc.string({ minLength: 1, maxLength: 15 }), { maxLength: 4 }),
  relationships: fc.array(
    fc.record({
      characterId: fc.uuid(),
      relationship: fc.string({ minLength: 1, maxLength: 20 }),
    }),
    { maxLength: 2 },
  ),
  role: fc.constantFrom(...ROLES),
});

/** Generate 1-5 characters with unique IDs */
const charactersArb = fc
  .array(characterArb, { minLength: 1, maxLength: 5 })
  .map((chars) => {
    // Ensure unique IDs by deduplicating
    const seen = new Set<string>();
    return chars.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  })
  .filter((chars) => chars.length >= 1);

const styleArb = fc.constantFrom(...ALL_STYLES);

/** Build a mock ElevenLabsClient that returns enough unique voices */
function buildMockClient(numVoices: number): ElevenLabsClient {
  const voices = Array.from({ length: numVoices }, (_, i) => ({
    voiceId: `voice-${String(i).padStart(3, '0')}`,
    name: `Voice ${i}`,
    labels: {},
    description: '',
  }));
  return {
    voices: {
      getAll: vi.fn().mockResolvedValue({ voices }),
    },
  } as unknown as ElevenLabsClient;
}

describe('Property 6: Voice assignment uniqueness and consistency', () => {
  it('all voiceId values are unique and each character + narrator has exactly one assignment', async () => {
    await fc.assert(
      fc.asyncProperty(
        charactersArb,
        styleArb,
        async (characters: CharacterMetadata[], style: DramaStyle) => {
          const numVoicesNeeded = characters.length + 1; // characters + narrator
          const mockClient = buildMockClient(numVoicesNeeded + 2); // extra buffer

          const assignments: VoiceAssignment[] = await assignVoices(mockClient, characters, style);

          // (a) All voiceId values are unique (no duplicates)
          const voiceIds = assignments.map((a) => a.voiceId);
          expect(new Set(voiceIds).size).toBe(voiceIds.length);

          // (b) Each character has exactly one assignment
          const characterAssignments = assignments.filter((a) => a.role === 'character');
          const characterIds = characterAssignments.map((a) => a.characterId);
          expect(characterIds.length).toBe(characters.length);
          for (const char of characters) {
            const matching = characterAssignments.filter((a) => a.characterId === char.id);
            expect(matching.length).toBe(1);
          }

          // Narrator has exactly one assignment
          const narratorAssignments = assignments.filter((a) => a.role === 'narrator');
          expect(narratorAssignments.length).toBe(1);
          expect(narratorAssignments[0].characterId).toBe('narrator');

          // Narrator voiceId is distinct from all character voiceIds
          const charVoiceIds = new Set(characterAssignments.map((a) => a.voiceId));
          expect(charVoiceIds.has(narratorAssignments[0].voiceId)).toBe(false);

          // Total assignments = characters + 1 narrator
          expect(assignments.length).toBe(characters.length + 1);
        },
      ),
      { numRuns: 100 },
    );
  });
});
