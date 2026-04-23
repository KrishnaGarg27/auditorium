import { describe, it, expect } from 'vitest';
import { inferStyle } from './inferStyle.js';
import { organizeEpisodes } from './organizeEpisodes.js';
import { verifyCoherence } from './verifyCoherence.js';
import type { LLMClient } from '../ingestion/generateFromPrompt.js';
import type { StoryInput, SceneDefinition, StoryMetadata, AnnotatedScript, DramaStyle } from '../types/index.js';

// --- Helpers ---

function makeLLMClient(response: string): LLMClient {
  return {
    async generateText(_system: string, _user: string): Promise<string> {
      return response;
    },
  };
}

function makeCapturingLLMClient(response: string): { client: LLMClient; calls: Array<{ system: string; user: string }> } {
  const calls: Array<{ system: string; user: string }> = [];
  return {
    calls,
    client: {
      async generateText(system: string, user: string): Promise<string> {
        calls.push({ system, user });
        return response;
      },
    },
  };
}

const sampleStory: StoryInput = {
  id: 'story-1',
  text: 'A dark detective walked through the rain-soaked streets of the city.',
  source: 'upload',
};

const sampleMetadata: StoryMetadata = {
  title: 'Rain City',
  logline: 'A burned-out PI chases a missing client through a rain-soaked city.',
  genre: 'noir',
  themes: ['mystery', 'corruption'],
  timePeriod: '1940s',
  narrativeArc: {
    exposition: 'Detective arrives.',
    risingAction: 'Clues emerge.',
    climax: 'Confrontation.',
    fallingAction: 'Truth revealed.',
    resolution: 'Justice served.',
  },
  characters: [],
  settings: [],
};

function makeScene(seqNum: number): SceneDefinition {
  return {
    id: `scene-${seqNum}`,
    sequenceNumber: seqNum,
    title: `Scene ${seqNum}`,
    settingId: 'setting-1',
    participatingCharacterIds: ['char-1'],
    mood: 'tense',
    summary: `Summary of scene ${seqNum}`,
    originalTextRange: { startParagraph: seqNum, endParagraph: seqNum + 1 },
  };
}

// --- Tests ---

describe('inferStyle', () => {
  const validStyles: DramaStyle[] = [
    'anime', 'noir', 'dark-thriller', 'horror', 'cyberpunk',
    'fantasy-epic', 'romance', 'comedy', 'documentary', 'cinematic'
  ];

  it('should return a valid DramaStyle when LLM returns a known style', async () => {
    for (const style of validStyles) {
      const client = makeLLMClient(style);
      const result = await inferStyle(sampleStory, client);
      expect(validStyles).toContain(result);
      expect(result).toBe(style);
    }
  });

  it('should handle LLM response with extra whitespace', async () => {
    const client = makeLLMClient('  noir  \n');
    const result = await inferStyle(sampleStory, client);
    expect(result).toBe('noir');
  });

  it('should handle case-insensitive LLM response', async () => {
    const client = makeLLMClient('HORROR');
    const result = await inferStyle(sampleStory, client);
    expect(result).toBe('horror');
  });

  it('should fallback to cinematic for unrecognized style', async () => {
    const client = makeLLMClient('romantic-comedy');
    const result = await inferStyle(sampleStory, client);
    expect(result).toBe('cinematic');
    expect(validStyles).toContain(result);
  });
});

