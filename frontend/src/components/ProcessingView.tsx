import { useEffect, useState, useRef, useCallback } from 'react';
import type { PipelineStatus } from '../types';
import { STAGE_LABELS } from '../types';
import { fetchDramaStatus } from '../api';
import './ProcessingView.css';

interface ProcessingViewProps {
  dramaId: string;
  jobId: string;
  onBack: () => void;
  /** Called when the pipeline completes successfully. */
  onComplete: (dramaId: string) => void;
}

const POLL_INTERVAL_MS = 2000;

export default function ProcessingView({
  dramaId,
  jobId,
  onBack,
  onComplete,
}: ProcessingViewProps) {
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const poll = useCallback(async () => {
    if (cancelledRef.current) return;
    try {
      const s = await fetchDramaStatus(dramaId, jobId);
      if (cancelledRef.current) return;
      setStatus(s);
      setPollError(null);

      // Keep polling unless terminal
      if (s.stage !== 'complete' && s.stage !== 'failed') {
        timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      }
    } catch (err) {
      if (cancelledRef.current) return;
      setPollError(err instanceof Error ? err.message : 'Lost connection');
      // Retry even on fetch errors
      timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
    }
  }, [dramaId, jobId]);

  useEffect(() => {
    cancelledRef.current = false;
    poll();
    return () => {
      cancelledRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [poll]);

  const isComplete = status?.stage === 'complete';
  const isFailed = status?.stage === 'failed';
  const progress = status?.progress ?? 0;
  const stageLabel = status ? STAGE_LABELS[status.stage] : 'Starting…';
  const stageDetail = status?.stageDetail ?? '';

  let fillClass = 'processing__bar-fill';
  if (isFailed) fillClass += ' processing__bar-fill--error';
  if (isComplete) fillClass += ' processing__bar-fill--complete';

  return (
    <section className="processing" aria-label="Processing status">
      <button
        className="processing__back-btn"
        onClick={onBack}
        type="button"
        aria-label="Back to library"
      >
        ← Back to Library
      </button>

      {/* Icon / spinner */}
      <div className="processing__icon" aria-hidden="true">
        {isFailed ? '⚠️' : isComplete ? '✅' : (
          <span className="processing__spinner">⏳</span>
        )}
      </div>

      {/* Stage label */}
      <h2 className="processing__stage-label">{stageLabel}</h2>

      {/* Stage detail */}
      <p className="processing__stage-detail">
        {stageDetail || (pollError && `Connection issue — retrying…`) || '\u00A0'}
      </p>

      {/* Progress bar */}
      <div
        className="processing__bar-track"
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Pipeline progress"
      >
        <div
          className={fillClass}
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
      <p className="processing__percent">{progress}%</p>

      {/* Error details */}
      {isFailed && status?.error && (
        <div className="processing__error-box" role="alert">
          <p className="processing__error-title">
            Failed at: {STAGE_LABELS[status.error.stage]}
          </p>
          <p className="processing__error-message">
            {status.error.message}
            {status.error.details ? ` — ${status.error.details}` : ''}
          </p>
        </div>
      )}

      {/* Completion action */}
      {isComplete && (
        <button
          className="processing__complete-btn"
          type="button"
          onClick={() => onComplete(dramaId)}
        >
          ▶ View Drama
        </button>
      )}
    </section>
  );
}
