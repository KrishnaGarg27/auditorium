import { Router } from 'express';
import { STYLE_PRESETS } from '../types/index.js';
import type { DramaStyle } from '../types/index.js';

export function createStylesRoutes(): Router {
  const router = Router();

  // GET /api/styles — List available drama styles with preset summaries
  router.get('/', (_req, res) => {
    const styles = (Object.keys(STYLE_PRESETS) as DramaStyle[]).map((key) => {
      const preset = STYLE_PRESETS[key];
      return {
        style: key,
        narration_style: preset.narration_style,
        dialogue_style: preset.dialogue_style,
        music_preferences: preset.music_preferences,
        pacing: preset.pacing,
        voice_aesthetic: preset.voice_aesthetic,
      };
    });
    res.json(styles);
  });

  return router;
}
