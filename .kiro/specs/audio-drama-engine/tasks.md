# Implementation Plan: Audio Drama Engine

## Overview

Convert the Audio Drama Engine design into an incremental implementation plan. The system is a TypeScript + Node.js backend with a React frontend that transforms written stories into multi-layered audio dramas via an LLM-powered pipeline, ElevenLabs APIs, and FFmpeg mixing. Tasks are ordered so each builds on the previous. The pipeline uses scene-by-scene adaptation with context passing (Round 3), merging dramatization, SFX, and music annotation into a single LLM call per scene. All testing tasks are grouped into an optional phase at the end.

## Tasks

- [x] 1. Project setup and core type definitions
  - [x] 1.1 Initialize project structure with TypeScript backend and React frontend
    - Create monorepo or workspace structure with `backend/` and `frontend/` directories
    - Initialize `package.json` for both, configure TypeScript (`tsconfig.json`), install core dependencies: `express`, `fluent-ffmpeg`, `@elevenlabs/elevenlabs-js`, `fast-check` (dev), `vitest` (dev), `react`, `react-dom`
    - Set up build scripts and dev tooling
    - _Requirements: 12.1_

  - [x] 1.2 Define all core data model types and interfaces
    - Create `backend/src/types/` directory with type files
    - Implement `DramaStyle`, `SFXDurationType`, `MusicTransition` union types
    - Implement `StoryInput`, `StoryGenOptions`, `StoryMetadata`, `CharacterMetadata`, `SettingMetadata`
    - Implement `SceneDecomposition`, `SceneDefinition`
    - Implement `DramatizedScript`, `DramatizedScene`, `ScriptElement` (`DialogueLine`, `NarrationLine`, `ActionCue`)
    - Implement `AnnotatedScript`, `AnnotatedScene`, `SFXCue`, `MusicCue`
    - Implement `IntermediateFormat`, `EpisodeDefinition`
    - Implement `AudioAsset`, `AudioManifest`
    - Implement `Drama`, `Episode`, `PlaybackPosition`
    - Implement `VoiceAssignment`, `VoiceSettings`
    - Implement `PipelineJob`, `PipelineStatus`, `PipelineStage`, `PipelineError`
    - Implement `SceneMixInput`, `TimedAudioTrack`
    - _Requirements: 12.1, 12.2_

  - [x] 1.3 Implement error classes
    - Create `StoryIngestionError` with codes: `EMPTY_FILE`, `FILE_TOO_LARGE`, `UNSUPPORTED_FORMAT`, `EXTRACTION_FAILED`
    - Create `PipelineStageError` with `stage`, `userMessage`, `technicalDetails`, `retryable` fields
    - _Requirements: 1.3, 1.4, 13.2_

  - [x] 1.4 Write property tests for intermediate format schema completeness and unique IDs
    - **Property 19: Intermediate format schema completeness**
    - **Validates: Requirements 12.1**
    - **Property 20: Unique identifiers across all cues**
    - **Validates: Requirements 12.2**

- [x] 2. Story Ingestion Module
  - [x] 2.1 Implement file ingestion (`ingestFile`)
    - Accept `Buffer` + `filename`, validate file extension (`.txt`, `.md` only), check file size ≤ 500KB
    - Reject empty/whitespace-only content with `EMPTY_FILE` error
    - Reject oversized files with `FILE_TOO_LARGE` error
    - Reject unsupported formats with `UNSUPPORTED_FORMAT` error
    - Extract text and return `StoryInput` with `source: 'upload'`
    - _Requirements: 1.1, 1.3, 1.4_

  - [x] 2.2 Implement prompt-based story generation (`generateFromPrompt`)
    - Accept user prompt string with optional `StoryGenOptions` (style, length preference)
    - Call LLM API to generate story text
    - Return `StoryInput` with `source: 'generated'`
    - _Requirements: 1.2_

  - [x] 2.3 Write property test for file ingestion round-trip
    - **Property 1: File ingestion round-trip**
    - **Validates: Requirements 1.1**

  - [x] 2.4 Write property test for whitespace and empty file rejection
    - **Property 2: Whitespace and empty file rejection**
    - **Validates: Requirements 1.3**

  - [x] 2.5 Write unit tests for Story Ingestion Module
    - Test file at exact 500KB boundary
    - Test various text encodings
    - Test unsupported file extensions
    - _Requirements: 1.1, 1.3, 1.4_

