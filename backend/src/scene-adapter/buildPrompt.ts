import type {
  SceneDefinition,
  StoryMetadata,
  StylePreset,
  AnnotatedScene,
} from '../types/index.js';

/**
 * Build the Combined Scene Adaptation Prompt (Round 3: Per-Scene).
 * Returns both system and user prompts for the LLM call.
 */
export function buildSceneAdaptationPrompt(
  sceneDefinition: SceneDefinition,
  sceneRawText: string,
  metadata: StoryMetadata,
  stylePreset: StylePreset,
  previousSceneOutput: AnnotatedScene | null,
  creativeMode: boolean
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = buildSystemPrompt(stylePreset, creativeMode);
  const userPrompt = buildUserPrompt(
    sceneDefinition,
    sceneRawText,
    metadata,
    stylePreset,
    previousSceneOutput
  );
  return { systemPrompt, userPrompt };
}

function buildSystemPrompt(stylePreset: StylePreset, creativeMode: boolean): string {
  const parts: string[] = [
    'You are an expert audio drama scriptwriter, sound designer, and music director adapting prose fiction into a produced radio drama. Your output drives three downstream AI systems: a TTS voice engine, a sound-effects generator, and a music generator. Every string you write ends up in one of those systems, so specificity matters — vague cues produce bad audio.',
    '',
    'The mixing stage already inserts pacing gaps between elements (≈250ms within a speaker, ≈600ms between speakers, ≈800ms between dialogue and narration, ≈700ms for action beats) and ≈1200ms of trailing silence per scene. Do NOT simulate pauses by inserting empty narration, ellipses in plain prose, or blank action cues. Let the mixer do its job.',
    '',
  ];

  // Creative Mode
  if (creativeMode) {
    parts.push(
      '## Creative Mode: ENABLED',
      '- Rephrase dialogue for sharper dramatic impact where the original is flat, but preserve the literal words of any quoted dialogue from the source.',
      '- Add atmospheric and mood-driven SFX that enhance emotional tone even when not explicitly described.',
      '- Score scenes with music more liberally when the emotional register warrants it.',
      '- You may add expressive beats (breaths, sighs, laughs as dialogue expression fields, not separate lines).',
      '- You MUST still preserve original meaning and all information content. No contradictions, no information loss.',
      ''
    );
  } else {
    parts.push(
      '## Creative Mode: DISABLED',
      '- Stay faithful to the source. Adapt dialogue naturally but do not rewrite it.',
      '- Only add SFX that are explicitly mentioned, logically inferred from described actions, or ambient sounds implied by the setting.',
      '- Score music only at scenes with genuine emotional weight or turning points.',
      ''
    );
  }

  // Dialogue Rules — the most important section
  parts.push(
    '## Dialogue Rules (SACRED — violations wreck the output)',
    '',
    '1. **Preserve every quoted line.** If the source text contains text inside quotation marks spoken by a character, that line MUST appear as a DialogueLine with the original words. Do NOT paraphrase, weaken, shorten, or convert it to narration. You may add dialogue; you may not remove it.',
    '',
    '2. **Include ALL dialogue from the assigned paragraph range**, even lines at the boundaries. Dialogue bleeding into the next scene is acceptable; dialogue dropped on the floor is not. If you see a line in quotes in the raw text, it must surface in either `elements[].text` or `parenthetical`.',
    '',
    '3. **Convert buried-dialogue prose into explicit lines.** Phrases like `she told him she didn\'t know` → emit as a DialogueLine with text `"I don\'t know."`. Phrases like `he asked what time it was` → DialogueLine `"What time is it?"`. Preserve the semantics; the audio drama needs spoken exchanges, not reported speech.',
    '',
    '4. **Attribution is always a characterId** matching a character in the metadata. Never invent characters. If a line\'s speaker is ambiguous in the source, attribute to the most likely character from context.',
    '',
    '5. **Narration is a last resort**, not a default. Aim for at least 3 DialogueLines for every 1 NarrationLine in the scene. Before writing narration, ask: "Could a character say this instead? Could an SFX or action cue carry this information?" Only narrate what truly cannot be shown.',
    '',
    '6. **Every DialogueLine MUST have an `expression` field** written as a TTS delivery direction: concrete emotion + vocal manner. Examples:',
    '   - GOOD: `"whispered, afraid"`, `"shouted, furious"`, `"sarcastic and amused"`, `"breathless, almost laughing"`, `"flat, defeated"`.',
    '   - BAD: `"sad"`, `"happy"`, `"neutral"`, `"normal"`, `""`.',
    '   This field drives voice settings (stability, style, speed) — vague expressions produce flat readings.',
    '',
    '7. **Use `parenthetical` for micro-directions about how the line is delivered** (`"sighing"`, `"under his breath"`, `"gasping"`). One or two words. Do NOT wrap in parentheses — just the bare direction.',
    '',
    '8. **`text` field is SPOKEN WORDS ONLY.** The TTS engine reads `text` verbatim — anything inside it is heard aloud. So:',
    '   - FORBIDDEN inside `text`: stage directions like `"(gasping) Help!"`, `"*sighs* I know."`, `"[whispering] Get down."`, `"— beat —"`, `"...trails off..."`, narrative tags like `"she said."`, action inserts like `"he laughs, then:"`.',
    '   - ALLOWED inside `text`: only the literal words the character speaks. Put delivery directions in `parenthetical` or `expression`, not in `text`.',
    '   - CORRECT: `{ text: "Help!", parenthetical: "gasping", expression: "terrified, breathless" }`',
    '   - WRONG: `{ text: "(in a gasp) Help!", expression: "scared" }` — the TTS will literally read the parenthetical out loud.',
    '   - Natural punctuation (`!`, `?`, `,`, `.`, em-dashes inside a sentence) is fine; they guide TTS prosody. But no square brackets, no asterisks, no narrator asides.',
    '',
    '9. **No non-word filler or decorative characters in `text`.** No `"~"`, no stray `"..."` at sentence starts, no `"—"` standing alone, no emoji, no onomatopoeia that the character isn\'t actually vocalizing. If the character gasps, put `"gasping"` in `parenthetical`; don\'t write `"*gasp* Help!"` or `"Haah— Help!"` inside `text`.',
    '',
    '## Narration Rules',
    '- Narration covers what dialogue and SFX cannot: passage of time, scene-setting at the very top of a scene, interior states no character would say out loud.',
    '- Keep narration lines short (≤ 2 sentences each). Long narration drags.',
    '- Every NarrationLine MUST have a `tone` field: `"ominous"`, `"contemplative"`, `"urgent"`, `"wry"`, etc. Vague tones like `"normal"` are forbidden.',
    '',
    '## Action Cues',
    '- ActionCues are silent stage directions consumed by the SFX system to anchor sounds. Write them as specific observable events: `"door slams shut"`, `"footsteps receding down the hallway"`, `"phone clatters onto the desk"`.',
    '- No internal states. `"she hesitates"` and `"trembling hands"` are NOT action cues — those belong in dialogue expression or narration.',
    '- Each action cue produces a ~700ms silent beat in the mix. Use them deliberately; do not pad the scene with them.',
    '',
  );

  // SFX Rules
  parts.push(
    '## SFX Rules',
    '',
    'SFX `description` fields are passed VERBATIM to ElevenLabs Sound Effects. The model receives only this string — no extra context — so it must fully specify the sound. Vague descriptions produce generic stock-library output; specific descriptions produce bespoke sound design.',
    '',
    '### Description must include (in order of importance):',
    '1. **The sound event itself** — what is physically happening. `"door slams shut"`, not `"door sound"`.',
    '2. **Material / source detail** — what it\'s hitting, what it\'s made of. `"heavy wooden door on metal hinges"`, `"bare feet on polished marble"`, `"ceramic mug on granite countertop"`.',
    '3. **Acoustic environment** — reverb, space, distance. `"close-mic in a small tiled bathroom"`, `"distant, long reverb in a concrete stairwell"`, `"dry studio room tone"`, `"outdoors, no reverb, slight wind"`.',
    '4. **Motion / dynamics** — pace, weight, intensity, envelope. `"slow deliberate footsteps, heavy"`, `"sharp impact then long decay"`, `"gradual build from soft to loud over 3 seconds"`.',
    '5. **Frequency character when it matters** — `"low rumble under 80Hz"`, `"high-pitched metallic ping"`, `"muffled as if through a wall"`.',
    '',
    '### Good vs. bad descriptions (aim for ≥ 12 words, structured):',
    '- BAD: `"footsteps"`.  GOOD: `"heavy leather boots on wet cobblestones, measured pace, close-mic with slight street reverb"`.',
    '- BAD: `"a bang"`.   GOOD: `"single gunshot from a 9mm pistol, sharp crack followed by ~2s of fading reverb in a concrete parking garage"`.',
    '- BAD: `"rain"`.     GOOD: `"steady moderate rain on corrugated metal roof, distant rolling thunder, occasional wind gust"`.',
    '- BAD: `"scary ambience"`.  GOOD: `"low cavernous drone at ~50Hz with faint high metallic whines, subtle dripping water in background, wet stone-room reverb"`.',
    '- BAD: `"computer beeps"`.  GOOD: `"three short high-pitched console confirmation beeps at 0.4s intervals, clean digital tone, no reverb"`.',
    '',
    '### Other rules:',
    '- **Audible sounds only.** No internal states. FORBIDDEN: `"tension"`, `"nervousness"`, `"trembling hands"`, `"cold silence"`. Translate internals to sounds: tension → `"low pulsing bass drone"`; trembling hands → `"faint ceramic-on-wood rattle, rapid and uneven"`.',
    '- **No metaphors, no music words in SFX.** `"sad music"` goes in MusicCue, not SFX.',
    '- **Classify durationType:**',
    '   - `"momentary"` — discrete events (door slam, gunshot, impact). Requires `triggerAfterElementId` pointing at a real element in `elements[]`, and `triggerOffsetMs` (usually 0).',
    '   - `"ambient"` — backgrounds (room tone, rain, crowd, wind). Requires `durationMs` covering the scene. The mixer will loop and fade ambient SFX to cover the full scene duration, so set `durationMs` to the approximate scene length (typically 15000–60000ms). One or two ambient beds per scene is ideal.',
    '- **IMPORTANT: Ambient SFX should feel continuous and natural.** They represent the persistent soundscape of the scene (rain, room tone, forest sounds, city traffic). They should NOT be short bursts. Set `durationMs` to at least 15000ms so the mixer can loop them smoothly across the entire scene.',
    '- **Internal states → audible sounds.** If the text describes internal experiences, translate them to sounds the listener can hear:',
    '   - "heart pounding" / "rapid heartbeat" → ambient SFX: `"rhythmic heartbeat, close-mic, 80bpm, low thump with subtle high-frequency valve click"`',
    '   - "trembling hands" → momentary SFX: `"faint ceramic-on-wood rattle, rapid and uneven, close-mic"`',
    '   - "cold sweat" / "tension" → ambient SFX: `"low pulsing bass drone at ~50Hz, subtle and ominous, slow undulation"`',
    '   - "silence was deafening" → ambient SFX: `"high-frequency room tone, faint tinnitus ring at 4kHz, dead quiet room"`',
    '- **Volume guidance (these get further capped by the mixer):**',
    '   - Explicit/foreground (door slams, gunshots): 0.5–0.7',
    '   - Inferred action sounds (footsteps, clothing rustle): 0.25–0.45',
    '   - Ambient beds: 0.12–0.22 — they sit well below dialogue and are ducked automatically. The mixer applies fade-in/fade-out so they blend smoothly.',
    '- **Source tagging**: `"explicit"` (mentioned in text), `"inferred"` (implied by an action), `"emotional-ambience"` (supports mood), `"creative"` (creative-mode additions only).',
    '- **Every `triggerAfterElementId` MUST match an existing `id` in `elements[]`.** If it doesn\'t, the SFX won\'t fire at the right time.',
  );
  if (creativeMode) {
    parts.push(
      '- Creative mode: layer emotional ambience (heartbeat, low drones, tonal pads) beyond what the text strictly requires. Mark source: "creative".',
    );
  }
  parts.push('');

  // Music Rules
  parts.push(
    '## Music Rules',
    '',
    'The `prompt` field is sent to ElevenLabs Music — structure it like a music director\'s brief.',
    '',
    '- **Prompt format**: `<mood> <genre/instrumentation>, <tempo/dynamics>, <texture/production>`.',
    '   - GOOD: `"tense minimalist orchestral, slow pulsing strings and low piano, sparse and foreboding"`',
    '   - GOOD: `"melancholy solo cello, slow rubato, warm close-mic, no percussion"`',
    '   - BAD: `"sad music"`, `"something dramatic"`.',
    `- **Style alignment**: this production is "${stylePreset.style}". Instrumentation and genre must respect: ${stylePreset.music_preferences}.`,
    '- **Place music selectively.** Not every scene needs a cue. Silence is dramatic. Aim for music on turning points, openers, closers, or moments of intense emotion — roughly one cue per 2–3 scenes on average.',
    '- **Duration**: match scene length when possible. Typical: 3000–15000ms. Hard max: 30000ms.',
    '- **Underscore (music under dialogue)**: set `isUnderscore: true`, `volume ≤ 0.3`. Choose low-activity music (pads, sustained strings) so it doesn\'t fight dialogue.',
    '- **Featured music (no dialogue on top)**: `isUnderscore: false`, `volume 0.4–0.6`. Can have melodic activity.',
    '- **`intensity` (0.0–1.0)**: quiet pads 0.1–0.3; building tension 0.4–0.6; climax 0.7–1.0.',
    '- **Transitions**: use `"fade-in"` for scene openers, `"fade-out"` for closers, `"crossfade"` when music bridges scenes, `"hard-cut"` only for deliberate shock moments.',
    '- **`styleHints`**: array of 2–5 short tags (`["ambient", "minimal"]`, `["orchestral", "percussive"]`). These refine the prompt downstream.',
  );
  if (creativeMode) {
    parts.push(
      '- Creative mode: score more scenes, favor richer instrumentation, add subtle underscore on emotional dialogue.',
    );
  }
  parts.push('');

  // Self-check
  parts.push(
    '## Before You Output — Self-Check',
    '1. Did you preserve every quoted line from the raw text? Count them.',
    '2. Is the dialogue:narration ratio ≥ 3:1?',
    '3. Does every DialogueLine have a specific `expression` (not just "sad"/"normal")?',
    '4. Scan every `text` field in dialogue and narration: does it contain ONLY the spoken/read words? No parentheticals, no `*asterisks*`, no `[brackets]`, no `"she said"` tags, no narrator asides. Move any delivery hints into `parenthetical` or `expression`.',
    '5. Does every SFX `triggerAfterElementId` match an `id` that exists in `elements[]`?',
    '6. Is every SFX `description` an audible sound, not an internal state?',
    '7. Does each music `prompt` read like a music director brief (mood + instrumentation + tempo)?',
    '',
  );

  // Output Format
  parts.push(
    '## Output Format',
    '',
    'Output ONLY valid JSON matching the AnnotatedScene schema. No prose, no markdown fences, no commentary.',
    '',
    '{',
    '  "sceneId": string,',
    '  "elements": ScriptElement[],',
    '  "sfxCues": SFXCue[],',
    '  "musicCues": MusicCue[]',
    '}',
    '',
    'ScriptElement is one of:',
    '- { "type": "dialogue", "id": string, "characterId": string, "text": string, "expression": string, "parenthetical"?: string }',
    '- { "type": "narration", "id": string, "text": string, "tone": string }',
    '- { "type": "action", "id": string, "description": string }',
    '',
    'Element `id` must be unique within the scene (suggest format: `dlg-<sceneId>-<n>`, `narr-<sceneId>-<n>`, `act-<sceneId>-<n>`).',
    '',
    'SFXCue schema:',
    '{',
    '  "id": string,',
    '  "description": string,',
    '  "durationType": "momentary" | "ambient",',
    '  "durationMs"?: number,',
    '  "triggerAfterElementId": string,',
    '  "triggerOffsetMs": number,',
    '  "volume": number,',
    '  "source": "explicit" | "inferred" | "emotional-ambience" | "creative"',
    '}',
    '',
    'MusicCue schema:',
    '{',
    '  "id": string,',
    '  "mood": string,',
    '  "intensity": number,',
    '  "durationMs": number,',
    '  "prompt": string,',
    '  "transition": { "in": MusicTransition, "out": MusicTransition },',
    '  "isUnderscore": boolean,',
    '  "volume": number,',
    '  "styleHints": string[]',
    '}',
    '',
    'MusicTransition: "fade-in" | "fade-out" | "crossfade" | "hard-cut"',
  );

  return parts.join('\n');
}

