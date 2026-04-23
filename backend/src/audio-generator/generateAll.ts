import type { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import type {
  IntermediateFormat,
  AudioManifest,
  AudioAsset,
  VoiceAssignment,
  DialogueLine,
  NarrationLine,
  SFXCue,
  MusicCue,
} from '../types/index.js';
import type { AudioCache } from './cache.js';
import { generateSpeech, generateNarration } from './generateSpeech.js';
import { generateSFX } from './generateSFX.js';
import { generateMusic } from './generateMusic.js';

/**
 * Orchestrate generation of all audio assets for an IntermediateFormat drama.
 *
 * Processes voices first (dialogue + narration including recaps), then SFX, then music.
 * Each individual generation is wrapped in try/catch so a single failure does not
 * stop the entire run. Only successfully generated assets are included in the manifest.
 */
export async function generateAll(
  client: ElevenLabsClient,
  format: IntermediateFormat,
  outputDir: string,
  onProgress: (detail: string) => void,
  cache?: AudioCache,
): Promise<AudioManifest> {
  // Build characterId → VoiceAssignment lookup
  const voiceMap = new Map<string, VoiceAssignment>();
  for (const va of format.voiceAssignments) {
    voiceMap.set(va.characterId, va);
  }
  const narratorVoice = format.voiceAssignments.find((v) => v.role === 'narrator');

  // Collect all items to generate
  const voiceItems: Array<{ line: DialogueLine | NarrationLine; voice: VoiceAssignment }> = [];
  const sfxItems: SFXCue[] = [];
  const musicItems: MusicCue[] = [];

  for (const episode of format.episodes) {
    // Recap narration for episodes 2+ that have recapNarration
    if (episode.recapNarration && narratorVoice) {
      const recapLine: NarrationLine = {
        type: 'narration',
        id: `recap-${episode.id}`,
        text: episode.recapNarration,
        tone: 'recap',
      };
      voiceItems.push({ line: recapLine, voice: narratorVoice });
    }

    for (const scene of episode.scenes) {
      // Process dialogue and narration elements
      for (const element of scene.elements) {
        if (element.type === 'dialogue') {
          const voice = voiceMap.get(element.characterId);
          if (voice) {
            voiceItems.push({ line: element, voice });
          }
        } else if (element.type === 'narration') {
          if (narratorVoice) {
            voiceItems.push({ line: element, voice: narratorVoice });
          }
        }
      }

      // Collect SFX and music cues
      sfxItems.push(...scene.sfxCues);
      musicItems.push(...scene.musicCues);
    }
  }

  const totalVoice = voiceItems.length;
  const totalSFX = sfxItems.length;
  const totalMusic = musicItems.length;

  const successfulAssets: AudioAsset[] = [];

  // --- Voice generation (dialogue + narration including recaps) ---
  for (let i = 0; i < voiceItems.length; i++) {
    const { line, voice } = voiceItems[i];
    onProgress(`Generating voice ${i + 1} of ${totalVoice}`);
    try {
      let asset: AudioAsset;
      if (line.type === 'dialogue') {
        asset = await generateSpeech(client, line as DialogueLine, voice, outputDir, cache);
      } else {
        asset = await generateNarration(client, line as NarrationLine, voice, outputDir, cache);
      }
      successfulAssets.push(asset);
    } catch (err) {
      console.warn(`Failed to generate voice for ${line.id}:`, err);
    }
  }

  // --- SFX generation ---
  for (let i = 0; i < sfxItems.length; i++) {
    const cue = sfxItems[i];
    onProgress(`Generating sound effect ${i + 1} of ${totalSFX}`);
    try {
      const asset = await generateSFX(client, cue, outputDir, cache);
      successfulAssets.push(asset);
    } catch (err) {
      console.warn(`Failed to generate SFX for ${cue.id}:`, err);
    }
  }

  // --- Music generation ---
  for (let i = 0; i < musicItems.length; i++) {
    const cue = musicItems[i];
    onProgress(`Generating music track ${i + 1} of ${totalMusic}`);
    try {
      const asset = await generateMusic(client, cue, outputDir, cache);
      successfulAssets.push(asset);
    } catch (err) {
      console.warn(`Failed to generate music for ${cue.id}:`, err);
    }
  }

  return {
    dramaId: format.dramaId,
    assets: successfulAssets,
    generatedAt: new Date().toISOString(),
  };
}