- [x] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Story Analyzer
  - [x] 4.1 Implement metadata extraction (`extractMetadata`)
    - Build LLM prompt that extracts characters (with physical descriptions, personality traits, relationships), settings, time periods, themes, and narrative arc from story text
    - Use JSON-mode output to produce `StoryMetadata`
    - Apply `DramaStyle` tonal characteristics to the extraction prompt
    - _Requirements: 3.1, 2.2_

  - [x] 4.2 Implement scene decomposition (`decomposeScenes`)
    - Build LLM prompt that takes `StoryInput` + `StoryMetadata` and breaks story into discrete `SceneDefinition` objects
    - Each scene includes setting, participating characters, mood, summary, and original text range
    - _Requirements: 3.2_

  - [x] 4.3 Implement style inference (`inferStyle`)
    - When no `DramaStyle` is selected, call LLM to infer appropriate style from story genre, themes, and tone
    - Return a valid `DramaStyle` value
    - _Requirements: 2.3_

  - [x] 4.4 Implement episode organization (`organizeEpisodes`)
    - Group scenes into episodes based on narrative arc boundaries and pacing
    - Short stories produce a single episode
    - Assign each episode a title and synopsis
    - Maintain narrative continuity — no mid-scene splits
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 4.5 Implement coherence verification (`verifyCoherence`)
    - Build LLM prompt that compares the full `AnnotatedScript` against the original `StoryInput`
    - Detect information loss, inconsistencies, and pacing issues
    - When `creativeMode` is true, include a dedicated creative fidelity check validating all creative additions
    - Return `VerifiedScript`
    - _Requirements: 3.5, 14.7, 14.8_

  - [x] 4.6 Write property test for episode scene partitioning
    - **Property 16: Episode scene partitioning**
    - **Validates: Requirements 10.1, 10.4**

  - [x] 4.7 Write property test for episode metadata completeness
    - **Property 17: Episode metadata completeness**
    - **Validates: Requirements 10.2**

  - [x] 4.8 Write unit tests for Story Analyzer
    - Test style inference returns valid `DramaStyle`
    - Test short story produces single episode
    - Test creative fidelity check is included when creative mode is on
    - _Requirements: 2.3, 10.3, 14.8_

- [x] 5. Update core types and expand DramaStyle
  - [x] 5.1 Expand DramaStyle type and add StylePreset
    - Update `DramaStyle` union type to include all 10 styles: `'anime' | 'noir' | 'dark-thriller' | 'horror' | 'cyberpunk' | 'fantasy-epic' | 'romance' | 'comedy' | 'documentary' | 'cinematic'`
    - Create `StylePreset` interface with fields: `style`, `narration_style`, `dialogue_style`, `music_preferences`, `ambient_preferences`, `sfx_style`, `pacing`, `voice_aesthetic`
    - Create `STYLE_PRESETS` constant: a `Record<DramaStyle, StylePreset>` with all 10 presets as defined in the design
    - _Requirements: 2.1, 2.5_

  - [x] 5.2 Update EpisodeDefinition and Drama types
    - Add optional `recapNarration?: string` field to `EpisodeDefinition`
    - Add optional `recapNarration?: string` field to `Episode`
    - Replace `coverArtUrl?: string` with `thumbnailPath?: string` on `Drama`
    - Remove `PlaybackPosition` type from backend (moved to frontend localStorage)
    - Remove `PlaybackPosition` export from `backend/src/types/index.ts`
    - _Requirements: 10.5, 15.4, 11.6_

  - [x] 5.3 Update PipelineStage and PipelineStatus types
    - Replace `'dramatization'` and `'audio_annotation'` stages with `'scene_adaptation'`
    - Add `'thumbnail_generation'` stage
    - Add optional `stageDetail?: string` field to `PipelineStatus` and `PipelineJob`
    - _Requirements: 13.1, 13.4_

  - [x] 5.4 Add PDF and EPUB file support to Story Ingestion
    - Install `pdf-parse` and `epub2` (or `epubjs`) dependencies
    - Update `ingestFile` to accept `.pdf` and `.epub` extensions
    - Implement PDF text extraction using `pdf-parse`
    - Implement EPUB text extraction using `epub2` or `epubjs`
    - Update max file size from 500KB to 5MB
    - Update `UNSUPPORTED_FORMAT` error message to list all four supported formats: `.txt`, `.md`, `.pdf`, `.epub`
    - _Requirements: 1.1, 1.4, 1.5_

  - [x] 5.5 Update style inference for expanded palette
    - Update `inferStyle` to return any of the 10 DramaStyle values (not just the original 5)
    - Update the LLM prompt to include all 10 style options with descriptions
    - _Requirements: 2.3_

  - [x] 5.6 Update episode organization with recap narration
    - Update `organizeEpisodes` to generate a `recapNarration` field (1-2 sentence "Previously on..." summary) for each episode after the first in multi-episode dramas
    - Update the LLM prompt to request recap generation
    - _Requirements: 10.5_

  - [x] 5.7 Update story generation to use style parameter
    - Ensure `generateFromPrompt` passes the `style` field from `StoryGenOptions` to the LLM prompt so generated stories match the selected drama style
    - _Requirements: 1.6_

