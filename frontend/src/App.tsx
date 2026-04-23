import { useState, useCallback } from 'react';
import type { DramaSummary } from './types';
import HomePage from './components/HomePage';
import LibraryView from './components/LibraryView';
import CreateDramaModal from './components/CreateDramaModal';
import DramaDetailView from './components/DramaDetailView';
import ProcessingView from './components/ProcessingView';
import PlayerBar from './components/PlayerBar';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { fetchDrama, fetchDramaStatus } from './api';

type View = 'home' | 'library' | 'detail' | 'processing';

interface ProcessingInfo {
  dramaId: string;
  jobId: string;
}

function App() {
  const [view, setView] = useState<View>('home');
  const [modalOpen, setModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedDramaId, setSelectedDramaId] = useState<string | null>(null);
  const [processing, setProcessing] = useState<ProcessingInfo | null>(null);
  const [playerState, playerActions] = useAudioPlayer();

  const handleCreated = useCallback((dramaId: string, jobId: string) => {
    setRefreshKey((k) => k + 1);
    setProcessing({ dramaId, jobId });
    setView('processing');
  }, []);

  const handleProcessingComplete = useCallback((dramaId: string) => {
    setProcessing(null);
    setSelectedDramaId(dramaId);
    setView('detail');
    setRefreshKey((k) => k + 1);
  }, []);

  const handleProcessingBack = useCallback(() => {
    setProcessing(null);
    setView('library');
    setRefreshKey((k) => k + 1);
  }, []);

  const handleSelectDrama = useCallback(async (drama: DramaSummary) => {
    if (drama.status === 'processing') {
      try {
        const statusRes = await fetchDramaStatus(drama.id, '');
        if (statusRes.jobId) {
          setProcessing({ dramaId: drama.id, jobId: statusRes.jobId });
          setView('processing');
          return;
        }
      } catch {
        // Fall through
      }
    }
    setSelectedDramaId(drama.id);
    setView('detail');
  }, []);

  const handlePlayEpisode = useCallback(
    async (dramaId: string, episodeId: string) => {
      try {
        const drama = await fetchDrama(dramaId);
        const episode = drama.episodes.find((ep) => ep.id === episodeId);
        if (!episode) return;
        playerActions.play(dramaId, drama.title, episode, drama.episodes);
      } catch {
        // silently ignore
      }
    },
    [playerActions],
  );

  const hasPlayer = playerState.currentEpisode !== null;

  // Home page — no header, full-screen
  if (view === 'home' && !processing) {
    return (
      <>
        <HomePage
          onGoToLibrary={() => setView('library')}
          onCreateNew={() => {
            setView('library');
            setModalOpen(true);
          }}
        />
        <CreateDramaModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onCreated={handleCreated}
        />
        <PlayerBar state={playerState} actions={playerActions} />
      </>
    );
  }

  // Inner pages — with header
  let content: React.ReactNode;
  if (view === 'processing' && processing) {
    content = (
      <ProcessingView
        dramaId={processing.dramaId}
        jobId={processing.jobId}
        onBack={handleProcessingBack}
        onComplete={handleProcessingComplete}
      />
    );
  } else if (view === 'detail' && selectedDramaId) {
    content = (
      <DramaDetailView
        dramaId={selectedDramaId}
        onBack={() => setView('library')}
        onPlayEpisode={handlePlayEpisode}
      />
    );
  } else {
    content = (
      <LibraryView
        onSelectDrama={handleSelectDrama}
        onCreateNew={() => setModalOpen(true)}
        refreshKey={refreshKey}
      />
    );
  }

  return (
    <div>
      <header className="app-header">
        <button
          className="app-header__logo"
          onClick={() => setView('home')}
          type="button"
          aria-label="Go to home"
        >
          <span className="app-header__icon" aria-hidden="true">🎭</span>
          <span className="app-header__text">Auditorium</span>
        </button>
      </header>

      <main style={hasPlayer ? { paddingBottom: 80 } : undefined}>
        {content}
      </main>

      <CreateDramaModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleCreated}
      />

      <PlayerBar state={playerState} actions={playerActions} />
    </div>
  );
}

export default App;
