import type { Drama, Episode } from '../types/index.js';
import { getSupabase } from './supabaseClient.js';

interface DramaRow {
  id: string;
  title: string;
  synopsis: string | null;
  style: string;
  creative_mode: boolean;
  thumbnail_url: string | null;
  source: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface EpisodeRow {
  id: string;
  drama_id: string;
  episode_number: number;
  title: string;
  synopsis: string | null;
  recap_narration: string | null;
  duration_ms: number;
  audio_url: string | null;
}

function rowToDrama(row: DramaRow, episodes: Episode[]): Drama {
  return {
    id: row.id,
    title: row.title,
    synopsis: row.synopsis ?? undefined,
    style: row.style as Drama['style'],
    creativeMode: row.creative_mode,
    thumbnailPath: row.thumbnail_url ?? undefined,
    source: row.source as Drama['source'],
    status: row.status as Drama['status'],
    createdAt: row.created_at,
    episodes,
  };
}

function rowToEpisode(row: EpisodeRow): Episode {
  return {
    id: row.id,
    dramaId: row.drama_id,
    episodeNumber: row.episode_number,
    title: row.title,
    synopsis: row.synopsis ?? '',
    recapNarration: row.recap_narration ?? undefined,
    durationMs: row.duration_ms,
    audioFilePath: row.audio_url ?? '',
    scenes: [],
  };
}

async function getEpisodesForDrama(dramaId: string): Promise<Episode[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('episodes')
    .select('*')
    .eq('drama_id', dramaId)
    .order('episode_number');

  if (error || !data) return [];
  return (data as EpisodeRow[]).map(rowToEpisode);
}

export function getAllDramas(): Drama[] {
  // Synchronous wrapper — we cache results for the sync API
  // This is called from Express route handlers which are sync
  return getAllDramasSync();
}

// Internal cache for sync access
let dramaCache: Drama[] = [];
let cacheStale = true;

function markCacheStale(): void {
  cacheStale = true;
}

function getAllDramasSync(): Drama[] {
  if (cacheStale) {
    // Trigger async refresh but return cached data
    refreshCache().catch(() => {});
  }
  return dramaCache;
}

async function refreshCache(): Promise<void> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('dramas')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !data) return;

  const dramas: Drama[] = [];
  for (const row of data as DramaRow[]) {
    const episodes = await getEpisodesForDrama(row.id);
    dramas.push(rowToDrama(row, episodes));
  }
  dramaCache = dramas;
  cacheStale = false;
}

export function getDrama(id: string): Drama | undefined {
  // Check cache first
  const cached = dramaCache.find(d => d.id === id);
  if (cached && !cacheStale) return cached;

  // Trigger async refresh
  getDramaAsync(id).then(d => {
    if (d) {
      const idx = dramaCache.findIndex(c => c.id === d.id);
      if (idx >= 0) dramaCache[idx] = d;
      else dramaCache.unshift(d);
    }
  }).catch(() => {});

  return cached;
}

export async function getDramaAsync(id: string): Promise<Drama | undefined> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('dramas')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return undefined;
  const episodes = await getEpisodesForDrama(id);
  const drama = rowToDrama(data as DramaRow, episodes);

  // Update cache
  const idx = dramaCache.findIndex(c => c.id === id);
  if (idx >= 0) dramaCache[idx] = drama;
  else dramaCache.unshift(drama);

  return drama;
}

export async function createDrama(drama: Drama): Promise<void> {
  const supabase = getSupabase();
  await supabase.from('dramas').insert({
    id: drama.id,
    title: drama.title,
    synopsis: drama.synopsis ?? null,
    style: drama.style,
    creative_mode: drama.creativeMode,
    thumbnail_url: drama.thumbnailPath ?? null,
    source: drama.source,
    status: drama.status,
    created_at: drama.createdAt,
  });
  markCacheStale();
}

export async function updateDrama(id: string, updates: Partial<Drama>): Promise<Drama | undefined> {
  const supabase = getSupabase();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (updates.title !== undefined) row.title = updates.title;
  if (updates.synopsis !== undefined) row.synopsis = updates.synopsis;
  if (updates.style !== undefined) row.style = updates.style;
  if (updates.creativeMode !== undefined) row.creative_mode = updates.creativeMode;
  if (updates.thumbnailPath !== undefined) row.thumbnail_url = updates.thumbnailPath;
  if (updates.status !== undefined) row.status = updates.status;

  await supabase.from('dramas').update(row).eq('id', id);
  markCacheStale();
  return getDramaAsync(id);
}

export async function deleteDrama(id: string): Promise<boolean> {
  const supabase = getSupabase();
  const { error } = await supabase.from('dramas').delete().eq('id', id);
  markCacheStale();
  return !error;
}

export async function getEpisode(dramaId: string, episodeId: string): Promise<Episode | undefined> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('episodes')
    .select('*')
    .eq('id', episodeId)
    .eq('drama_id', dramaId)
    .single();

  if (error || !data) return undefined;
  return rowToEpisode(data as EpisodeRow);
}

export async function upsertEpisode(episode: Episode): Promise<void> {
  const supabase = getSupabase();
  await supabase.from('episodes').upsert({
    id: episode.id,
    drama_id: episode.dramaId,
    episode_number: episode.episodeNumber,
    title: episode.title,
    synopsis: episode.synopsis,
    recap_narration: episode.recapNarration ?? null,
    duration_ms: episode.durationMs,
    audio_url: episode.audioFilePath,
  });
  markCacheStale();
}

/** Force refresh the cache — call after pipeline completes */
export async function refreshDramaCache(): Promise<void> {
  await refreshCache();
}

/** For testing: clear all data */
export async function _clearDramas(): Promise<void> {
  const supabase = getSupabase();
  await supabase.from('episodes').delete().neq('id', '');
  await supabase.from('dramas').delete().neq('id', '');
  dramaCache = [];
  cacheStale = true;
}
