import { Router } from 'express';
import { createReadStream, existsSync, statSync } from 'fs';
import { getStatus } from '../pipeline/index.js';
import { getDramaAsync, getEpisode } from '../db/dramaRepository.js';

export function createStatusRoutes(): Router {
  const router = Router();

  // GET /api/dramas/:id/status — Return current PipelineStatus including stageDetail
  router.get('/:id/status', async (req, res) => {
    const drama = await getDramaAsync(req.params.id);
    if (!drama) {
      res.status(404).json({ error: 'Drama not found' });
      return;
    }

    const jobId = req.query.jobId as string | undefined;
    if (!jobId) {
      res.json({ dramaId: drama.id, status: drama.status });
      return;
    }

    try {
      const status = getStatus(jobId);
      res.json(status);
    } catch {
      res.status(404).json({ error: 'Job not found' });
    }
  });

  // GET /api/dramas/:id/thumbnail — Redirect to Cloudinary URL or serve local file
  router.get('/:id/thumbnail', async (req, res) => {
    const drama = await getDramaAsync(req.params.id);
    if (!drama || !drama.thumbnailPath) {
      res.status(404).json({ error: 'Thumbnail not found' });
      return;
    }

    const thumbPath = drama.thumbnailPath;

    // If it's a URL (Cloudinary), redirect
    if (thumbPath.startsWith('http://') || thumbPath.startsWith('https://')) {
      res.redirect(301, thumbPath);
      return;
    }

    // Local file fallback
    if (!existsSync(thumbPath)) {
      res.status(404).json({ error: 'Thumbnail file not found' });
      return;
    }

    const ext = thumbPath.endsWith('.webp') ? 'webp' : 'png';
    const contentType = ext === 'webp' ? 'image/webp' : 'image/png';
    const stat = statSync(thumbPath);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    createReadStream(thumbPath).pipe(res);
  });

  // GET /api/dramas/:id/episodes/:epId/audio — Stream or redirect episode audio
  router.get('/:id/episodes/:epId/audio', async (req, res) => {
    const episode = await getEpisode(req.params.id, req.params.epId);
    if (!episode) {
      res.status(404).json({ error: 'Episode not found' });
      return;
    }

    const audioPath = episode.audioFilePath;
    if (!audioPath) {
      res.status(404).json({ error: 'Audio not available' });
      return;
    }

    // If it's a URL (Cloudinary), redirect
    if (audioPath.startsWith('http://') || audioPath.startsWith('https://')) {
      res.redirect(301, audioPath);
      return;
    }

    // Local file fallback
    if (!existsSync(audioPath)) {
      res.status(404).json({ error: 'Audio file not found' });
      return;
    }

    const stat = statSync(audioPath);
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'audio/mpeg',
      });
      createReadStream(audioPath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': 'audio/mpeg',
      });
      createReadStream(audioPath).pipe(res);
    }
  });

  return router;
}
