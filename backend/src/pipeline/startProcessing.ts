import { v4 as uuidv4 } from 'uuid';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import type {
  StoryInput,
  DramaStyle,
  PipelineJob,
  PipelineStatus,
  PipelineStage,
  IntermediateFormat,
  AudioManifest,
  AnnotatedScene,
  Episode,
} from '../types/index.js';
import type { LLMClient } from '../ingestion/generateFromPrompt.js';
import type { AudioCache } from '../audio-generator/cache.js';
import { extractMetadata } from '../analyzer/extractMetadata.js';
import { decomposeScenes } from '../analyzer/decomposeScenes.js';
import { inferStyle } from '../analyzer/inferStyle.js';
import { organizeEpisodes } from '../analyzer/organizeEpisodes.js';
import { verifyCoherence } from '../analyzer/verifyCoherence.js';
import { adaptAllScenes } from '../scene-adapter/adaptAllScenes.js';
import { assignVoices } from '../voice-mapper/assignVoices.js';
import { generateAll } from '../audio-generator/generateAll.js';
import { mixScene } from '../audio-mixer/mixScene.js';
import { concatenateEpisode } from '../audio-mixer/concatenateEpisode.js';
import { buildSceneMixInputs } from '../audio-mixer/buildSceneMixInputs.js';
import { generateThumbnail } from '../thumbnail/generateThumbnail.js';
import { generateAIThumbnail } from '../thumbnail/generateAIThumbnail.js';
import { probeDurationMs } from '../audio-generator/probe.js';
import { updateDrama } from '../db/dramaRepository.js';
import { upsertEpisode } from '../db/dramaRepository.js';
import { getDramaDir, uploadThumbnail, uploadEpisodeAudio } from '../db/fileStorage.js';
import { PipelineStageError } from '../errors/PipelineStageError.js';

export interface ProcessingRequest {
  /**
   * ID of the Drama record created by the API route. The pipeline writes
   * its outputs (title, synopsis, episodes, status, thumbnail) back to this
   * record so the UI sees the finished drama without a second fetch.
   */
  dramaId?: string;
  storyInput: StoryInput;
  style?: DramaStyle;
  creativeMode: boolean;
}

export interface PipelineDeps {
  llmClient: LLMClient;
  elevenLabsClient: ElevenLabsClient;
  audioCache?: AudioCache;
  outputDir?: string;
}

/** In-memory store for pipeline jobs */
const jobs = new Map<string, PipelineJob>();

/** LLM stages that are retryable up to 2 times */
const LLM_STAGES: PipelineStage[] = [
  'metadata_extraction',
  'scene_decomposition',
  'scene_adaptation',
  'coherence_verification',
];

const MAX_LLM_RETRIES = 2;

/** Progress ranges for each stage (start%, end%) */
const STAGE_PROGRESS: Record<string, [number, number]> = {
  ingestion: [0, 5],
  metadata_extraction: [5, 15],
  scene_decomposition: [15, 25],
  scene_adaptation: [25, 50],
  coherence_verification: [50, 55],
  episode_organization: [55, 60],
  voice_assignment: [60, 65],
  audio_generation: [65, 85],
  audio_mixing: [85, 95],
  thumbnail_generation: [95, 100],
};

function updateJob(job: PipelineJob, updates: Partial<PipelineJob>): void {
  Object.assign(job, updates, { updatedAt: new Date().toISOString() });
}

function stageProgress(stage: string, fraction: number): number {
  const [start, end] = STAGE_PROGRESS[stage] ?? [0, 100];
  return Math.round(start + (end - start) * Math.min(1, Math.max(0, fraction)));
}

async function runWithRetry<T>(
  stage: PipelineStage,
  fn: () => Promise<T>,
): Promise<T> {
  const isLLMStage = LLM_STAGES.includes(stage);
  const maxRetries = isLLMStage ? MAX_LLM_RETRIES : 0;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        // Wait briefly before retry
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }

  const errMsg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new PipelineStageError(
    stage,
    `Failed at stage "${stage}" after ${maxRetries + 1} attempt(s)`,
    errMsg,
    false,
  );
}


/**
 * Run the full pipeline in the background.
 * Updates the job state as each stage completes.
 */