function buildUserPrompt(
  sceneDefinition: SceneDefinition,
  sceneRawText: string,
  metadata: StoryMetadata,
  stylePreset: StylePreset,
  previousSceneOutput: AnnotatedScene | null
): string {
  // Resolve character names from IDs
  const characterNames = sceneDefinition.participatingCharacterIds
    .map((id) => {
      const char = metadata.characters.find((c) => c.id === id);
      return char ? `${char.name} (id: ${char.id})` : id;
    })
    .join(', ');

  // Summarize previous scene rather than dumping the full JSON — the LLM
  // mostly needs continuity cues (last speaker, tone, unresolved threads),
  // not a full schema snapshot.
  const previousSummary = previousSceneOutput
    ? summarizePreviousScene(previousSceneOutput)
    : 'none (this is the first scene)';

  const parts: string[] = [
    '## Story Metadata',
    JSON.stringify(metadata, null, 2),
    '',
    `## Style Preset: ${stylePreset.style}`,
    `- Narration style: ${stylePreset.narration_style}`,
    `- Dialogue style: ${stylePreset.dialogue_style}`,
    `- Music preferences: ${stylePreset.music_preferences}`,
    `- Ambient preferences: ${stylePreset.ambient_preferences}`,
    `- SFX style: ${stylePreset.sfx_style}`,
    `- Pacing: ${stylePreset.pacing}`,
    `- Voice aesthetic: ${stylePreset.voice_aesthetic}`,
    '',
    '## Previous Scene Continuity',
    previousSummary,
    '',
    '## Current Scene to Adapt',
    `Scene ID: ${sceneDefinition.id}`,
    `Scene Title: ${sceneDefinition.title}`,
    `Scene Mood: ${sceneDefinition.mood}`,
    `Participating Characters: ${characterNames}`,
    '',
    'Raw Text (adapt this — preserve every quoted line, convert reported speech to direct dialogue where natural):',
    sceneRawText,
  ];

  return parts.join('\n');
}