describe('organizeEpisodes', () => {
  it('should produce a single episode for a short story (<=5 scenes)', async () => {
    const scenes = [makeScene(1), makeScene(2), makeScene(3)];
    const client = makeLLMClient('Previously on Rain City...');
    const episodes = await organizeEpisodes(scenes, sampleMetadata, client);

    expect(episodes).toHaveLength(1);
    expect(episodes[0].episodeNumber).toBe(1);
    expect(episodes[0].title).toBeTruthy();
    expect(episodes[0].synopsis).toBeTruthy();
  });

  it('should produce a single episode for exactly 5 scenes', async () => {
    const scenes = Array.from({ length: 5 }, (_, i) => makeScene(i + 1));
    const client = makeLLMClient('Previously on Rain City...');
    const episodes = await organizeEpisodes(scenes, sampleMetadata, client);
    expect(episodes).toHaveLength(1);
  });

  it('should produce multiple episodes for stories with more than 5 scenes', async () => {
    const scenes = Array.from({ length: 12 }, (_, i) => makeScene(i + 1));
    const client = makeLLMClient('Previously on Rain City...');
    const episodes = await organizeEpisodes(scenes, sampleMetadata, client);
    expect(episodes.length).toBeGreaterThan(1);
  });

  it('should return empty array for empty scenes', async () => {
    const client = makeLLMClient('Previously on Rain City...');
    const episodes = await organizeEpisodes([], sampleMetadata, client);
    expect(episodes).toHaveLength(0);
  });

  it('should assign sequential episode numbers', async () => {
    const scenes = Array.from({ length: 10 }, (_, i) => makeScene(i + 1));
    const client = makeLLMClient('Previously on Rain City...');
    const episodes = await organizeEpisodes(scenes, sampleMetadata, client);
    for (let i = 0; i < episodes.length; i++) {
      expect(episodes[i].episodeNumber).toBe(i + 1);
    }
  });

  it('should NOT have recapNarration on episode 1', async () => {
    const scenes = Array.from({ length: 12 }, (_, i) => makeScene(i + 1));
    const client = makeLLMClient('Previously on Rain City, the detective found a clue.');
    const episodes = await organizeEpisodes(scenes, sampleMetadata, client);

    expect(episodes.length).toBeGreaterThan(1);
    expect(episodes[0].recapNarration).toBeUndefined();
  });

  it('should have recapNarration on episodes 2+', async () => {
    const scenes = Array.from({ length: 12 }, (_, i) => makeScene(i + 1));
    const recapText = 'Previously on Rain City, the detective found a clue.';
    const client = makeLLMClient(recapText);
    const episodes = await organizeEpisodes(scenes, sampleMetadata, client);

    expect(episodes.length).toBeGreaterThan(1);
    for (let i = 1; i < episodes.length; i++) {
      expect(episodes[i].recapNarration).toBe(recapText);
    }
  });
});

describe('verifyCoherence', () => {
  const sampleScript: AnnotatedScript = {
    scenes: [
      {
        sceneId: 'scene-1',
        elements: [
          { type: 'dialogue', id: 'dl-1', characterId: 'char-1', text: 'Hello', expression: 'calm' },
        ],
        sfxCues: [],
        musicCues: [],
      },
    ],
  };

  it('should return a VerifiedScript with verified=true', async () => {
    const client = makeLLMClient(JSON.stringify({ issues: [] }));
    const result = await verifyCoherence(sampleStory, sampleMetadata, sampleScript, false, client);

    expect(result.verified).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.scenes).toEqual(sampleScript.scenes);
  });

  it('should include creative fidelity check in prompt when creativeMode is on', async () => {
    const { client, calls } = makeCapturingLLMClient(JSON.stringify({ issues: [] }));

    await verifyCoherence(sampleStory, sampleMetadata, sampleScript, true, client);

    expect(calls).toHaveLength(1);
    expect(calls[0].system).toContain('Creative appropriateness');
  });

  it('should NOT include creative fidelity check when creativeMode is off', async () => {
    const { client, calls } = makeCapturingLLMClient(JSON.stringify({ issues: [] }));

    await verifyCoherence(sampleStory, sampleMetadata, sampleScript, false, client);

    expect(calls).toHaveLength(1);
    expect(calls[0].system).not.toContain('Creative appropriateness');
  });

  it('should return issues when LLM detects problems', async () => {
    const issues = [
      { type: 'information-loss' as const, description: 'Missing subplot', severity: 'medium' as const },
    ];
    const client = makeLLMClient(JSON.stringify({ issues }));
    const result = await verifyCoherence(sampleStory, sampleMetadata, sampleScript, false, client);

    expect(result.verified).toBe(true);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe('information-loss');
  });
});