- [x] 6. Scene Adapter — Combined Scene Adaptation (Round 3)
  - [x] 6.1 Implement Scene Adapter with scene-by-scene context passing
    - Create `backend/src/scene-adapter/` directory
    - Implement `adaptAllScenes` function that iterates over scenes from `SceneDecomposition`
    - For each scene, call `adaptScene` with: full `StoryMetadata`, the `StylePreset` for the selected style, the previous scene's `AnnotatedScene` output (or `null` for first scene), and the current scene's raw text extracted using `originalTextRange`
    - Each `adaptScene` call produces one `AnnotatedScene` with `elements` (dialogue, narration, action cues), `sfxCues`, and `musicCues`
    - Concatenate all `AnnotatedScene` results into a single `AnnotatedScript`
    - _Requirements: 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_

  - [x] 6.2 Build combined scene adaptation LLM prompt
    - Implement the Combined Scene Adaptation Prompt template from the design's Prompt Strategy section
    - Include: system role, metadata JSON, StylePreset fields, previous scene output JSON (or "none"), current scene raw text, creative mode instructions, dialogue rules, SFX rules (with classification and volume guidelines), music rules (with transition types and underscore handling), and AnnotatedScene JSON schema
    - When `creativeMode` is true, include creative mode instructions for liberal SFX, music, and dialogue adaptation
    - When `creativeMode` is false, include standard adaptation rules
    - _Requirements: 16.3, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.9_

  - [x] 6.3 Update coherence verification for new pipeline
    - Update `verifyCoherence` to accept `StoryMetadata` as an additional parameter
    - Update the coherence verification prompt to match the Round 4 template from the design's Prompt Strategy section (includes checks for missing characters, plot points, continuity, creative appropriateness)
    - _Requirements: 3.5, 16.4, 14.8_

- [x] 7. Character Voice Mapper
  - [x] 7.1 Implement voice assignment (`assignVoices`)
    - Fetch available ElevenLabs voices
    - Assign a distinct voice to each character based on age, gender, personality, and physical traits from `CharacterMetadata`
    - Assign a dedicated narrator voice distinct from all character voices
    - Apply style-aware voice settings presets for all 10 styles from the design
    - Ensure all `voiceId` values are unique across characters and narrator
    - Maintain consistent assignments across all scenes and episodes
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 8. Audio Generator
  - [x] 8.1 Implement TTS generation (`generateSpeech` and `generateNarration`)
    - Call `client.textToSpeech.convert()` with `eleven_flash_v2_5` model
    - Use assigned voice ID and per-character `VoiceSettings`
    - Expression tags in script text guide emotional delivery
    - Handle recap narration lines for episodes 2+ using the narrator voice
    - Return `AudioAsset` with file path and duration
    - _Requirements: 8.1, 10.6_

  - [x] 8.2 Implement SFX generation (`generateSFX`)
    - Call ElevenLabs Sound Effects API with prompt from SFX cue description
    - Set `duration_seconds` from cue duration, `loop: true` for ambient SFX, `prompt_influence: 0.7` default
    - Return `AudioAsset`
    - _Requirements: 8.2_

  - [x] 8.3 Implement music generation (`generateMusic`)
    - Call `client.music.compose()` with prompt from music cue mood/style
    - Set `music_length_ms` from cue duration, `force_instrumental: true` for underscore cues
    - Return `AudioAsset`
    - _Requirements: 8.3_

  - [x] 8.4 Implement retry logic with exponential backoff
    - Retry up to 3 times on transient errors with delays 1s, 2s, 4s
    - Fail immediately on 401 (invalid API key) and 422 (invalid params)
    - Respect 429 rate limit with `Retry-After` header
    - Apply timeouts: 60s for TTS/SFX, 120s for music
    - _Requirements: 8.4_

  - [x] 8.5 Implement audio asset caching
    - SHA-256 hash of (API endpoint + request params) as cache key
    - Check cache before every API call; store results on filesystem
    - _Requirements: 8.5_

  - [x] 8.6 Implement `generateAll` orchestration with granular progress
    - Process all dialogue lines, narration lines (including recap narration), SFX cues, and music cues from `IntermediateFormat`
    - Call `onProgress` callback with descriptive messages: "Generating voice 3 of 12", "Generating sound effect 5 of 8", "Generating music track 2 of 4"
    - Handle partial failures: mark failed assets, continue generating remaining
    - Return `AudioManifest` with all generated assets
    - _Requirements: 8.1, 8.2, 8.3, 12.3, 13.4_

