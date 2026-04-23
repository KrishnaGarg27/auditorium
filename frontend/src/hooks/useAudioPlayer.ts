import { useCallback, useEffect, useRef, useState } from 'react';
import type { Episode } from '../types';
import { getAudioUrl } from '../api';

export interface AudioPlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  dramaId: string | null;
  dramaTitle: string | null;
  currentEpisode: Episode | null;
  episodes: Episode[];
  playbackRate: number;
}

export interface AudioPlayerActions {
  play: (dramaId: string, dramaTitle: string, episode: Episode, episodes: Episode[]) => void;
  togglePlayPause: () => void;
  skipForward: () => void;
  skipBackward: () => void;
  seek: (time: number) => void;
  setPlaybackRate: (rate: number) => void;
  close: () => void;
}

export const PLAYBACK_RATES: readonly number[] = [0.75, 1, 1.25, 1.5, 1.75, 2];

function storageKey(dramaId: string, episodeId: string): string {
  return `drama_${dramaId}_episode_${episodeId}`;
}

function savePosition(dramaId: string, episodeId: string, positionMs: number): void {
  try {
    localStorage.setItem(storageKey(dramaId, episodeId), String(Math.floor(positionMs)));
  } catch {
    // localStorage may be full or unavailable
  }
}

function loadPosition(dramaId: string, episodeId: string): number | null {
  try {
    const val = localStorage.getItem(storageKey(dramaId, episodeId));
    if (val === null) return null;
    const ms = Number(val);
    return Number.isFinite(ms) && ms >= 0 ? ms : null;
  } catch {
    return null;
  }
}

