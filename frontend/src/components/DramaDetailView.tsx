import { useEffect, useState } from 'react';
import type { Drama } from '../types';
import { fetchDrama } from '../api';
import { styleGradient, styleBadgeBg } from '../styleColors';
import './DramaDetailView.css';

interface DramaDetailViewProps {
  dramaId: string;
  onBack: () => void;
  onPlayEpisode?: (dramaId: string, episodeId: string) => void;
}

function formatStyleLabel(style: string): string {
  return style
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export default function DramaDetailView({ dramaId, onBack, onPlayEpisode }: DramaDetailViewProps) {
  const [drama, setDrama] = useState<Drama | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchDrama(dramaId)
      .then((data) => {
        if (!cancelled) setDrama(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load drama');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [dramaId]);

  const synopsis =
    drama?.synopsis ||
    drama?.episodes?.[0]?.synopsis ||
    (drama?.status === 'processing' ? 'Generating synopsis…' : 'No synopsis available.');

  const isUrl = drama?.thumbnailPath?.startsWith('http');
  const heroThumbnailUrl = drama?.thumbnailPath
    ? isUrl
      ? drama.thumbnailPath
      : `/api/dramas/${drama.id}/thumbnail`
    : undefined;

  const heroStyle: React.CSSProperties = drama
    ? heroThumbnailUrl
      ? {
          backgroundImage: `url(${heroThumbnailUrl}), ${styleGradient(drama.style)}`,
          backgroundSize: 'cover, cover',
          backgroundPosition: 'center top, center',
        }
      : { backgroundImage: styleGradient(drama.style) }
    : {};

  return (
    <section className="detail" aria-label="Drama detail">
      <button className="detail__back-btn" onClick={onBack} type="button" aria-label="Back to library">
        ← Back to Library
      </button>

      {loading && <p className="detail__message">Loading…</p>}
      {error && <p className="detail__message detail__message--error">{error}</p>}

      {!loading && !error && drama && (
        <>
          {/* DramaHeader */}
          <div className="detail__hero" style={heroStyle}>
            <div className="detail__hero-content">
              <h2 className="detail__title">{drama.title}</h2>
              <span
                className="detail__badge"
                style={{ background: styleBadgeBg(drama.style) }}
              >
                {formatStyleLabel(drama.style)}
              </span>
              <p className="detail__synopsis">{synopsis}</p>
            </div>
          </div>

          {/* EpisodeList */}
          <h3 className="detail__episodes-heading">Episodes</h3>
          <div className="detail__episode-list" role="list">
            {drama.episodes.map((ep) => (
              <div className="episode-card" role="listitem" key={ep.id}>
                <span className="episode-card__number">{ep.episodeNumber}</span>
                <div className="episode-card__body">
                  <h4 className="episode-card__title">{ep.title}</h4>
                  <p className="episode-card__synopsis">{ep.synopsis}</p>
                </div>
                <div className="episode-card__meta">
                  <span className="episode-card__duration">{formatDuration(ep.durationMs)}</span>
                  <button
                    className="episode-card__play-btn"
                    type="button"
                    aria-label={`Play ${ep.title}`}
                    onClick={() => onPlayEpisode?.(dramaId, ep.id)}
                  >
                    ▶
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
