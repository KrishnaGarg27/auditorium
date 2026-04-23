import { useState, useRef } from 'react';
import type { DramaStyle } from '../types';
import { DRAMA_STYLES } from '../types';
import { createDramaByFile, createDramaByPrompt } from '../api';
import './CreateDramaModal.css';

const ACCEPTED_EXTENSIONS = '.txt,.md,.pdf,.epub';

interface CreateDramaModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (dramaId: string, jobId: string) => void;
}

type InputMode = 'file' | 'prompt';

export default function CreateDramaModal({ open, onClose, onCreated }: CreateDramaModalProps) {
  const [mode, setMode] = useState<InputMode>('file');
  const [file, setFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState<DramaStyle>('cinematic');
  const [creativeMode, setCreativeMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const canSubmit =
    !submitting && (mode === 'file' ? file !== null : prompt.trim().length > 0);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      let result: { dramaId: string; jobId: string };
      if (mode === 'file' && file) {
        result = await createDramaByFile({ file, style, creativeMode });
      } else {
        result = await createDramaByPrompt({ prompt: prompt.trim(), style, creativeMode });
      }
      onCreated?.(result.dramaId, result.jobId);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setFile(null);
    setPrompt('');
    setStyle('cinematic');
    setCreativeMode(false);
    setError(null);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={handleClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Create new drama"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__header">
          <h2 className="modal__title">Create New Drama</h2>
          <button className="modal__close" onClick={handleClose} type="button" aria-label="Close">
            ✕
          </button>
        </header>

        <div className="modal__body">
          {/* Input mode tabs */}
          <div className="modal__tabs" role="tablist">
            <button
              role="tab"
              aria-selected={mode === 'file'}
              className={`modal__tab ${mode === 'file' ? 'modal__tab--active' : ''}`}
              onClick={() => setMode('file')}
              type="button"
            >
              Upload File
            </button>
            <button
              role="tab"
              aria-selected={mode === 'prompt'}
              className={`modal__tab ${mode === 'prompt' ? 'modal__tab--active' : ''}`}
              onClick={() => setMode('prompt')}
              type="button"
            >
              Generate from Prompt
            </button>
          </div>

          {/* File upload */}
          {mode === 'file' && (
            <div className="modal__field">
              <label htmlFor="file-upload" className="modal__label">
                Story file (.txt, .md, .pdf, .epub)
              </label>
              <input
                id="file-upload"
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                className="modal__file-input"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file && <span className="modal__file-name">{file.name}</span>}
            </div>
          )}

          {/* Prompt input */}
          {mode === 'prompt' && (
            <div className="modal__field">
              <label htmlFor="prompt-input" className="modal__label">
                Describe your story
              </label>
              <textarea
                id="prompt-input"
                className="modal__textarea"
                rows={4}
                placeholder="A detective in 1940s Los Angeles investigates a series of mysterious disappearances…"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>
          )}

          {/* Style selector */}
          <div className="modal__field">
            <label htmlFor="style-select" className="modal__label">
              Drama Style
            </label>
            <select
              id="style-select"
              className="modal__select"
              value={style}
              onChange={(e) => setStyle(e.target.value as DramaStyle)}
            >
              {DRAMA_STYLES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Creative mode toggle */}
          <div className="modal__field modal__field--row">
            <label htmlFor="creative-toggle" className="modal__label">
              Creative Mode
            </label>
            <button
              id="creative-toggle"
              role="switch"
              type="button"
              aria-checked={creativeMode}
              className={`modal__toggle ${creativeMode ? 'modal__toggle--on' : ''}`}
              onClick={() => setCreativeMode((v) => !v)}
            >
              <span className="modal__toggle-knob" />
            </button>
          </div>

          {error && <p className="modal__error" role="alert">{error}</p>}
        </div>

        <footer className="modal__footer">
          <button className="modal__btn modal__btn--secondary" onClick={handleClose} type="button">
            Cancel
          </button>
          <button
            className="modal__btn modal__btn--primary"
            disabled={!canSubmit}
            onClick={handleSubmit}
            type="button"
          >
            {submitting ? 'Creating…' : 'Create Drama'}
          </button>
        </footer>
      </div>
    </div>
  );
}