export function useAudioPlayer(): [AudioPlayerState, AudioPlayerActions] {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [state, setState] = useState<AudioPlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    dramaId: null,
    dramaTitle: null,
    currentEpisode: null,
    episodes: [],
    playbackRate: 1,
  });

  // Keep refs in sync for use in callbacks
  const stateRef = useRef(state);
  stateRef.current = state;

  const getOrCreateAudio = useCallback((): HTMLAudioElement => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    return audioRef.current;
  }, []);

  const clearSaveInterval = useCallback(() => {
    if (saveIntervalRef.current !== null) {
      clearInterval(saveIntervalRef.current);
      saveIntervalRef.current = null;
    }
  }, []);

  const startSaveInterval = useCallback(() => {
    clearSaveInterval();
    saveIntervalRef.current = setInterval(() => {
      const s = stateRef.current;
      const audio = audioRef.current;
      if (s.dramaId && s.currentEpisode && audio && !audio.paused) {
        savePosition(s.dramaId, s.currentEpisode.id, audio.currentTime * 1000);
      }
    }, 5000);
  }, [clearSaveInterval]);

  // Auto-advance to next episode
  const advanceToNext = useCallback(() => {
    const s = stateRef.current;
    if (!s.currentEpisode || !s.dramaId || s.episodes.length === 0) return;
    const currentIdx = s.episodes.findIndex((ep) => ep.id === s.currentEpisode!.id);
    if (currentIdx < 0 || currentIdx >= s.episodes.length - 1) {
      // No next episode — stop playback
      setState((prev) => ({ ...prev, isPlaying: false }));
      clearSaveInterval();
      return;
    }
    const nextEp = s.episodes[currentIdx + 1];
    // Play next episode
    const audio = audioRef.current!;
    audio.src = getAudioUrl(s.dramaId, nextEp.id);
    audio.playbackRate = s.playbackRate;
    const savedPos = loadPosition(s.dramaId, nextEp.id);
    const nextDurationMs = nextEp.durationMs;
    // Treat saved positions within 2s of episode end as "finished" → start fresh.
    const resumeMs =
      savedPos !== null && savedPos > 0 && savedPos < nextDurationMs - 2000
        ? savedPos
        : 0;
    audio.currentTime = 0;
    audio.play().then(() => {
      if (resumeMs > 0) {
        audio.currentTime = resumeMs / 1000;
      }
    }).catch(() => {});
    setState((prev) => ({
      ...prev,
      currentEpisode: nextEp,
      currentTime: 0,
      duration: nextEp.durationMs / 1000,
      isPlaying: true,
    }));
  }, [clearSaveInterval]);

  // Attach audio event listeners
  useEffect(() => {
    const audio = getOrCreateAudio();

    const onTimeUpdate = () => {
      setState((prev) => ({ ...prev, currentTime: audio.currentTime }));
    };
    const onDurationChange = () => {
      if (Number.isFinite(audio.duration)) {
        setState((prev) => ({ ...prev, duration: audio.duration }));
      }
    };
    const onEnded = () => {
      // Reset saved position to 0 so clicking the episode again restarts
      // from the beginning instead of landing at the end and re-firing `ended`,
      // which would auto-advance again.
      const s = stateRef.current;
      if (s.dramaId && s.currentEpisode) {
        savePosition(s.dramaId, s.currentEpisode.id, 0);
      }
      advanceToNext();
    };
    const onPlay = () => setState((prev) => ({ ...prev, isPlaying: true }));
    const onPause = () => {
      setState((prev) => ({ ...prev, isPlaying: false }));
      const s = stateRef.current;
      if (s.dramaId && s.currentEpisode) {
        savePosition(s.dramaId, s.currentEpisode.id, audio.currentTime * 1000);
      }
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, [getOrCreateAudio, advanceToNext]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearSaveInterval();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, [clearSaveInterval]);

  const play = useCallback(
    (dramaId: string, dramaTitle: string, episode: Episode, episodes: Episode[]) => {
      const audio = getOrCreateAudio();

      // If same episode is already loaded, just toggle play
      const s = stateRef.current;
      if (s.dramaId === dramaId && s.currentEpisode?.id === episode.id) {
        if (audio.paused) {
          audio.play().catch(() => {});
          startSaveInterval();
        }
        return;
      }

      // Load new episode
      audio.src = getAudioUrl(dramaId, episode.id);
      audio.playbackRate = s.playbackRate;
      const savedPos = loadPosition(dramaId, episode.id);
      // Treat saved positions within 2s of episode end as "finished" so that
      // clicking a completed episode restarts it instead of instantly ending
      // and auto-advancing.
      const resumeMs =
        savedPos !== null && savedPos > 0 && savedPos < episode.durationMs - 2000
          ? savedPos
          : 0;

      setState((prev) => ({
        ...prev,
        isPlaying: true,
        currentTime: resumeMs / 1000,
        duration: episode.durationMs / 1000,
        dramaId,
        dramaTitle,
        currentEpisode: episode,
        episodes,
      }));

      audio.play().then(() => {
        if (resumeMs > 0) {
          audio.currentTime = resumeMs / 1000;
        }
        startSaveInterval();
      }).catch(() => {});
    },
    [getOrCreateAudio, startSaveInterval],
  );

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !stateRef.current.currentEpisode) return;
    if (audio.paused) {
      audio.play().catch(() => {});
      startSaveInterval();
    } else {
      audio.pause();
      clearSaveInterval();
    }
  }, [startSaveInterval, clearSaveInterval]);

  const skipForward = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.min(audio.currentTime + 15, audio.duration || Infinity);
  }, []);

  const skipBackward = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(audio.currentTime - 15, 0);
  }, []);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    const s = stateRef.current;
    if (s.dramaId && s.currentEpisode) {
      savePosition(s.dramaId, s.currentEpisode.id, time * 1000);
    }
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = rate;
    setState((prev) => ({ ...prev, playbackRate: rate }));
  }, []);

  const close = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      // Save position before closing so it can be resumed later
      const s = stateRef.current;
      if (s.dramaId && s.currentEpisode) {
        savePosition(s.dramaId, s.currentEpisode.id, audio.currentTime * 1000);
      }
      audio.pause();
      audio.src = '';
    }
    clearSaveInterval();
    setState({
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      dramaId: null,
      dramaTitle: null,
      currentEpisode: null,
      episodes: [],
      playbackRate: state.playbackRate,
    });
  }, [clearSaveInterval, state.playbackRate]);

  return [
    state,
    { play, togglePlayPause, skipForward, skipBackward, seek, setPlaybackRate, close },
  ];
}