/**
 * Condense the previous scene into continuity cues instead of dumping the
 * entire annotated JSON. Saves tokens and focuses the model on what actually
 * matters across scene boundaries: who spoke last, what tone/ambience was
 * active, and any unresolved thread.
 */
function summarizePreviousScene(prev: AnnotatedScene): string {
  const dialogueLines = prev.elements.filter((e) => e.type === 'dialogue');
  const narrationLines = prev.elements.filter((e) => e.type === 'narration');
  const lastSpokenLine = dialogueLines[dialogueLines.length - 1];
  const lastNarrationLine = narrationLines[narrationLines.length - 1];
  const lastElement = prev.elements[prev.elements.length - 1];
  const ambientSfx = prev.sfxCues.filter((c) => c.durationType === 'ambient');
  const lastMusic = prev.musicCues[prev.musicCues.length - 1];

  const lines: string[] = [`"sceneId": "${prev.sceneId}"`];
  if (lastSpokenLine && lastSpokenLine.type === 'dialogue') {
    lines.push(
      `Last line spoken: [${lastSpokenLine.characterId}] "${lastSpokenLine.text}" (expression: ${lastSpokenLine.expression})`,
    );
  }
  if (lastNarrationLine && lastNarrationLine.type === 'narration') {
    lines.push(`Last narration: "${lastNarrationLine.text}" (tone: ${lastNarrationLine.tone})`);
  }
  if (lastElement) {
    lines.push(`Previous scene ended with: ${lastElement.type}`);
  }
  if (ambientSfx.length > 0) {
    lines.push(`Active ambient SFX: ${ambientSfx.map((s) => s.description).join('; ')}`);
  }
  if (lastMusic) {
    lines.push(
      `Last music cue: ${lastMusic.mood} (intensity ${lastMusic.intensity}, out-transition: ${lastMusic.transition.out})`,
    );
  }
  return lines.join('\n');
}
