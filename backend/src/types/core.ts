export type DramaStyle = 'anime' | 'noir' | 'dark-thriller' | 'horror' | 'cyberpunk' | 'fantasy-epic' | 'romance' | 'comedy' | 'documentary' | 'cinematic';

export type SFXDurationType = 'momentary' | 'ambient';

export type MusicTransition = 'fade-in' | 'fade-out' | 'crossfade' | 'hard-cut';

export interface StylePreset {
  style: DramaStyle;
  narration_style: string;
  dialogue_style: string;
  music_preferences: string;
  ambient_preferences: string;
  sfx_style: string;
  pacing: string;
  voice_aesthetic: string;
}

export const STYLE_PRESETS: Record<DramaStyle, StylePreset> = {
  anime: {
    style: 'anime',
    narration_style: 'Dramatic, emotionally heightened narration with inner monologue flavor',
    dialogue_style: 'Expressive, emotionally heightened dialogue with dramatic reactions, inner monologue expressed aloud, anime-style exclamations and dramatic pauses',
    music_preferences: 'J-pop influenced orchestral, dramatic stingers, emotional piano pieces, battle themes with driving percussion',
    ambient_preferences: 'School bells, cherry blossom wind, bustling city sounds, dramatic wind gusts',
    sfx_style: 'Dramatic impact sounds, whooshes, sparkle effects, exaggerated environmental sounds, comedic sound effects, dramatic stingers',
    pacing: 'Dynamic with dramatic pauses, building tension followed by explosive emotional releases',
    voice_aesthetic: 'Exaggerated, expressive, wide emotional range'
  },
  noir: {
    style: 'noir',
    narration_style: 'World-weary, sardonic first-person narration with hard-boiled wit',
    dialogue_style: 'Terse, cynical dialogue with clipped sentences, metaphor, and emotional distance',
    music_preferences: 'Jazz, smoky saxophone, muted trumpet, slow blues piano, noir orchestral',
    ambient_preferences: 'Rain on pavement, city traffic, jazz club backgrounds, distant sirens',
    sfx_style: 'Rain, footsteps on wet pavement, cigarette lighter clicks, muted gunshots, glass clinking',
    pacing: 'Slow, deliberate, with lingering silences and measured reveals',
    voice_aesthetic: 'Gritty, measured, low-register'
  },
  'dark-thriller': {
    style: 'dark-thriller',
    narration_style: 'Tense, urgent narration that builds psychological suspense',
    dialogue_style: 'Measured dialogue with subtext, reluctant information reveals, psychological tension',
    music_preferences: 'Tense orchestral, pulsing bass, dissonant strings, minimal piano, suspense drones',
    ambient_preferences: 'Clock ticking, heartbeats, distant thunder, creaking structures',
    sfx_style: 'Tense ambient drones, heartbeats, clock ticking, sudden silence breaks, door creaks, sharp metallic sounds',
    pacing: 'Tight, urgent, with sudden shifts and mounting pressure',
    voice_aesthetic: 'Tense, controlled, with restrained intensity'
  },
  horror: {
    style: 'horror',
    narration_style: 'Unsettling narration that builds dread through understatement and implication',
    dialogue_style: 'Vulnerable dialogue expressing denial, creeping realization, hesitations, whispered lines, terrified silence',
    music_preferences: 'Dissonant strings, music box melodies, deep drones, sudden stingers, eerie choral',
    ambient_preferences: 'Dripping water, distant whispers, wind through empty corridors, creaking wood',
    sfx_style: 'Unsettling creaks, distant whispers, sudden impacts, eerie wind, dripping water, scratching sounds, unnatural silence',
    pacing: 'Slow build with sudden shocks, long silences punctuated by jarring sounds',
    voice_aesthetic: 'Unsettling, varied between whisper and scream'
  },
  cyberpunk: {
    style: 'cyberpunk',
    narration_style: 'Edgy, street-smart narration mixing high-tech concepts with low-life grit',
    dialogue_style: 'Edgy dialogue with tech jargon, slang, cynicism about authority, casual tech references',
    music_preferences: 'Synthwave, pulsing bass, electronic beats, glitchy textures, industrial, neon-soaked synths',
    ambient_preferences: 'Electronic hums, neon buzzing, dense urban soundscapes, distant sirens, rain on metal',
    sfx_style: 'Electronic hums, neon buzzing, hydraulic hisses, digital glitches, hologram activation sounds',
    pacing: 'Fast-paced with information density, quick cuts between scenes',
    voice_aesthetic: 'Edgy, stylized, with digital processing hints'
  },
  'fantasy-epic': {
    style: 'fantasy-epic',
    narration_style: 'Grand, sweeping narration with a sense of ancient lore and destiny',
    dialogue_style: 'Rich, formal dialogue with heroic declarations, wise counsel, and emotional depth',
    music_preferences: 'Full orchestral scoring, heroic brass fanfares, ethereal choral, Celtic strings, epic percussion',
    ambient_preferences: 'Forest birdsong, rushing rivers, castle echoes, campfire crackling, wind across plains',
    sfx_style: 'Sword clashes, horse hooves, magical energy, dragon roars, nature sounds, armor clanking',
    pacing: 'Epic pacing with grand reveals, building to climactic moments',
    voice_aesthetic: 'Rich, resonant, with gravitas and warmth'
  },
  romance: {
    style: 'romance',
    narration_style: 'Warm, intimate narration with emotional vulnerability and tenderness',
    dialogue_style: 'Intimate, emotionally honest dialogue with gentle humor, longing, and warmth',
    music_preferences: 'Soft piano, acoustic guitar, gentle strings, warm jazz, indie folk',
    ambient_preferences: 'Café sounds, gentle rain, ocean waves, birdsong, rustling leaves',
    sfx_style: 'Gentle environmental sounds, soft footsteps, door opening, coffee pouring, heartbeat',
    pacing: 'Gentle, unhurried, with lingering emotional moments',
    voice_aesthetic: 'Warm, soft, intimate tones'
  },
  comedy: {
    style: 'comedy',
    narration_style: 'Witty, self-aware narration with comedic timing and playful asides',
    dialogue_style: 'Snappy, quick-witted dialogue with comedic timing, exaggerated reactions, and punchlines',
    music_preferences: 'Upbeat jazz, quirky woodwinds, playful pizzicato, comedic stingers, bouncy themes',
    ambient_preferences: 'Lively crowd sounds, upbeat city ambience, party backgrounds',
    sfx_style: 'Exaggerated SFX, cartoon-style impacts, comedic timing sounds, record scratches, slide whistles',
    pacing: 'Quick, snappy, with well-timed pauses for comedic effect',
    voice_aesthetic: 'Expressive, varied, with comedic range'
  },
  documentary: {
    style: 'documentary',
    narration_style: 'Authoritative, measured narration with journalistic clarity and gravitas',
    dialogue_style: 'Natural, realistic dialogue with authentic speech patterns and measured delivery',
    music_preferences: 'Minimal scoring, subtle ambient pads, sparse piano, restrained strings',
    ambient_preferences: 'Realistic environmental sounds, room tone, outdoor ambience, traffic',
    sfx_style: 'Realistic, understated sound effects that ground the listener in the setting',
    pacing: 'Measured, deliberate, with space for reflection',
    voice_aesthetic: 'Authoritative, clear, natural delivery'
  },
  cinematic: {
    style: 'cinematic',
    narration_style: 'Balanced, versatile narration that adapts to the emotional needs of each scene',
    dialogue_style: 'Natural yet polished dialogue with clear emotional beats and professional delivery',
    music_preferences: 'Versatile orchestral and electronic scoring, adapting mood to scene needs',
    ambient_preferences: 'Rich environmental soundscapes appropriate to each setting',
    sfx_style: 'Professional, balanced sound design with both subtle and dramatic effects as needed',
    pacing: 'Balanced pacing that serves the story, neither rushed nor lingering',
    voice_aesthetic: 'Professional, balanced, neutral default'
  }
};