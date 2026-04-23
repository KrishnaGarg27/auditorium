import { describe, it, expect, vi } from 'vitest';
import { assignVoices } from './assignVoices.js';
import type { CharacterMetadata, DramaStyle } from '../types/index.js';
import type { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import type { ElevenLabs } from '@elevenlabs/elevenlabs-js';

/** Helper to create a mock voice */
function mockVoice(overrides: Partial<ElevenLabs.Voice> & { voiceId: string }): ElevenLabs.Voice {
  return {
    name: 'Voice',
    labels: {},
    description: '',
    ...overrides,
  };
}

/** Helper to create a mock character */
function mockCharacter(overrides: Partial<CharacterMetadata> & { id: string; name: string }): CharacterMetadata {
  return {
    aliases: [],
    physicalDescription: '',
    personalityTraits: [],
    relationships: [],
    role: 'supporting',
    ...overrides,
  };
}

/** Create a mock ElevenLabsClient that returns the given voices */
function mockClient(voices: ElevenLabs.Voice[]): ElevenLabsClient {
  return {
    voices: {
      getAll: vi.fn().mockResolvedValue({ voices }),
    },
  } as unknown as ElevenLabsClient;
}

const style: DramaStyle = 'cinematic';

describe('assignVoices', () => {
  it('assigns one voice per character plus a narrator', async () => {
    const voices = [
      mockVoice({ voiceId: 'v1', labels: { gender: 'male' } }),
      mockVoice({ voiceId: 'v2', labels: { gender: 'female' } }),
      mockVoice({ voiceId: 'v3', labels: { use_case: 'narration' } }),
    ];
    const characters = [
      mockCharacter({ id: 'c1', name: 'Alice', gender: 'female' }),
      mockCharacter({ id: 'c2', name: 'Bob', gender: 'male' }),
    ];

    const result = await assignVoices(mockClient(voices), characters, style);

    expect(result).toHaveLength(3); // 2 characters + 1 narrator
    expect(result.filter((a) => a.role === 'character')).toHaveLength(2);
    expect(result.filter((a) => a.role === 'narrator')).toHaveLength(1);
  });

  it('ensures all voiceIds are unique', async () => {
    const voices = [
      mockVoice({ voiceId: 'v1' }),
      mockVoice({ voiceId: 'v2' }),
      mockVoice({ voiceId: 'v3' }),
      mockVoice({ voiceId: 'v4' }),
    ];
    const characters = [
      mockCharacter({ id: 'c1', name: 'A' }),
      mockCharacter({ id: 'c2', name: 'B' }),
      mockCharacter({ id: 'c3', name: 'C' }),
    ];

    const result = await assignVoices(mockClient(voices), characters, style);
    const voiceIds = result.map((a) => a.voiceId);
    expect(new Set(voiceIds).size).toBe(voiceIds.length);
  });

  it('narrator voice is distinct from all character voices', async () => {
    const voices = [
      mockVoice({ voiceId: 'v1' }),
      mockVoice({ voiceId: 'v2' }),
      mockVoice({ voiceId: 'v3' }),
    ];
    const characters = [
      mockCharacter({ id: 'c1', name: 'A' }),
      mockCharacter({ id: 'c2', name: 'B' }),
    ];

    const result = await assignVoices(mockClient(voices), characters, style);
    const charVoiceIds = result.filter((a) => a.role === 'character').map((a) => a.voiceId);
    const narratorVoiceId = result.find((a) => a.role === 'narrator')!.voiceId;
    expect(charVoiceIds).not.toContain(narratorVoiceId);
  });

  it('applies style-specific voice-setting baseline to characters with no trait tweaks', async () => {
    const voices = [
      mockVoice({ voiceId: 'v1' }),
      mockVoice({ voiceId: 'v2' }),
    ];
    // role 'supporting' and no age/traits => no per-character derivation tweaks
    const characters = [mockCharacter({ id: 'c1', name: 'A', role: 'supporting' })];

    const result = await assignVoices(mockClient(voices), characters, 'anime');
    const charAssignment = result.find((a) => a.role === 'character')!;
    // anime baseline, supporting role has no derivation tweaks
    expect(charAssignment.voiceSettings).toEqual({
      stability: 0.25,
      similarityBoost: 0.8,
      style: 0.6,
      speed: 1.0,
      useSpeakerBoost: true,
    });
  });

  it('applies noir style settings correctly', async () => {
    const voices = [
      mockVoice({ voiceId: 'v1' }),
      mockVoice({ voiceId: 'v2' }),
    ];
    const characters = [mockCharacter({ id: 'c1', name: 'A', role: 'supporting' })];

    const result = await assignVoices(mockClient(voices), characters, 'noir');
    const charAssignment = result.find((a) => a.role === 'character')!;
    expect(charAssignment.voiceSettings.stability).toBe(0.5);
    expect(charAssignment.voiceSettings.similarityBoost).toBe(0.75);
    expect(charAssignment.voiceSettings.style).toBe(0.4);
  });

  it('derives per-character voice settings based on role and traits', async () => {
    const voices = [
      mockVoice({ voiceId: 'v1' }),
      mockVoice({ voiceId: 'v2' }),
      mockVoice({ voiceId: 'v3' }),
    ];
    const characters = [
      mockCharacter({ id: 'c1', name: 'Hero', role: 'protagonist' }),
      mockCharacter({
        id: 'c2',
        name: 'Villain',
        role: 'antagonist',
        personalityTraits: ['menacing', 'cold'],
      }),
    ];

    const result = await assignVoices(mockClient(voices), characters, 'cinematic');
    const hero = result.find((a) => a.characterId === 'c1')!;
    const villain = result.find((a) => a.characterId === 'c2')!;

    // Antagonist with menacing/cold traits: stability +0.05 (menacing) higher style
    expect(villain.voiceSettings.style).toBeGreaterThan(hero.voiceSettings.style);
  });

  it('narrator gets more stable, less stylized settings than baseline', async () => {
    const voices = [
      mockVoice({ voiceId: 'v1' }),
      mockVoice({ voiceId: 'v2' }),
    ];
    const characters = [mockCharacter({ id: 'c1', name: 'A', role: 'supporting' })];

    const result = await assignVoices(mockClient(voices), characters, 'cinematic');
    const narrator = result.find((a) => a.role === 'narrator')!;
    // cinematic baseline: stability 0.4, style 0.5
    expect(narrator.voiceSettings.stability).toBeGreaterThan(0.4);
    expect(narrator.voiceSettings.style).toBeLessThan(0.5);
  });

  it('prefers gender-matching voices', async () => {
    const voices = [
      mockVoice({ voiceId: 'v1', labels: { gender: 'male' } }),
      mockVoice({ voiceId: 'v2', labels: { gender: 'female' } }),
      mockVoice({ voiceId: 'v3', labels: { gender: 'male' } }),
    ];
    const characters = [
      mockCharacter({ id: 'c1', name: 'Alice', gender: 'female' }),
    ];

    const result = await assignVoices(mockClient(voices), characters, style);
    const aliceAssignment = result.find((a) => a.characterId === 'c1')!;
    expect(aliceAssignment.voiceId).toBe('v2');
  });

  it('prefers narrator-labeled voices for narrator role', async () => {
    const voices = [
      mockVoice({ voiceId: 'v1', labels: { use_case: 'characters' } }),
      mockVoice({ voiceId: 'v2', labels: { use_case: 'narration' }, description: 'Great for narration' }),
      mockVoice({ voiceId: 'v3', labels: {} }),
    ];
    const characters = [
      mockCharacter({ id: 'c1', name: 'A' }),
    ];

    const result = await assignVoices(mockClient(voices), characters, style);
    const narrator = result.find((a) => a.role === 'narrator')!;
    expect(narrator.voiceId).toBe('v2');
  });

  it('throws when no voices are available', async () => {
    const characters = [mockCharacter({ id: 'c1', name: 'A' })];
    await expect(
      assignVoices(mockClient([]), characters, style),
    ).rejects.toThrow('No voices available');
  });

  it('throws when not enough voices for characters + narrator', async () => {
    const voices = [mockVoice({ voiceId: 'v1' })];
    const characters = [
      mockCharacter({ id: 'c1', name: 'A' }),
    ];
    // 1 voice for 1 character + 1 narrator = need 2, only have 1
    await expect(
      assignVoices(mockClient(voices), characters, style),
    ).rejects.toThrow('Not enough distinct voices');
  });

  it('produces deterministic assignments for same inputs', async () => {
    const voices = [
      mockVoice({ voiceId: 'v3', labels: { gender: 'male' } }),
      mockVoice({ voiceId: 'v1', labels: { gender: 'female' } }),
      mockVoice({ voiceId: 'v2', labels: { use_case: 'narration' } }),
    ];
    const characters = [
      mockCharacter({ id: 'c2', name: 'Bob', gender: 'male' }),
      mockCharacter({ id: 'c1', name: 'Alice', gender: 'female' }),
    ];

    const client = mockClient(voices);
    const result1 = await assignVoices(client, characters, style);
    const result2 = await assignVoices(client, characters, style);

    expect(result1).toEqual(result2);
  });

  it('sets narrator characterId to "narrator" and characterName to "Narrator"', async () => {
    const voices = [
      mockVoice({ voiceId: 'v1' }),
      mockVoice({ voiceId: 'v2' }),
    ];
    const characters = [mockCharacter({ id: 'c1', name: 'A' })];

    const result = await assignVoices(mockClient(voices), characters, style);
    const narrator = result.find((a) => a.role === 'narrator')!;
    expect(narrator.characterId).toBe('narrator');
    expect(narrator.characterName).toBe('Narrator');
  });

  it('applies all 10 style presets correctly', async () => {
    const allStyles: DramaStyle[] = [
      'anime', 'noir', 'horror', 'cyberpunk', 'dark-thriller',
      'fantasy-epic', 'romance', 'comedy', 'documentary', 'cinematic',
    ];
    const voices = [
      mockVoice({ voiceId: 'v1' }),
      mockVoice({ voiceId: 'v2' }),
    ];
    const characters = [mockCharacter({ id: 'c1', name: 'A' })];

    for (const s of allStyles) {
      const result = await assignVoices(mockClient(voices), characters, s);
      for (const assignment of result) {
        expect(assignment.voiceSettings.speed).toBeGreaterThanOrEqual(0.7);
        expect(assignment.voiceSettings.speed).toBeLessThanOrEqual(1.2);
        expect(assignment.voiceSettings.useSpeakerBoost).toBe(true);
        expect(assignment.voiceSettings.stability).toBeGreaterThanOrEqual(0);
        expect(assignment.voiceSettings.stability).toBeLessThanOrEqual(1);
        expect(assignment.voiceSettings.similarityBoost).toBeGreaterThanOrEqual(0);
        expect(assignment.voiceSettings.similarityBoost).toBeLessThanOrEqual(1);
        expect(assignment.voiceSettings.style).toBeGreaterThanOrEqual(0);
        expect(assignment.voiceSettings.style).toBeLessThanOrEqual(1);
      }
    }
  });
});
