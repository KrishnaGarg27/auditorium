import type { DramaSummary } from '../types';
import { styleGradient } from '../styleColors';
import './DramaCard.css';

interface DramaCardProps {
  drama: DramaSummary;
  onClick?: () => void;
}

function formatStyleLabel(style: string): string {
  return style
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function DramaCard({ drama, onClick }: DramaCardProps) {
  // thumbnailPath is now a Cloudinary URL (https://...) or a local path
  const isUrl = drama.thumbnailPath?.startsWith('http');
  const thumbnailUrl = drama.thumbnailPath
    ? isUrl
      ? drama.thumbnailPath
      : `/api/dramas/${drama.id}/thumbnail`
    : undefined;

  const gradient = styleGradient(drama.style);

  // Use separate background properties to avoid shorthand conflicts with CSS
  const thumbnailStyle: React.CSSProperties = thumbnailUrl
    ? {
        backgroundImage: `url(${thumbnailUrl}), ${gradient}`,
        backgroundSize: 'cover, cover',
        backgroundPosition: 'center, center',
      }
    : {
        backgroundImage: gradient,
      };

  return (
    <button
      className="drama-card"
      onClick={onClick}
      type="button"
      aria-label={`Open ${drama.title}`}
    >
      <div className="drama-card__thumbnail" style={thumbnailStyle}>
        {drama.status === 'processing' && (
          <span className="drama-card__status drama-card__status--processing">Processing</span>
        )}
        {drama.status === 'failed' && (
          <span className="drama-card__status drama-card__status--failed">Failed</span>
        )}

        <div className="drama-card__overlay">
          <h3 className="drama-card__title">{drama.title}</h3>
          <div className="drama-card__meta">
            <span className="drama-card__badge">{formatStyleLabel(drama.style)}</span>
            <span className="drama-card__episodes">
              {drama.episodeCount} {drama.episodeCount === 1 ? 'ep' : 'eps'}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
