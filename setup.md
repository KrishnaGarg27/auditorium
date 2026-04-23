# Setup, Testing & Deployment Guide

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** 9+ (ships with Node.js)
- **FFmpeg + FFprobe** — bundled automatically via `@ffmpeg-installer/ffmpeg` and `@ffprobe-installer/ffprobe` npm packages. No system install needed.
- **ElevenLabs API key** (for audio generation) — sign up at https://elevenlabs.io
- **OpenAI API key** (for LLM pipeline) — sign up at https://platform.openai.com

## Installation

```bash
# Clone the repo
git clone <your-repo-url>
cd auditorium

# Install all dependencies (root + backend + frontend via npm workspaces)
npm install
```

This installs dependencies for both `backend/` and `frontend/` in one go. FFmpeg and FFprobe binaries are pulled in as npm packages — no system-level install required.

## Environment Variables

Create a `.env` file in the `backend/` directory (copy from `.env.example`):

```bash
cp backend/.env.example backend/.env
```

Then fill in your keys:

```bash
# Required: OpenAI API key for LLM pipeline
OPENAI_API_KEY=sk-your-openai-api-key-here

# Optional: Override the default model (default: gpt-4.1)
# OPENAI_MODEL=gpt-4.1

# Required: ElevenLabs API key for audio generation
ELEVENLABS_API_KEY=your-elevenlabs-api-key-here

# Required: Supabase project URL and service role key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...your-service-role-key

# Required: Cloudinary credentials
CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME

# Optional: Backend port (default: 3001)
# PORT=3001
```