async function runPipeline(
  job: PipelineJob,
  request: ProcessingRequest,
  deps: PipelineDeps,
): Promise<void> {
  const { llmClient, elevenLabsClient, audioCache } = deps;
  let outDir = 'output'; // will be updated once dramaId is known
  let cancelled = false;

  const checkCancelled = () => {
    if (job.stage === 'failed' && job.error?.message === 'Job cancelled') {
      cancelled = true;
      throw new Error('Job cancelled');
    }
  };

  try {
    // --- Stage 1: Ingestion (already done — storyInput is passed in) ---
    updateJob(job, {
      stage: 'ingestion',
      progress: stageProgress('ingestion', 0),
      stageDetail: 'Processing story input...',
    });
    const storyInput = request.storyInput;
    updateJob(job, { progress: stageProgress('ingestion', 1) });
    checkCancelled();

    // --- Resolve style ---
    let style: DramaStyle;
    if (request.style) {
      style = request.style;
    } else {
      style = await runWithRetry('metadata_extraction', () =>
        inferStyle(storyInput, llmClient),
      );
    }
    checkCancelled();

    // --- Stage 2: Metadata extraction (Round 1) ---
    updateJob(job, {
      stage: 'metadata_extraction',
      progress: stageProgress('metadata_extraction', 0),
      stageDetail: 'Extracting story metadata...',
    });
    const metadata = await runWithRetry('metadata_extraction', () =>
      extractMetadata(storyInput, style, llmClient),
    );
    updateJob(job, { progress: stageProgress('metadata_extraction', 1) });
    checkCancelled();

    // --- Stage 3: Scene decomposition (Round 2) ---
    updateJob(job, {
      stage: 'scene_decomposition',
      progress: stageProgress('scene_decomposition', 0),
      stageDetail: 'Decomposing story into scenes...',
    });
    const sceneDecomposition = await runWithRetry('scene_decomposition', () =>
      decomposeScenes(storyInput, metadata, llmClient),
    );
    updateJob(job, { progress: stageProgress('scene_decomposition', 1) });
    checkCancelled();

    // --- Stage 4: Combined scene adaptation (Round 3) ---
    updateJob(job, {
      stage: 'scene_adaptation',
      progress: stageProgress('scene_adaptation', 0),
      stageDetail: 'Adapting scenes...',
    });
    const annotatedScript = await runWithRetry('scene_adaptation', () =>
      adaptAllScenes(
        sceneDecomposition,
        storyInput.text,
        metadata,
        style,
        request.creativeMode,
        llmClient,
        (detail: string) => {
          updateJob(job, { stageDetail: detail });
        },
      ),
    );
    updateJob(job, { progress: stageProgress('scene_adaptation', 1) });
    checkCancelled();

    // --- Stage 5: Coherence verification (Round 4) ---
    updateJob(job, {
      stage: 'coherence_verification',
      progress: stageProgress('coherence_verification', 0),
      stageDetail: 'Verifying script coherence...',
    });
    const verifiedScript = await runWithRetry('coherence_verification', () =>
      verifyCoherence(storyInput, metadata, annotatedScript, request.creativeMode, llmClient),
    );
    updateJob(job, { progress: stageProgress('coherence_verification', 1) });
    checkCancelled();

    // --- Stage 6: Episode organization ---
    updateJob(job, {
      stage: 'voice_assignment', // using voice_assignment stage slot for episode org
      progress: stageProgress('episode_organization', 0),
      stageDetail: 'Organizing episodes...',
    });
    const episodes = await organizeEpisodes(
      sceneDecomposition.scenes,
      metadata,
      llmClient,
    );

    // Assign annotated scenes to episodes using sceneIds from the organizer
    const allScenes = verifiedScript.scenes;
    const sceneById = new Map(allScenes.map((s) => [s.sceneId, s]));

    for (const episode of episodes) {
      if (episode.sceneIds.length > 0) {
        // Use the explicit scene IDs from the organizer
        episode.scenes = episode.sceneIds
          .map((id) => sceneById.get(id))
          .filter((s): s is AnnotatedScene => s != null);
      }
    }

    // Safety net: if any annotated scenes weren't assigned (e.g. ID mismatch),
    // append them to the last episode
    const assignedIds = new Set(episodes.flatMap((ep) => ep.scenes.map((s) => s.sceneId)));
    const unassigned = allScenes.filter((s) => !assignedIds.has(s.sceneId));
    if (unassigned.length > 0) {
      episodes[episodes.length - 1].scenes.push(...unassigned);
    }
    checkCancelled();

    // --- Stage 7: Voice assignment ---
    updateJob(job, {
      stage: 'voice_assignment',
      progress: stageProgress('voice_assignment', 0),
      stageDetail: 'Assigning character voices...',
    });
    const voiceAssignments = await assignVoices(
      elevenLabsClient,
      metadata.characters,
      style,
    );
    updateJob(job, { progress: stageProgress('voice_assignment', 1) });
    checkCancelled();

    // --- Build intermediate format progressively ---
    // Reuse the dramaId the API route created for this drama. Without this
    // reuse the Drama record in dramaStore never matched intermediateFormat
    // and the UI saw empty episodes forever.
    const dramaId = request.dramaId ?? uuidv4();
    outDir = getDramaDir(dramaId);
    const intermediateFormat: IntermediateFormat = {
      version: '1.0',
      dramaId,
      title: metadata.title,
      style,
      creativeMode: request.creativeMode,
      metadata,
      voiceAssignments,
      episodes,
    };
    updateJob(job, { dramaId, intermediateFormat });

    // Surface the LLM-derived title and synopsis to the UI as soon as we
    // have them — the drama card updates before audio is finished.
    await updateDrama(dramaId, {
      title: metadata.title,
      synopsis: metadata.logline,
    });

    // Persist intermediate format to disk for recovery/manual mixing
    const intermediateDir = outDir;
    await fs.promises.mkdir(intermediateDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(intermediateDir, 'intermediate.json'),
      JSON.stringify(intermediateFormat, null, 2),
    );

    // --- Stage 8: Audio generation ---
    updateJob(job, {
      stage: 'audio_generation',
      progress: stageProgress('audio_generation', 0),
      stageDetail: 'Generating audio assets...',
    });
    const audioManifest: AudioManifest = await generateAll(
      elevenLabsClient,
      intermediateFormat,
      outDir,
      (detail: string) => {
        updateJob(job, { stageDetail: detail });
      },
      audioCache,
    );
    updateJob(job, { audioManifest, progress: stageProgress('audio_generation', 1) });

    // Persist audio manifest to disk for recovery/manual mixing
    await fs.promises.writeFile(
      path.join(intermediateDir, 'audio-manifest.json'),
      JSON.stringify(audioManifest, null, 2),
    );
    checkCancelled();

    // --- Stage 9: Audio mixing ---
    updateJob(job, {
      stage: 'audio_mixing',
      progress: stageProgress('audio_mixing', 0),
      stageDetail: 'Mixing audio...',
    });
    const sceneMixInputs = buildSceneMixInputs(intermediateFormat, audioManifest);
    const scenePaths: Map<string, string> = new Map();

    for (let i = 0; i < sceneMixInputs.length; i++) {
      const input = sceneMixInputs[i];
      updateJob(job, {
        stageDetail: `Mixing scene ${i + 1} of ${sceneMixInputs.length}`,
        progress: stageProgress('audio_mixing', i / sceneMixInputs.length),
      });
      const scenePath = await mixScene(input, outDir);
      scenePaths.set(input.sceneId, scenePath);
      checkCancelled();
    }

    // Concatenate scenes into episodes and collect the output paths so the
    // Drama record can expose them to the UI.
    const finishedEpisodes: Episode[] = [];
    for (const episode of intermediateFormat.episodes) {
      const paths = episode.scenes
        .map((s) => scenePaths.get(s.sceneId))
        .filter((p): p is string => p != null);
      const localEpisodePath = await concatenateEpisode(paths, episode.id, outDir);
      const durationMs = await probeDurationMs(localEpisodePath);

      // Upload episode audio to Cloudinary
      let audioFilePath = localEpisodePath;
      try {
        audioFilePath = await uploadEpisodeAudio(dramaId, episode.id, localEpisodePath);
      } catch (uploadErr) {
        console.warn('[Pipeline] Episode upload to Cloudinary failed, using local path:', (uploadErr as Error).message);
      }

      finishedEpisodes.push({
        id: episode.id,
        dramaId,
        episodeNumber: episode.episodeNumber,
        title: episode.title,
        synopsis: episode.synopsis,
        recapNarration: episode.recapNarration,
        durationMs,
        audioFilePath,
        scenes: episode.scenes.map((s) => {
          const def = sceneDecomposition.scenes.find((sd) => sd.id === s.sceneId);
          return { sceneId: s.sceneId, title: def?.title ?? s.sceneId };
        }),
      });
    }
    updateDrama(dramaId, { episodes: finishedEpisodes });
    // Persist episodes to database
    for (const ep of finishedEpisodes) {
      await upsertEpisode(ep);
    }
    updateJob(job, { progress: stageProgress('audio_mixing', 1) });
    checkCancelled();

    // --- Stage 10: Thumbnail generation ---
    updateJob(job, {
      stage: 'thumbnail_generation',
      progress: stageProgress('thumbnail_generation', 0),
      stageDetail: 'Generating AI title card...',
    });

    let thumbnailPath: string;
    try {
      // Try AI-generated thumbnail via Replicate
      thumbnailPath = await generateAIThumbnail(dramaId, metadata, style, llmClient);
      updateJob(job, { stageDetail: 'Uploading title card...' });
      // Upload to Cloudinary
      try {
        const buffer = fs.readFileSync(thumbnailPath);
        const ext = thumbnailPath.endsWith('.webp') ? 'webp' : 'png';
        thumbnailPath = await uploadThumbnail(dramaId, buffer, ext as 'png' | 'webp');
      } catch (uploadErr) {
        console.warn('[Pipeline] Thumbnail upload to Cloudinary failed:', (uploadErr as Error).message);
      }
    } catch (aiErr) {
      // Fallback to canvas-based thumbnail
      console.warn('[Pipeline] AI thumbnail failed, falling back to canvas:', (aiErr as Error).message);
      updateJob(job, { stageDetail: 'Generating fallback thumbnail...' });
      thumbnailPath = await generateThumbnail(metadata.title, style);
      // Upload canvas thumbnail to Cloudinary
      try {
        const buffer = fs.readFileSync(thumbnailPath);
        thumbnailPath = await uploadThumbnail(dramaId, buffer, 'png');
      } catch (uploadErr) {
        console.warn('[Pipeline] Thumbnail upload to Cloudinary failed:', (uploadErr as Error).message);
      }
    }
    await updateDrama(dramaId, { thumbnailPath });
    updateJob(job, { progress: stageProgress('thumbnail_generation', 1) });

    // --- Complete ---
    await updateDrama(dramaId, { status: 'complete' });

    // Clean up local temp files — everything is in Cloudinary now
    try {
      // Remove the per-drama temp directory (intermediate JSON, scene mp3s, episode mp3s)
      const tempDir = getDramaDir(dramaId);
      if (fs.existsSync(tempDir)) {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
        console.log(`[Pipeline] Cleaned up temp dir: ${tempDir}`);
      }

      // Remove cached audio files used by this drama (TTS, SFX, music in cache/)
      if (audioManifest) {
        let cleaned = 0;
        for (const asset of audioManifest.assets) {
          if (asset.filePath && fs.existsSync(asset.filePath)) {
            try {
              await fs.promises.unlink(asset.filePath);
              cleaned++;
            } catch {
              // Non-fatal — file may already be gone
            }
          }
        }
        if (cleaned > 0) {
          console.log(`[Pipeline] Cleaned up ${cleaned} cached audio files`);
        }
      }
    } catch (cleanupErr) {
      console.warn('[Pipeline] Temp cleanup failed (non-fatal):', (cleanupErr as Error).message);
    }

    updateJob(job, {
      stage: 'complete',
      progress: 100,
      stageDetail: undefined,
    });
  } catch (err) {
    if (cancelled) return;

    const stage = job.stage;
    const errMsg = err instanceof Error ? err.message : String(err);
    const details = err instanceof PipelineStageError ? err.technicalDetails : errMsg;

    updateJob(job, {
      stage: 'failed',
      error: {
        stage,
        message: errMsg,
        retryCount: err instanceof PipelineStageError ? MAX_LLM_RETRIES : 0,
        details,
      },
    });
    if (request.dramaId) {
      await updateDrama(request.dramaId, { status: 'failed' });
    }
  }
}