- [x] 9. Audio Mixer
  - [x] 9.1 Implement scene mixing (`mixScene`)
    - Use `fluent-ffmpeg` to combine dialogue, SFX, and music tracks per scene
    - Dialogue base volume 1.0, SFX volume 0.6 default, music volume 0.3 (underscore) / 0.5 (featured)
    - Apply `afade` for fade-in/out, `acrossfade` for crossfade, no filter for hard-cut
    - Loop ambient SFX via `-stream_loop -1` with duration trim
    - Output MP3 44.1kHz 192kbps
    - Handle missing/failed assets gracefully with warnings
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 9.2 Implement episode concatenation (`concatenateEpisode`)
    - Concatenate scene audio files in ascending scene sequence number order
    - Return path to final episode audio file
    - _Requirements: 9.6_

- [x] 10. Thumbnail Generator
  - [x] 10.1 Implement thumbnail generation
    - Install `canvas` or `@napi-rs/canvas` dependency
    - Create `backend/src/thumbnail/` directory
    - Implement `generateThumbnail(title: string, style: DramaStyle): Promise<string>`
    - Draw 640x360px canvas with gradient background using style-specific color palettes from the design
    - Render drama title text (centered, white with shadow)
    - Render style badge (rounded rectangle with style name)
    - Save as PNG to filesystem and return file path
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

- [x] 11. Pipeline Orchestrator
  - [x] 11.1 Implement pipeline controller (`startProcessing`, `getStatus`, `cancelJob`)
    - Coordinate the full pipeline: ingestion → metadata extraction (Round 1) → scene decomposition (Round 2) → combined scene adaptation (Round 3, scene-by-scene) → coherence verification (Round 4) → episode organization (with recap narration) → voice assignment → audio generation (with granular progress) → audio mixing → thumbnail generation
    - Track `PipelineJob` state with current stage, progress (0-100), and `stageDetail` for granular updates
    - Propagate style through all stages consistently
    - Forward `onProgress` callbacks from Audio Generator to `stageDetail` field
    - During scene adaptation, update `stageDetail` with "Adapting scene X of Y"
    - Handle stage errors: wrap in `PipelineStageError`, update job status, retry LLM stages up to 2 times
    - Support job cancellation
    - Store intermediate format progressively as each stage completes
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 2.2_

- [x] 12. REST API Layer
  - [x] 12.1 Implement drama CRUD endpoints
    - `POST /api/dramas` — Submit story (file upload or prompt) with style and creative mode options, start pipeline. Accept `.txt`, `.md`, `.pdf`, `.epub` files up to 5MB
    - `GET /api/dramas` — List all dramas with status, style, episode count, thumbnail path
    - `GET /api/dramas/:id` — Get drama details including episodes (with recap narration)
    - `DELETE /api/dramas/:id` — Delete a drama and its assets (including thumbnail)
    - _Requirements: 1.1, 1.2, 2.1_

  - [x] 12.2 Implement processing and playback endpoints
    - `GET /api/dramas/:id/status` — Return current `PipelineStatus` including `stageDetail`
    - `GET /api/dramas/:id/episodes/:epId/audio` — Stream episode audio file
    - `GET /api/styles` — List available drama styles (all 10) with preset summaries
    - Note: No playback position endpoints — handled by frontend localStorage
    - _Requirements: 13.1, 2.1_

