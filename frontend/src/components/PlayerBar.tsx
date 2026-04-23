import { useCallback, useRef, useState } from 'react';
import type { AudioPlayerState, AudioPlayerActions } from '../hooks/useAudioPlayer';
import { PLAYBACK_RATES } from '../hooks/useAudioPlayer';
import './PlayerBar.css';

function formatRate(rate: number): string {
  return Number.isInteger(rate) ? `${rate}×` : `${rate}×`;
}

interface PlayerBarProps {
  state: AudioPlayerState;
  actions: AudioPlayerActions;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function PlayerBar({ state, actions }: PlayerBarProps) {
  const { isPlaying, currentTime, duration, dramaTitle, currentEpisode, playbackRate } = state;
  const trackRef = useRef<HTMLDivElement>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);

  const cyclePlaybackRate = useCallback(() => {
    const idx = PLAYBACK_RATES.indexOf(playbackRate);
    const nextIdx = idx === -1 ? PLAYBACK_RATES.indexOf(1) : (idx + 1) % PLAYBACK_RATES.length;
    actions.setPlaybackRate(PLAYBACK_RATES[nextIdx]);
  }, [playbackRate, actions]);

  const getTimeFromEvent = useCallback(
    (e: React.MouseEvent | MouseEvent): number => {
      const track = trackRef.current;
      if (!track || !duration) return 0;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration],
  );

  const handleTrackMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const time = getTimeFromEvent(e);
      setScrubTime(time);
      setIsScrubbing(true);

      const onMouseMove = (ev: MouseEvent) => {
        const t = getTimeFromEvent(ev);
        setScrubTime(t);
      };
      const onMouseUp = (ev: MouseEvent) => {
        const t = getTimeFromEvent(ev);
        actions.seek(t);
        setIsScrubbing(false);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [getTimeFromEvent, actions],
  );

  if (!currentEpisode) return null;

  const displayTime = isScrubbing ? scrubTime : currentTime;
  const progress = duration > 0 ? (displayTime / duration) * 100 : 0;

  return (
    <div className="player-bar" role="region" aria-label="Audio player">
      {/* Now playing info */}
      <div className="player-bar__info">
        <p className="player-bar__episode-title">{currentEpisode.title}</p>
        <p className="player-bar__drama-title">{dramaTitle}</p>
      </div>

      {/* Transport controls */}
      <div className="player-bar__controls">
        <button
          className="player-bar__btn"
          type="button"
          aria-label="Skip backward 15 seconds"
          onClick={actions.skipBackward}
        >
          -15
        </button>
        <button
          className="player-bar__btn player-bar__btn--play"
          type="button"
          aria-label={isPlaying ? 'Pause' : 'Play'}
          onClick={actions.togglePlayPause}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button
          className="player-bar__btn"
          type="button"
          aria-label="Skip forward 15 seconds"
          onClick={actions.skipForward}
        >
          +15
        </button>
        <button
          className="player-bar__btn player-bar__btn--speed"
          type="button"
          aria-label={`Playback speed: ${formatRate(playbackRate)}. Click to change.`}
          title="Playback speed"
          onClick={cyclePlaybackRate}
        >
          {formatRate(playbackRate)}
        </button>
      </div>

      {/* Seek bar */}
      <div className="player-bar__seek">
        <span className="player-bar__time">{formatTime(displayTime)}</span>
        <div
          className="player-bar__track"
          ref={trackRef}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.floor(duration)}
          aria-valuenow={Math.floor(displayTime)}
          tabIndex={0}
          onMouseDown={handleTrackMouseDown}
        >
          <div
            className="player-bar__track-fill"
            style={{ width: `${progress}%` }}
          />
          <div
            className="player-bar__track-thumb"
            style={{ left: `${progress}%` }}
          />
        </div>
        <span className="player-bar__time">{formatTime(duration)}</span>
      </div>

      {/* Close button */}
      <button
        className="player-bar__btn player-bar__btn--close"
        type="button"
        aria-label="Close player"
        onClick={actions.close}
      >
        ✕
      </button>
    </div>
  );
}
