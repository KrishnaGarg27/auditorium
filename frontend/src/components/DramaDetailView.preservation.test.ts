/**
 * Preservation Property Tests
 *
 * These tests capture baseline behavior that MUST be preserved after the fix.
 * They should PASS on the current unfixed code and continue to pass after the fix.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import DramaDetailView from './DramaDetailView';
import type { Drama, DramaStyle } from '../types';

// Mock the API module so fetchDrama resolves with generated drama data
vi.mock('../api', () => ({
  fetchDrama: vi.fn(),
}));

// Mock CSS import
vi.mock('./DramaDetailView.css', () => ({}));

// Mock styleColors
vi.mock('../styleColors', () => ({
  styleGradient: () => 'linear-gradient(#000, #111)',
  styleBadgeBg: () => '#333',
}));

import { fetchDrama } from '../api';
const mockedFetchDrama = vi.mocked(fetchDrama);

const VALID_STYLES: DramaStyle[] = [
  'anime', 'noir', 'dark-thriller', 'horror', 'cyberpunk',
  'fantasy-epic', 'romance', 'comedy', 'documentary', 'cinematic',
];

/** Arbitrary for generating valid Episode data */
const episodeArb = fc.record({
  id: fc.uuid(),
  dramaId: fc.uuid(),
  episodeNumber: fc.integer({ min: 1, max: 50 }),
  title: fc.string({ minLength: 1, maxLength: 100 }),
  synopsis: fc.string({ minLength: 1, maxLength: 300 }),
  durationMs: fc.integer({ min: 1000, max: 600000 }),
  audioFilePath: fc.string({ minLength: 1 }),
  scenes: fc.array(
    fc.record({ sceneId: fc.uuid(), title: fc.string({ minLength: 1 }) }),
    { minLength: 0, maxLength: 5 },
  ),
});

/** Arbitrary for generating valid Drama data with at least 1 episode */
const dramaArb = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 200 }),
  synopsis: fc.string({ minLength: 1, maxLength: 500 }),
  style: fc.constantFrom(...VALID_STYLES),
  creativeMode: fc.boolean(),
  source: fc.constantFrom('upload' as const, 'generated' as const),
  status: fc.constant('complete' as const),
  createdAt: fc.date().map((d) => d.toISOString()),
  episodes: fc.array(episodeArb, { minLength: 1, maxLength: 5 }),
});

describe('Preservation: Non-Delete UI Functionality Unchanged', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Property 2a: For all generated drama data, the component renders the title,
   * synopsis text, style badge, and one episode card per episode.
   *
   * **Validates: Requirements 3.1**
   */
  it('renders title, synopsis, style badge, and correct number of episode cards for any drama', async () => {
    await fc.assert(
      fc.asyncProperty(dramaArb, async (drama: Drama) => {
        mockedFetchDrama.mockResolvedValue(drama);

        const onBack = vi.fn();
        const { container } = render(
          React.createElement(DramaDetailView, { dramaId: drama.id, onBack }),
        );

        // Wait for the component to finish loading
        await vi.waitFor(() => {
          expect(container.querySelector('.detail__title')).not.toBeNull();
        });

        // Title is rendered
        const titleEl = container.querySelector('.detail__title');
        expect(titleEl?.textContent).toBe(drama.title);

        // Synopsis text is rendered
        const synopsisEl = container.querySelector('.detail__synopsis');
        expect(synopsisEl).not.toBeNull();

        // Style badge is rendered
        const badgeEl = container.querySelector('.detail__badge');
        expect(badgeEl).not.toBeNull();

        // One episode card per episode
        const episodeCards = container.querySelectorAll('.episode-card');
        expect(episodeCards.length).toBe(drama.episodes.length);
      }),
      { numRuns: 10 },
    );
  });

  /**
   * Property 2b: For all generated drama data, the back button is always present
   * and the onBack callback is wired.
   *
   * **Validates: Requirements 3.3**
   */
  it('back button is always present and onBack callback is wired for any drama', async () => {
    await fc.assert(
      fc.asyncProperty(dramaArb, async (drama: Drama) => {
        mockedFetchDrama.mockResolvedValue(drama);

        const onBack = vi.fn();
        const { container } = render(
          React.createElement(DramaDetailView, { dramaId: drama.id, onBack }),
        );

        // Back button should be present immediately (not behind loading)
        const backBtn = container.querySelector('[aria-label="Back to library"]');
        expect(backBtn).not.toBeNull();

        // Click the back button
        fireEvent.click(backBtn!);
        expect(onBack).toHaveBeenCalledTimes(1);
      }),
      { numRuns: 10 },
    );
  });

  /**
   * Property 2c: For all generated drama data with episodes, each episode card
   * has a play button.
   *
   * **Validates: Requirements 3.2**
   */
  it('each episode card has a play button for any drama with episodes', async () => {
    await fc.assert(
      fc.asyncProperty(dramaArb, async (drama: Drama) => {
        mockedFetchDrama.mockResolvedValue(drama);

        const onBack = vi.fn();
        const { container } = render(
          React.createElement(DramaDetailView, { dramaId: drama.id, onBack }),
        );

        // Wait for the component to finish loading
        await vi.waitFor(() => {
          expect(container.querySelector('.detail__title')).not.toBeNull();
        });

        // Each episode card should have a play button
        const playButtons = container.querySelectorAll('.episode-card__play-btn');
        expect(playButtons.length).toBe(drama.episodes.length);
      }),
      { numRuns: 10 },
    );
  });
});

describe('Preservation: Backend Admin Delete Utilities Remain Exported', () => {
  /**
   * Verify that dramaRepository.deleteDrama remains exported by checking source.
   *
   * **Validates: Requirements 3.4**
   */
  it('dramaRepository.deleteDrama is exported from backend module', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const repoSource = fs.readFileSync(
      path.resolve(process.cwd(), '../backend/src/db/dramaRepository.ts'),
      'utf-8',
    );
    expect(repoSource).toMatch(/export\s+(async\s+)?function\s+deleteDrama/);
  });

  /**
   * Verify that fileStorage.deleteDramaFiles remains exported by checking source.
   *
   * **Validates: Requirements 3.5**
   */
  it('fileStorage.deleteDramaFiles is exported from backend module', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const storageSource = fs.readFileSync(
      path.resolve(process.cwd(), '../backend/src/db/fileStorage.ts'),
      'utf-8',
    );
    expect(storageSource).toMatch(/export\s+(async\s+)?function\s+deleteDramaFiles/);
  });
});