/**
 * Start processing a story through the full pipeline.
 * Returns the job ID immediately; the pipeline runs in the background.
 */
export function startProcessing(
  request: ProcessingRequest,
  deps: PipelineDeps,
): string {
  const jobId = uuidv4();
  const now = new Date().toISOString();

  const job: PipelineJob = {
    id: jobId,
    dramaId: '',
    stage: 'ingestion',
    progress: 0,
    startedAt: now,
    updatedAt: now,
  };

  jobs.set(jobId, job);

  // Fire and forget — pipeline runs in the background
  runPipeline(job, request, deps).catch(() => {
    // Error already captured in job state by runPipeline
  });

  return jobId;
}

/**
 * Get the current status of a processing job.
 */
export function getStatus(jobId: string): PipelineStatus {
  const job = jobs.get(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  return {
    jobId: job.id,
    stage: job.stage,
    progress: job.progress,
    stageDetail: job.stageDetail,
    error: job.error,
  };
}

/**
 * Cancel a processing job.
 */
export function cancelJob(jobId: string): void {
  const job = jobs.get(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  if (job.stage === 'complete' || job.stage === 'failed') {
    return; // Already terminal
  }

  updateJob(job, {
    stage: 'failed',
    error: {
      stage: job.stage,
      message: 'Job cancelled',
      retryCount: 0,
      details: 'Cancelled by user',
    },
  });
}

/**
 * Get the full PipelineJob (for internal use, e.g., accessing intermediateFormat).
 */
export function getJob(jobId: string): PipelineJob | undefined {
  return jobs.get(jobId);
}

/**
 * Exposed for testing: clear all jobs.
 */
export function _clearJobs(): void {
  jobs.clear();
}
