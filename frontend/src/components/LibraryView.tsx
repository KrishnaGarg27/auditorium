import { useEffect, useState, useCallback } from 'react';
import type { DramaSummary } from '../types';
import { fetchDramas } from '../api';
import DramaCard from './DramaCard';
import './LibraryView.css';

interface LibraryViewProps {
  onSelectDrama?: (drama: DramaSummary) => void;
  onCreateNew?: () => void;
  /** Incremented externally to trigger a refresh (e.g. after creating a drama). */
  refreshKey?: number;
}

export default function LibraryView({ onSelectDrama, onCreateNew, refreshKey }: LibraryViewProps) {
  const [dramas, setDramas] = useState<DramaSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDramas();
      setDramas(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dramas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <section className="library" aria-label="Drama library">
      <header className="library__header">
        <h2 className="library__title">Your Dramas</h2>
        <button className="library__create-btn" onClick={onCreateNew} type="button">
          + New Drama
        </button>
      </header>

      {loading && <p className="library__message">Loading…</p>}
      {error && <p className="library__message library__message--error">{error}</p>}

      {!loading && !error && dramas.length === 0 && (
        <p className="library__message">No dramas yet. Create your first one!</p>
      )}

      {!loading && !error && dramas.length > 0 && (
        <div className="library__grid" role="list">
          {dramas.map((d) => (
            <div role="listitem" key={d.id} style={{ width: '100%' }}>
              <DramaCard drama={d} onClick={() => onSelectDrama?.(d)} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
