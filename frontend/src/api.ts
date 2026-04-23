import type { Drama, DramaSummary, DramaStyle, PipelineStatus } from './types';

const BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

/**
 * Centralized fetch wrapper with consistent error handling.
 * Parses JSON error bodies and throws typed Error messages.
 */
async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error('Network error — please check your connection');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message =
      (body as Record<string, unknown>).error ??
      `Request failed (${res.status})`;
    throw new Error(String(message));
  }

  // 204 No Content — nothing to parse
  if (res.status === 204) return undefined as unknown as T;

  return res.json() as Promise<T>;
}

export async function fetchDramas(): Promise<DramaSummary[]> {
  return apiFetch<DramaSummary[]>(`${BASE}/dramas`);
}

export interface CreateDramaByFileParams {
  file: File;
  style?: DramaStyle;
  creativeMode: boolean;
}

export interface CreateDramaByPromptParams {
  prompt: string;
  style?: DramaStyle;
  creativeMode: boolean;
}

export async function createDramaByFile(
  params: CreateDramaByFileParams,
): Promise<{ dramaId: string; jobId: string }> {
  const form = new FormData();
  form.append('file', params.file);
  if (params.style) form.append('style', params.style);
  form.append('creativeMode', String(params.creativeMode));

  return apiFetch<{ dramaId: string; jobId: string }>(`${BASE}/dramas`, {
    method: 'POST',
    body: form,
  });
}

export async function createDramaByPrompt(
  params: CreateDramaByPromptParams,
): Promise<{ dramaId: string; jobId: string }> {
  return apiFetch<{ dramaId: string; jobId: string }>(`${BASE}/dramas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: params.prompt,
      style: params.style,
      creativeMode: params.creativeMode,
    }),
  });
}

export async function fetchDrama(id: string): Promise<Drama> {
  return apiFetch<Drama>(`${BASE}/dramas/${encodeURIComponent(id)}`);
}

export async function fetchDramaStatus(
  dramaId: string,
  jobId: string,
): Promise<PipelineStatus> {
  return apiFetch<PipelineStatus>(
    `${BASE}/dramas/${encodeURIComponent(dramaId)}/status?jobId=${encodeURIComponent(jobId)}`,
  );
}

/** Fetch available drama styles with preset summaries from the backend. */
export async function fetchStyles(): Promise<
  Array<{
    style: DramaStyle;
    narration_style: string;
    dialogue_style: string;
    music_preferences: string;
    pacing: string;
    voice_aesthetic: string;
  }>
> {
  return apiFetch(`${BASE}/styles`);
}

/** Build the audio streaming URL for a given drama episode. */
export function getAudioUrl(dramaId: string, episodeId: string): string {
  return `${BASE}/dramas/${encodeURIComponent(dramaId)}/episodes/${encodeURIComponent(episodeId)}/audio`;
}
