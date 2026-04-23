import 'dotenv/config';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import ffmpeg from 'fluent-ffmpeg';
import express from 'express';
import OpenAI from 'openai';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { createDramaRoutes } from './api/dramaRoutes.js';

// Point fluent-ffmpeg at the bundled binaries so no system install is needed
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

import { createStatusRoutes } from './api/statusRoutes.js';
import { createStylesRoutes } from './api/stylesRoutes.js';
import { AudioCache } from './audio-generator/cache.js';
import { initDb } from './db/connection.js';
import type { PipelineDeps } from './pipeline/index.js';
import type { LLMClient } from './ingestion/generateFromPrompt.js';

// Initialize database and external services
initDb().then(() => {
  console.log('[DB] Supabase + Cloudinary initialized');
}).catch((err) => {
  console.warn('[DB] Init warning:', (err as Error).message);
});

const app = express();
const PORT = process.env.PORT || 3001;

// CORS — allow the frontend origin in production (Vercel) and localhost in dev
app.use((_req, res, next) => {
  const allowedOrigin = process.env.CORS_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (_req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

/**
 * Mount API routes with the given pipeline dependencies.
 */
export function mountRoutes(deps: PipelineDeps): void {
  app.use('/api/dramas', createDramaRoutes(deps));
  app.use('/api/dramas', createStatusRoutes());
  app.use('/api/styles', createStylesRoutes());
}

// --- Build LLM Client (OpenAI GPT-4.1) ---

function createLLMClient(): LLMClient {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('⚠️  OPENAI_API_KEY not set. LLM calls will fail.');
  }

  const openai = new OpenAI({ apiKey });

  return {
    async generateText(systemPrompt: string, userPrompt: string): Promise<string> {
      const model = process.env.OPENAI_MODEL ?? 'gpt-4.1';
      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
      });
      return response.choices[0]?.message?.content ?? '';
    },
  };
}

// --- Build ElevenLabs Client ---

function createElevenLabsClient(): ElevenLabsClient {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.warn('⚠️  ELEVENLABS_API_KEY not set. Audio generation will fail.');
  }
  return new ElevenLabsClient({ apiKey });
}

// --- Wire everything together and start ---

const llmClient = createLLMClient();
const elevenLabsClient = createElevenLabsClient();
const audioCache = new AudioCache('./cache');

const deps: PipelineDeps = {
  llmClient,
  elevenLabsClient,
  audioCache,
  outputDir: './output',
};

mountRoutes(deps);

app.listen(PORT, () => {
  console.log(`Auditorium backend running on port ${PORT}`);
  console.log(`  LLM model: ${process.env.OPENAI_MODEL ?? 'gpt-4.1'}`);
  console.log(`  OpenAI key: ${process.env.OPENAI_API_KEY ? '✅ set' : '❌ missing'}`);
  console.log(`  ElevenLabs key: ${process.env.ELEVENLABS_API_KEY ? '✅ set' : '❌ missing'}`);
});

export default app;
