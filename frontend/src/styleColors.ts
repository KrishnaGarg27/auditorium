import type { DramaStyle } from './types';

/** Gradient colors per style, matching the thumbnail generator palette. */
export const STYLE_COLORS: Record<DramaStyle, { from: string; to: string }> = {
  noir:            { from: '#36454F', to: '#FFBF00' },
  anime:           { from: '#FF69B4', to: '#E6E6FA' },
  horror:          { from: '#000000', to: '#8B0000' },
  cyberpunk:       { from: '#800080', to: '#00FFFF' },
  'dark-thriller': { from: '#000080', to: '#71797E' },
  'fantasy-epic':  { from: '#013220', to: '#FFD700' },
  romance:         { from: '#FF6FFF', to: '#FF7F50' },
  comedy:          { from: '#FFFF00', to: '#FFA500' },
  documentary:     { from: '#8C92AC', to: '#FFFFFF' },
  cinematic:       { from: '#310062', to: '#C0C0C0' },
};

/** Returns a CSS linear-gradient string for the given style. */
export function styleGradient(style: DramaStyle): string {
  const c = STYLE_COLORS[style];
  return `linear-gradient(135deg, ${c.from}, ${c.to})`;
}

/** Badge background — uses the "from" color at reduced opacity. */
export function styleBadgeBg(style: DramaStyle): string {
  const c = STYLE_COLORS[style];
  return c.from;
}
