/**
 * Bug Condition Exploration Test
 *
 * These tests encode the EXPECTED (fixed) behavior:
 * - DramaDetailView should NOT render a delete button
 * - frontend/src/api.ts should NOT export a deleteDrama function
 *
 * On UNFIXED code, these tests MUST FAIL — failure confirms the bug exists.
 *
 * **Validates: Requirements 1.1, 1.2, 2.1, 2.2, 2.3**
 */
import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import React from 'react';
import { render } from '@testing-library/react';
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

/** Arbitrary for generating valid Drama data */
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

describe('Bug Condition Exploration: Delete UI and API Endpoint Accessible Without Authorization', () => {
  /**
   * Property 1a: DramaDetailView should NOT render a delete button.
   *
   * On UNFIXED code this WILL FAIL because the component renders a delete
   * button when an onDelete prop is provided.
   *
   * **Validates: Requirements 1.1, 2.1**
   */
  it('DramaDetailView does NOT render a delete button for any drama data', async () => {
    await fc.assert(
      fc.asyncProperty(dramaArb, async (drama: Drama) => {
        // Make fetchDrama resolve with the generated drama
        mockedFetchDrama.mockResolvedValue(drama);

        const onBack = vi.fn();

        const { container } = render(
          React.createElement(DramaDetailView, {
            dramaId: drama.id,
            onBack,
          }),
        );

        // Wait for the component to finish loading
        await vi.waitFor(() => {
          expect(container.querySelector('.detail__title')).not.toBeNull();
        });

        // Assert: no element with aria-label="Delete drama" should exist
        const deleteButton = container.querySelector('[aria-label="Delete drama"]');
        expect(deleteButton).toBeNull();
      }),
      { numRuns: 10 },
    );
  });

  /**
   * Property 1b: frontend/src/api.ts should NOT export a deleteDrama function.
   *
   * On UNFIXED code this WILL FAIL because deleteDrama is exported.
   *
   * **Validates: Requirements 1.2, 2.2**
   */
  it('api.ts does NOT export a deleteDrama function', async () => {
    // Import the REAL api module (bypassing the mock)
    const apiModule = await vi.importActual('../api') as Record<string, unknown>;
    expect(apiModule).not.toHaveProperty('deleteDrama');
  });
});