See the full [Environment Variables Reference](#environment-variables-reference) in the Deployment section for all options.

The backend is already wired up — `backend/src/index.ts` creates the OpenAI client, ElevenLabs client, connects to Supabase, and mounts all routes. No manual wiring needed.

## LLM Model Configuration

The default model is `gpt-4.1`. To change it, set `OPENAI_MODEL` in your `.env`:

```bash
OPENAI_MODEL=gpt-4o          # strong alternative
OPENAI_MODEL=gpt-4o-mini     # fastest/cheapest, may lose nuance on complex scenes
OPENAI_MODEL=gpt-4-turbo     # cheaper, still good quality
```

The model choice is logged at startup so you always know what's running.

## Data Storage

All persistent data lives in cloud services — the backend is stateless and needs no local disk or persistent volume.

| Data | Service | Details |
|---|---|---|
| Dramas & episodes | Supabase Postgres | Schema in `backend/supabase-schema.sql`. Row Level Security enabled; backend uses the service role key. |
| Thumbnails | Cloudinary | Uploaded as images. URLs stored in the `thumbnail_url` column on `dramas`. |
| Episode audio | Cloudinary | Uploaded as video/audio resources. URLs stored in the `audio_url` column on `episodes`. |
| TTS cache | Local `cache/` dir | Ephemeral — used during pipeline runs to avoid re-generating identical TTS. Not required to persist across deploys. |

The backend reads `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `CLOUDINARY_URL` from environment variables. See the [Environment Variables Reference](#environment-variables-reference) below for the full list.

## Running the Application

### Development Mode

Open two terminals:

```bash
# Terminal 1 — Backend (port 3001)
npm run dev:backend

# Terminal 2 — Frontend (port 3000, proxies /api to backend)
npm run dev:frontend
```

The frontend Vite dev server at `http://localhost:3000` proxies all `/api/*` requests to the backend at `http://localhost:3001`.

### Production Build

```bash
npm run build          # Builds both backend and frontend

# Start the backend
cd backend && npm start
```

For production, serve the frontend build output (`frontend/dist/`) via a static file server or configure the Express backend to serve it.

---

## Testing Each Part Separately

The pipeline has distinct stages you can test independently before committing to expensive ElevenLabs API calls.

### Step 1: Test the LLM Pipeline Only (No Audio)

Start here. The LLM pipeline (Rounds 1–4) is the foundation — if the script quality is poor, no amount of good audio will save it.

A ready-to-run test script is at `backend/scripts/test-llm-pipeline.ts`. It runs the full LLM pipeline, logs every call with token counts and timing, and saves all intermediate JSON.

```bash
cd backend

# Make sure your .env has OPENAI_API_KEY set
# Put a story file in backend/ (a sample test-story.txt is included)

# Run with auto-inferred style:
npx tsx scripts/test-llm-pipeline.ts test-story.txt

# Run with a specific style:
npx tsx scripts/test-llm-pipeline.ts test-story.txt noir

# Try a different model:
OPENAI_MODEL=gpt-4o npx tsx scripts/test-llm-pipeline.ts test-story.txt
```

#### What to Look For

Inspect the JSON output files:

- **round1-metadata.json** — Are characters correctly identified? Are relationships accurate?
- **round2-scenes.json** — Are scene boundaries logical? Does each scene have the right characters and mood?
- **round3-script.json** — This is the big one:
  - Is dialogue natural and expressive?
  - Are expression tags meaningful (not just "neutral" everywhere)?
  - Are SFX cues appropriate and well-timed?
  - Are music cues placed at emotional moments, not everywhere?
  - Is narration minimal (dialogue should dominate)?
- **round4-verified.json** — Did the coherence check find issues? Are they real?
- **episodes.json** — Are episode boundaries sensible? Do recaps make sense?

#### Comparing LLM Models

Change `OPENAI_MODEL` in your `.env` or pass it inline:

```bash
OPENAI_MODEL=gpt-4.1 npx tsx scripts/test-llm-pipeline.ts test-story.txt noir
OPENAI_MODEL=gpt-4o npx tsx scripts/test-llm-pipeline.ts test-story.txt noir
OPENAI_MODEL=gpt-4o-mini npx tsx scripts/test-llm-pipeline.ts test-story.txt noir
```

Start with `gpt-4.1` for the best script quality. The scene adaptation prompts are complex and benefit from stronger models. Once you're happy with the output structure, experiment with cheaper models to see where quality drops.

### Step 2: Test ElevenLabs Audio Generation (After LLM Is Good)

Once you're satisfied with the LLM script output, test audio generation in isolation. Three scripts are provided:

#### Test TTS Voices

```bash
cd backend

# Requires round1-metadata.json from Step 1
npx tsx scripts/test-elevenlabs-tts.ts          # default style: cinematic
npx tsx scripts/test-elevenlabs-tts.ts noir      # specify style
```

This assigns voices to characters from your metadata, generates sample dialogue for each character and the narrator, and saves audio files.

#### Test Sound Effects

```bash
cd backend

# Use built-in sample cues:
npx tsx scripts/test-elevenlabs-sfx.ts

# Or use SFX cues from your LLM pipeline output:
npx tsx scripts/test-elevenlabs-sfx.ts --from-script
```

#### Test Music Generation

```bash
cd backend

# Use built-in sample cues:
npx tsx scripts/test-elevenlabs-music.ts

# Or use music cues from your LLM pipeline output:
npx tsx scripts/test-elevenlabs-music.ts --from-script
```

All generated audio files are probed via FFprobe to capture actual durations — no more hardcoded zeros.

#### What to Tweak in ElevenLabs

After listening to the generated audio:

- Voice doesn't fit a character? Edit the voice assignment logic in `src/voice-mapper/assignVoices.ts` or manually override `voiceId` values.
- Voice too robotic/unstable? Adjust `VoiceSettings` per style in the `VOICE_SETTINGS_PRESETS` map:
  - `stability`: Higher (0.6–0.8) = more consistent, lower (0.2–0.4) = more expressive
  - `similarityBoost`: Higher = closer to original voice
  - `style`: Higher = more stylized delivery
  - `speed`: 0.7–1.2 range
- SFX not matching? The prompt text in `SFXCue.description` drives quality. Improve the Scene Adapter's SFX prompts by tweaking the LLM prompt in `src/scene-adapter/buildPrompt.ts`.
- Music too generic? The `MusicCue.prompt` field drives music generation. Improve the Scene Adapter's music prompt instructions in the same build prompt file.
- Music too loud over dialogue? The mixer uses sidechain compression to duck music automatically, but you can adjust base volumes in `src/audio-mixer/buildSceneMixInputs.ts` — defaults are dialogue 1.0, SFX 0.5 momentary / 0.18 ambient, music 0.15 underscore / 0.28 featured.

### Step 3: Test Audio Mixing (FFmpeg)

Once you have audio samples, test the mixer:

```bash
cd backend

# Run the mixing test script
npx tsx scripts/test-mixing.ts

# Run the mixer unit/property tests
npm test -- --grep "audio-mixer"
```

The mixer uses sidechain compression, presence EQ, and a final limiter. No system FFmpeg install is needed — the bundled npm packages handle everything.

### Step 4: Run the Full Pipeline

Once LLM output and ElevenLabs audio both look good:

```bash
# Start the backend
npm run dev:backend

# In another terminal, start the frontend
npm run dev:frontend

# Open http://localhost:3000
# Upload a story or enter a prompt, pick a style, and watch it process
```

---

## Running Tests

### All Tests

```bash
npm test                    # Runs tests in both backend and frontend
```

### Backend Tests Only

```bash
cd backend
npm test                    # All backend tests
npm test -- --grep "ingestion"        # Just ingestion tests
npm test -- --grep "analyzer"         # Just analyzer tests
npm test -- --grep "scene-adapter"    # Just scene adapter tests
npm test -- --grep "audio-mixer"      # Just audio mixer tests
npm test -- --grep "audio-generator"  # Just audio generator tests
npm test -- --grep "thumbnail"        # Just thumbnail tests
npm test -- --grep "pipeline"         # Just pipeline/integration tests
npm test -- --grep "property"         # All property-based tests
```

### Frontend Tests Only

```bash
cd frontend
npm test
```

### What the Tests Cover

- **Property-based tests** (fast-check, 100+ iterations each): File ingestion round-trip, whitespace rejection, style propagation, dialogue dominance, expression tags, voice uniqueness, SFX validity, music transitions, underscore flagging, retry backoff, caching idempotence, volume priority, transition filters, ambient looping, scene ordering, episode partitioning, metadata completeness, localStorage round-trip, schema completeness, unique IDs, pipeline status rendering, style preset completeness, context passing, thumbnail generation.
- **Unit tests**: Edge cases for ingestion (PDF, EPUB, size limits), style inference, episode organization, scene adapter prompts, thumbnail rendering, UI components.
- **Integration tests**: Full LLM pipeline sequence with mocked LLM, ElevenLabs API calls with mocked client, FFmpeg filter graph construction, creative mode influence, granular progress callbacks.

---

## Test Scripts Reference

| Script | Path | Description |
|---|---|---|
| LLM Pipeline | `backend/scripts/test-llm-pipeline.ts` | Runs Rounds 1–4 + episode organization, saves JSON output |
| TTS Voices | `backend/scripts/test-elevenlabs-tts.ts` | Voice assignment + sample dialogue generation |
| Sound Effects | `backend/scripts/test-elevenlabs-sfx.ts` | SFX generation from sample or script cues |
| Music | `backend/scripts/test-elevenlabs-music.ts` | Music generation from sample or script cues |
| Mixing | `backend/scripts/test-mixing.ts` | End-to-end FFmpeg scene mixing test |
| Probe Outputs | `backend/scripts/probe-outputs.ts` | FFprobe audio file inspection |
| Probe Levels | `backend/scripts/probe-levels.ts` | Audio level analysis |

---

## Deployment

Production architecture:

| Layer | Service |
|---|---|
| Frontend | Vercel (static React build) |
| Backend | Railway or Render (Node.js) |
| Database | Supabase Postgres |
| File Storage | Cloudinary (thumbnails + audio) |

The backend is fully stateless — all data lives in Supabase and Cloudinary, so no persistent volumes are needed.

### 1. Supabase Setup

1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** and run the schema from `backend/supabase-schema.sql`. This creates the `dramas` and `episodes` tables with Row Level Security policies.
3. Go to **Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **Service role key** (under "service_role", not "anon") → `SUPABASE_SERVICE_ROLE_KEY`

### 2. Cloudinary Setup

1. Create an account at [cloudinary.com](https://cloudinary.com).
2. From the dashboard, copy the **CLOUDINARY_URL** (format: `cloudinary://API_KEY:API_SECRET@CLOUD_NAME`).
3. Alternatively, note the individual values (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`) — either approach works.

### 3. Deploy Backend to Railway

1. Connect your GitHub repo at [railway.app](https://railway.app).
2. Set the **root directory** to `backend`.
3. Set the **build command**: `npm install && npm run build`
4. Set the **start command**: `npm start`
5. Add all environment variables from `.env.example` (see [Environment Variables Reference](#environment-variables-reference) below).
6. Deploy. Railway will assign a public URL (e.g. `https://auditorium-backend-production.up.railway.app`).

The backend needs no persistent volume — all data is in Supabase + Cloudinary.

> **Render alternative:** The same steps apply on [render.com](https://render.com) — create a Web Service, point it at the `backend` directory, and set the same build/start commands and env vars.

### 4. Deploy Frontend to Vercel

1. Connect your GitHub repo at [vercel.com](https://vercel.com).
2. Set the **root directory** to `frontend`.
3. Set the **build command**: `npm run build`
4. Set the **output directory**: `dist`
5. Add the environment variable:
   - `VITE_API_URL` — the Railway (or Render) backend URL from step 4, e.g. `https://auditorium-backend-production.up.railway.app`
6. Update the Vite config so the dev proxy and production API calls both resolve correctly. In `frontend/vite.config.ts`, the proxy target should use `VITE_API_URL` in production while keeping `http://localhost:3001` for local dev.
7. Deploy. Vercel will give you a production URL for the frontend.

### 5. Environment Variables Reference

All variables are set in the backend environment (Railway/Render). The frontend only needs `VITE_API_URL`.

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Yes | OpenAI API key for the LLM pipeline |
| `OPENAI_MODEL` | No | Override the default model (default: `gpt-4.1`) |
| `ELEVENLABS_API_KEY` | Yes | ElevenLabs API key for TTS, SFX, and music generation |
| `SUPABASE_URL` | Yes | Supabase project URL (e.g. `https://xyz.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (not the anon key) |
| `CLOUDINARY_URL` | Yes* | Cloudinary connection string (`cloudinary://KEY:SECRET@CLOUD`) |
| `CLOUDINARY_CLOUD_NAME` | Alt* | Cloudinary cloud name (alternative to `CLOUDINARY_URL`) |
| `CLOUDINARY_API_KEY` | Alt* | Cloudinary API key (alternative to `CLOUDINARY_URL`) |
| `CLOUDINARY_API_SECRET` | Alt* | Cloudinary API secret (alternative to `CLOUDINARY_URL`) |
| `REPLICATE_API_TOKEN` | No | Replicate API token for AI thumbnail generation |
| `PORT` | No | Backend port (default: `3001`) |
| `CORS_ORIGIN` | No | Allowed CORS origin (default: `*`). Set to your Vercel URL in production. |
| `VITE_API_URL` | Frontend | Backend URL — set this in Vercel, not Railway |

*Provide either `CLOUDINARY_URL` or all three individual Cloudinary keys.

### Scaling Considerations

- The pipeline processes one story at a time per job. Multiple concurrent jobs are supported but will compete for LLM and ElevenLabs API rate limits.
- ElevenLabs has rate limits — the retry logic handles 429 responses with `Retry-After` headers.
- LLM calls for long stories (many scenes) can take several minutes. Round 3 makes one call per scene.
- Audio generation is the most time-consuming stage. Caching helps on re-runs with identical content.
- Supabase Postgres handles concurrent reads and writes well. The free tier is sufficient for hackathon-scale usage.
