import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { ingestFile } from '../ingestion/ingestFile.js';
import { generateFromPrompt } from '../ingestion/generateFromPrompt.js';
import {
  startProcessing,
} from '../pipeline/index.js';
import type { PipelineDeps } from '../pipeline/index.js';
import { StoryIngestionError } from '../errors/index.js';
import type { DramaStyle, Drama } from '../types/index.js';
import {
  getAllDramas,
  getDrama,
  getDramaAsync,
  createDrama,
  updateDrama,
  refreshDramaCache,
} from '../db/dramaRepository.js';

const VALID_STYLES: DramaStyle[] = [
  'anime', 'noir', 'dark-thriller', 'horror', 'cyberpunk',
  'fantasy-epic', 'romance', 'comedy', 'documentary', 'cinematic',
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

export function createDramaRoutes(deps: PipelineDeps): Router {
  const router = Router();

  // POST /api/dramas — Submit story (file upload or prompt)
  router.post('/', upload.single('file'), async (req, res) => {
    try {
      const style = req.body?.style as DramaStyle | undefined;
      const creativeMode = req.body?.creativeMode === 'true' || req.body?.creativeMode === true;

      if (style && !VALID_STYLES.includes(style)) {
        res.status(400).json({ error: `Invalid style. Must be one of: ${VALID_STYLES.join(', ')}` });
        return;
      }

      let storyInput;

      if (req.file) {
        // File upload path
        storyInput = await ingestFile(req.file.buffer, req.file.originalname);
      } else if (req.body?.prompt) {
        // Prompt-based generation
        storyInput = await generateFromPrompt(
          req.body.prompt,
          deps.llmClient,
          { style, lengthPreference: req.body.lengthPreference },
        );
      } else {
        res.status(400).json({ error: 'Either a file upload or a prompt is required.' });
        return;
      }

      // Create drama record
      const dramaId = uuidv4();
      const drama: Drama = {
        id: dramaId,
        title: storyInput.title ?? 'Untitled Drama',
        style: style ?? 'cinematic',
        creativeMode,
        source: storyInput.source,
        status: 'processing',
        createdAt: new Date().toISOString(),
        episodes: [],
      };
      await createDrama(drama);

      // Start pipeline — pass the dramaId so the pipeline can update the
      // same record the UI is reading from. Without this, the pipeline would
      // generate its own UUID internally and the Drama.episodes array would
      // stay empty forever.
      const jobId = startProcessing(
        { dramaId, storyInput, style, creativeMode },
        deps,
      );

      res.status(201).json({
        dramaId,
        jobId,
        status: 'processing',
      });
    } catch (err) {
      if (err instanceof StoryIngestionError) {
        res.status(400).json({ error: err.message, code: err.code });
        return;
      }
      const message = err instanceof Error ? err.message : 'Internal server error';
      res.status(500).json({ error: message });
    }
  });

  // GET /api/dramas — List all dramas
  router.get('/', async (_req, res) => {
    try {
      await refreshDramaCache();
      const dramas = getAllDramas().map((d) => ({
        id: d.id,
        title: d.title,
        synopsis: d.synopsis,
        style: d.style,
        status: d.status,
        episodeCount: d.episodes.length,
        thumbnailPath: d.thumbnailPath,
        createdAt: d.createdAt,
      }));
      res.json(dramas);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // GET /api/dramas/:id — Get drama details including episodes
  router.get('/:id', async (req, res) => {
    const drama = await getDramaAsync(req.params.id);
    if (!drama) {
      res.status(404).json({ error: 'Drama not found' });
      return;
    }
    res.json(drama);
  });

  return router;
}