- [x] 13. Drama Player UI — Library and Creation
  - [x] 13.1 Implement LibraryView component
    - Display all generated audio dramas as `DramaCard` components with thumbnails (from `thumbnailPath`), title, style badge, and episode count
    - _Requirements: 11.1_

  - [x] 13.2 Implement CreateDramaModal component
    - `FileUploadInput` for file upload (`.txt`, `.md`, `.pdf`, `.epub`)
    - `PromptInput` for story generation prompts
    - `StyleSelector` dropdown with all 10 `DramaStyle` options
    - `CreativeModeToggle` switch
    - Submit triggers `POST /api/dramas`
    - _Requirements: 1.1, 1.2, 2.1, 14.1_

- [x] 14. Drama Player UI — Episode List and Detail View
  - [x] 14.1 Implement DramaDetailView component
    - `DramaHeader` with title, thumbnail, style badge, synopsis
    - `EpisodeList` with `EpisodeCard` components showing title, synopsis, duration, and play button
    - _Requirements: 11.2_

- [x] 15. Drama Player UI — Player Bar and Playback
  - [x] 15.1 Implement PlayerBar component
    - Persistent bottom bar with `PlayPauseButton`, `SkipBackward15Button`, `SkipForward15Button`
    - `SeekBar` with scrubbing support
    - `TimeDisplay` showing elapsed / total time
    - `NowPlayingInfo` showing episode title and drama title
    - _Requirements: 11.3, 11.5_

  - [x] 15.2 Implement playback logic with localStorage persistence
    - Audio streaming from `/api/dramas/:id/episodes/:epId/audio`
    - Auto-advance to next episode when current finishes
    - Persist playback position to `localStorage` with key `drama_${dramaId}_episode_${episodeId}`
    - Resume from saved localStorage position on episode load
    - _Requirements: 11.4, 11.6_

- [x] 16. Drama Player UI — Processing View
  - [x] 16.1 Implement ProcessingView component
    - `StageIndicator` showing current pipeline stage label and `stageDetail` text (e.g., "Adapting scene 3 of 8", "Generating voice 5 of 12")
    - `ProgressBar` showing estimated progress percentage
    - Poll `GET /api/dramas/:id/status` for updates (includes `stageDetail`)
    - Display error message with failed stage name and failure details when pipeline fails
    - Show completion notification and make drama available for playback on success
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

- [x] 17. Integration wiring
  - [x] 17.1 Wire frontend to backend
    - Connect all React components to REST API endpoints
    - Implement API client service with error handling
    - Ensure CreateDramaModal submission flows through to pipeline start
    - Ensure ProcessingView polls status (with stageDetail) and transitions to DramaDetailView on completion
    - _Requirements: 1.1, 1.2, 13.1, 13.3_

