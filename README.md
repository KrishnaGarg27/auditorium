# Auditorium

An AI-powered application that transforms written stories into fully produced, multi-layered audio dramas. Upload a story or describe one via a prompt, pick a cinematic style, and the engine analyzes, dramatizes, voices, scores, and mixes everything into episode-based audio you can stream from a built-in player UI.

Built with [AWS Kiro](https://kiro.dev)'s spec-driven development workflow and powered by [ElevenLabs](https://elevenlabs.io) for voice, sound effects, and music generation.

## How It Works

The engine runs a **multi-round LLM pipeline** followed by **ElevenLabs audio generation** and **FFmpeg mixing**:

1. **Story Ingestion** — Upload `.txt`, `.md`, `.pdf`, or `.epub` files (up to 5 MB), or generate an original story from a text prompt.
2. **Metadata Extraction (Round 1)** — A single LLM call extracts characters (with physical descriptions, personality traits, relationships), settings, time periods, themes, and narrative arc.
3. **Scene Decomposition (Round 2)** — A single LLM call breaks the story into discrete scenes with locations, characters, mood, and original text ranges.
4. **Combined Scene Adaptation (Round 3)** — One LLM call *per scene*, with context passing from the previous scene. Each call produces an `AnnotatedScene` containing dialogue, narration, action cues, SFX cues, and music cues in one shot. The selected style preset is injected into every prompt.
5. **Coherence Verification (Round 4)** — A single LLM call reviews the full adapted script against the original story for information loss, inconsistencies, pacing issues, and (when Creative Mode is on) creative fidelity.
6. **Episode Organization** — Scenes are grouped into episodes with titles, synopses, and "Previously on…" recap narration for episodes 2+.
7. **Voice Assignment** — Each character is matched to a distinct ElevenLabs voice based on age, gender, personality, and style aesthetics. A dedicated narrator voice is also assigned.
8. **Audio Generation** — ElevenLabs APIs produce TTS speech (`eleven_flash_v2_5` model), sound effects, and music tracks. Results are cached (SHA-256 keyed) and retried with exponential backoff. All generated audio files are probed via FFprobe to capture actual durations.
9. **Audio Mixing** — FFmpeg combines dialogue, SFX, and music per scene using sidechain compression, presence-range EQ, and a final limiter for broadcast-quality output. Context-aware pacing gaps are inserted between dialogue lines. Scenes are concatenated into episode files (MP3 44.1 kHz 192 kbps).
10. **Thumbnail Generation** — AI-generated title cards via Replicate (recraft-v3), with a canvas-based fallback using style-specific gradient palettes.

## Features

### 10 Drama Styles

Each style ships with a full `StylePreset` that influences narration tone, dialogue style, music preferences, ambient soundscape, SFX style, pacing, and voice aesthetics:

| Style | Vibe |
|---|---|
| **Anime** | Emotionally heightened, J-pop orchestral, dramatic stingers |
| **Noir** | World-weary narration, jazz/saxophone, rain-soaked ambience |
| **Dark Thriller** | Psychological suspense, pulsing bass, dissonant strings |
| **Horror** | Dread through understatement, dissonant strings, eerie choral |
| **Cyberpunk** | Street-smart edge, synthwave, neon-buzzing soundscapes |
| **Fantasy Epic** | Grand sweeping narration, full orchestral, heroic brass |
| **Romance** | Warm intimacy, soft piano, acoustic guitar |
| **Comedy** | Quick wit, upbeat jazz, quirky woodwinds, comedic stingers |
| **Documentary** | Authoritative clarity, minimal scoring, realistic ambience |
| **Cinematic** | Balanced and versatile, adapts to each scene's needs |

When no style is selected, the engine auto-infers the best fit from the story's genre and themes.

### Creative Mode

A toggle that lets the Scene Adapter make more liberal creative choices:
- Atmospheric SFX even when not described in the text
- More liberal music cues to amplify emotional atmosphere
- Freer dialogue rephrasing for dramatic effect
- All additions are validated for story fidelity in Round 4

### Scene-by-Scene Context Passing

Round 3 processes one scene at a time. Each LLM call receives the previous scene's output as context, ensuring continuity in tone, character voice, and narrative flow without blowing up token limits.

### Episodic Organization with Recaps

Longer stories are automatically split into episodes at narrative arc boundaries. Episodes 2+ get a "Previously on…" recap narration segment prepended to their audio.

### Premium Player UI

A React-based streaming-platform-style interface with:
- Library view with thumbnails, style badges, and episode counts
- Episode list with titles, synopses, and durations
- Persistent player bar with play/pause, ±15s skip, seekable progress bar, playback speed control, and dismiss button
- Auto-advance to next episode
- Playback position persistence via `localStorage`
- Real-time pipeline progress display with granular stage details

### Audio Generation Details

- **TTS**: ElevenLabs `textToSpeech.convert()` with `eleven_flash_v2_5` model. Per-character voice settings (stability, similarity boost, style, speed) tuned per drama style. Per-line expression modulation adjusts voice settings based on dialogue emotion tags.
- **Sound Effects**: ElevenLabs `textToSoundEffects.convert()` with prompt from SFX cue description. Ambient SFX use `loop: true`. Default `promptInfluence: 0.7`.
- **Music**: ElevenLabs `music.compose()` with mood/style prompt. Underscore cues use `forceInstrumental: true`.
- **Duration Probing**: All generated audio files (speech, SFX, music) are probed via FFprobe to capture actual file duration in milliseconds.
- **Caching**: SHA-256 hash of (endpoint + params) as cache key. Checked before every API call. Cache files are cleaned up after Cloudinary upload.
- **Retry**: Up to 3 retries with exponential backoff (1s → 2s → 4s). Immediate failure on 401/422. Respects 429 `Retry-After`.

### Audio Mixing Details

The mixer uses a broadcast-quality clarity chain:
- **Sidechain compression**: Music and ambient SFX are ducked ~9–12 dB whenever dialogue is present, with smooth attack/release to avoid pumping.
- **Presence-range EQ**: A gentle -3 dB scoop around 500 Hz on music and ambient beds opens a spectral pocket for speech intelligibility.
- **Final limiter**: Catches any peaks above 0 dBFS after per-N amix compensation, preventing clipping at the MP3 encoder.
- **Context-aware pacing**: Trailing silence pads (1.2s) between scenes so episode transitions breathe naturally.

## LLM Integration

The backend defines an abstract `LLMClient` interface:

```typescript
interface LLMClient {
  generateText(systemPrompt: string, userPrompt: string): Promise<string>;
}
```

The default implementation uses OpenAI GPT-4.1 via the `openai` npm package. The model is configurable via the `OPENAI_MODEL` environment variable — set it to `gpt-4o`, `gpt-4o-mini`, or any other OpenAI model to compare quality. The `LLMClient` interface is abstract and injectable, so swapping to Anthropic or another provider only requires changing the client implementation in `backend/src/index.ts`.

## Data Storage

All persistent data lives in cloud services — the backend is stateless.

| Data | Service | Details |
|---|---|---|
| Dramas & episodes | Supabase Postgres | Schema in `backend/supabase-schema.sql`. Row Level Security enabled; backend uses the service role key. |
| Thumbnails | Cloudinary | Uploaded as images. URLs stored in the `thumbnail_url` column on `dramas`. |
| Episode audio | Cloudinary | Uploaded as raw resources. URLs stored in the `audio_url` column on `episodes`. |
| TTS cache | Local `cache/` dir | Ephemeral — used during pipeline runs to avoid re-generating identical TTS. Cleaned up after each pipeline run. |

## Tech Stack

| Layer | Technology |
|---|---|
| LLM | OpenAI GPT-4.1 (default, configurable via `OPENAI_MODEL`) |
| Backend | TypeScript, Node.js, Express |
| Frontend | React 18, Vite |
| Database | Supabase Postgres (`@supabase/supabase-js`) |
| File Storage | Cloudinary (`cloudinary`) |
| Audio APIs | ElevenLabs JS SDK (`@elevenlabs/elevenlabs-js`) |
| Audio Mixing | FFmpeg via `fluent-ffmpeg` + `@ffmpeg-installer/ffmpeg` (bundled) |
| Audio Probing | FFprobe via `@ffprobe-installer/ffprobe` (bundled) |
| File Parsing | `pdf-parse`, `epub2` |
| Thumbnails | Replicate (recraft-v3) with `canvas` (Node.js) fallback |
| Testing | Vitest, fast-check (property-based testing) |
| Monorepo | npm workspaces |
| Development | [AWS Kiro](https://kiro.dev) — spec-driven development |

## Project Structure

```
auditorium/
├── backend/
│   ├── src/
│   │   ├── analyzer/          # Rounds 1, 2, 4 — metadata, scenes, coherence
│   │   ├── api/               # Express REST routes
│   │   ├── audio-generator/   # ElevenLabs TTS, SFX, Music + caching + retry + probe
│   │   ├── audio-mixer/       # FFmpeg scene mixing + episode concatenation
│   │   ├── db/                # Supabase + Cloudinary (connection, repository, fileStorage)
│   │   ├── errors/            # StoryIngestionError, PipelineStageError
│   │   ├── ingestion/         # File upload + prompt-based story generation
│   │   ├── pipeline/          # Pipeline orchestrator (all 10 stages)
│   │   ├── scene-adapter/     # Round 3 — scene-by-scene combined adaptation
│   │   ├── thumbnail/         # AI + canvas thumbnail generation
│   │   ├── types/             # All TypeScript type definitions
│   │   ├── voice-mapper/      # Character → ElevenLabs voice assignment
│   │   └── index.ts           # Express server entry point
│   ├── scripts/               # Dev test scripts (LLM, TTS, SFX, music, mixing)
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/        # React UI components
│   │   ├── hooks/             # Custom hooks (audio player)
│   │   ├── api.ts             # API client
│   │   ├── App.tsx            # Root component
│   │   └── types.ts           # Frontend type definitions
│   └── package.json
└── package.json               # Root workspace config
```

## REST API

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/dramas` | Submit story (file upload or prompt) + style + creative mode |
| `GET` | `/api/dramas` | List all dramas |
| `GET` | `/api/dramas/:id` | Get drama details + episodes |
| `GET` | `/api/dramas/:id/status` | Pipeline status with granular stage detail |
| `GET` | `/api/dramas/:id/episodes/:epId/audio` | Stream episode audio |
| `GET` | `/api/styles` | List all 10 drama styles with preset summaries |

## Built With

This project was developed using [AWS Kiro](https://kiro.dev)'s spec-driven development methodology. The full requirements, design documents, and implementation task lists are in `.kiro/specs/`. Audio generation is powered by [ElevenLabs](https://elevenlabs.io) — TTS voices, sound effects, and music are all generated through their API.

## License

MIT License — see [LICENSE](LICENSE) for details.