- [x] 18. Testing (optional)
  - [x] 18.1 Write property test for style preset completeness
    - **Property 22: Style preset completeness**
    - Verify all 10 DramaStyle values have a corresponding StylePreset with non-empty fields
    - **Validates: Requirements 2.5**

  - [x] 18.2 Write property test for scene adaptation context passing
    - **Property 23: Scene adaptation context passing**
    - Verify Scene Adapter makes N LLM calls for N scenes, each call i>0 includes previous scene output
    - **Validates: Requirements 3.3**

  - [x] 18.3 Write property test for dialogue-dominant script structure
    - **Property 4: Dialogue-dominant script structure**
    - **Validates: Requirements 4.1**

  - [x] 18.4 Write property test for expression tags on all dialogue lines
    - **Property 5: Expression tags on all dialogue lines**
    - **Validates: Requirements 4.3**

  - [x] 18.5 Write property test for SFX cue structural validity
    - **Property 7: SFX cue structural validity**
    - **Validates: Requirements 6.3, 6.4, 6.5**

  - [x] 18.6 Write property test for music cue transition validity
    - **Property 8: Music cue transition validity**
    - **Validates: Requirements 7.4**

  - [x] 18.7 Write property test for underscore flagging on dialogue overlap
    - **Property 9: Underscore flagging on dialogue overlap**
    - **Validates: Requirements 7.5**

  - [x] 18.8 Write property test for voice assignment uniqueness and consistency
    - **Property 6: Voice assignment uniqueness and consistency**
    - **Validates: Requirements 5.1, 5.2, 5.3**

  - [x] 18.9 Write property test for retry with exponential backoff
    - **Property 10: Retry with exponential backoff**
    - **Validates: Requirements 8.4**

  - [x] 18.10 Write property test for audio asset caching idempotence
    - **Property 11: Audio asset caching idempotence**
    - **Validates: Requirements 8.5**

  - [x] 18.11 Write property test for dialogue volume priority in audio mix
    - **Property 12: Dialogue volume priority in audio mix**
    - **Validates: Requirements 9.2, 9.3**

  - [x] 18.12 Write property test for music transition filter correctness
    - **Property 13: Music transition filter correctness**
    - **Validates: Requirements 9.4**

  - [x] 18.13 Write property test for ambient SFX loop coverage
    - **Property 14: Ambient SFX loop coverage**
    - **Validates: Requirements 9.5**

  - [x] 18.14 Write property test for scene concatenation ordering
    - **Property 15: Scene concatenation ordering**
    - **Validates: Requirements 9.6**

  - [x] 18.15 Write property test for drama style propagation
    - **Property 3: Drama style propagation**
    - **Validates: Requirements 2.2**

  - [x] 18.16 Write property test for playback position localStorage round-trip
    - **Property 18: Playback position localStorage round-trip**
    - **Validates: Requirements 11.6**

  - [x] 18.17 Write property test for thumbnail generation for all styles
    - **Property 24: Thumbnail generation for all styles**
    - **Validates: Requirements 15.1, 15.3**

  - [x] 18.18 Write property test for pipeline status rendering correctness
    - **Property 21: Pipeline status rendering correctness**
    - **Validates: Requirements 13.1, 13.2, 13.4**

  - [x] 18.19 Write unit tests for expanded ingestion
    - Test PDF file extraction
    - Test EPUB file extraction
    - Test file at exact 5MB boundary
    - Test unsupported file extensions list all four formats in error
    - _Requirements: 1.1, 1.4, 1.5_

  - [x] 18.20 Write unit tests for Scene Adapter
    - Test creative mode on/off changes prompt content
    - Test style preset injection into prompt
    - Test first scene receives "none" as previous context
    - _Requirements: 14.2, 14.9, 16.3_

  - [x] 18.21 Write unit tests for Thumbnail Generator
    - Test thumbnail dimensions are 640x360
    - Test each style produces distinct gradient colors
    - _Requirements: 15.1, 15.3_

  - [x] 18.22 Write unit tests for UI components
    - Test LibraryView renders thumbnails and all required elements
    - Test StyleSelector shows all 10 styles
    - Test CreativeModeToggle renders and changes state
    - Test auto-advance triggers next episode playback
    - Test localStorage playback position save/load
    - Test ProcessingView displays stageDetail text
    - Test completion notification appears on pipeline success
    - _Requirements: 11.1, 11.4, 11.6, 13.1, 13.3, 13.4, 14.1_

  - [x] 18.23 Write integration tests
    - Test LLM pipeline rounds 1-4 are called in sequence with correct inputs (mock LLM)
    - Test scene-by-scene context passing: each scene adaptation call includes previous scene output (mock LLM)
    - Test ElevenLabs TTS sends correct voice ID and text per dialogue line (mock API)
    - Test ElevenLabs SFX prompts match cue descriptions (mock API)
    - Test ElevenLabs Music prompts match cue mood/style (mock API)
    - Test FFmpeg filter graph construction (mock subprocess)
    - Test style preset injection into LLM prompts for all 10 styles
    - Test creative mode changes combined adaptation prompts
    - Test coherence verification includes creative fidelity check when creative mode is on
    - Test granular progress callbacks from Audio Generator
    - Test recap narration is generated for episodes 2+ and not for episode 1
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 8.1, 8.2, 8.3, 9.1, 2.4, 10.5, 13.4, 14.2, 14.8_

- [x] 19. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks 1-4 are already completed and implemented — do not modify
- Tasks marked with `*` are optional and can be skipped for faster MVP
- All testing tasks (Task 18) are grouped into a single optional phase at the end — priority is: (1) working pipeline, (2) polished UI, (3) tests only if time remains
- Each task references specific requirements for traceability
- Property tests validate the 24 universal correctness properties from the design document using `fast-check`
- Unit tests validate specific examples and edge cases
- Integration tests verify external service interactions with mocked dependencies
- All property tests must run a minimum of 100 iterations and include the tag format: `Feature: audio-drama-engine, Property {number}: {property_text}`
