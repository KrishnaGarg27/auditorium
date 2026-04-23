# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Delete UI and API Endpoint Accessible Without Authorization
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the delete surface is exposed
  - **Scoped PBT Approach**: Scope the property to the concrete bug condition: the `DramaDetailView` component accepts an `onDelete` prop and renders a delete button, the `deleteDrama` function exists in `frontend/src/api.ts`, and the `DELETE /api/dramas/:id` route is registered in `backend/src/api/dramaRoutes.ts`
  - Create test file `frontend/src/components/DramaDetailView.property.test.ts` using vitest and fast-check
  - **Bug Condition from design**: `isBugCondition(input)` returns true when `input.type = "UI_CLICK" AND input.target = "delete-button"` OR `input.type = "HTTP_REQUEST" AND input.method = "DELETE" AND input.path MATCHES "/api/dramas/:id"`
  - **Expected Behavior from design**: Delete button SHALL NOT be rendered in `DramaDetailView`, `deleteDrama` SHALL NOT exist in `frontend/src/api.ts`, DELETE route SHALL NOT be registered
  - Test 1: Generate random drama data with fast-check (random title, id, style, episodes). Render `DramaDetailView` props interface and assert that `onDelete` is NOT in the interface / the component does NOT render any element with `aria-label="Delete drama"`. On unfixed code this will FAIL because the delete button renders.
  - Test 2: Assert that `frontend/src/api.ts` does NOT export a `deleteDrama` function. On unfixed code this will FAIL because the export exists.
  - Run tests on UNFIXED code — expect FAILURE (this confirms the bug exists)
  - Document counterexamples found (e.g., "DramaDetailView renders a delete button for any drama", "api.ts exports deleteDrama")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Delete UI and API Functionality Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Create test file `frontend/src/components/DramaDetailView.preservation.test.ts` using vitest and fast-check
  - **Preservation Requirements from design**: Drama detail page displays title, synopsis, style badge, episode list correctly; episode play buttons trigger callbacks; back navigation works; `dramaRepository.deleteDrama()` and `fileStorage.deleteDramaFiles()` remain exported; GET/POST endpoints unaffected
  - Observe on UNFIXED code: `DramaDetailView` renders drama title, synopsis, style badge, episode list, back button, and play buttons for any valid drama data
  - Observe on UNFIXED code: `onBack` callback fires when back button is clicked; `onPlayEpisode` callback fires when play button is clicked
  - Write property-based tests with fast-check:
    - For all generated drama data (random titles, styles from valid set, random episode lists), the component renders the title, synopsis text, style badge, and one episode card per episode
    - For all generated drama data, the back button is always present and the `onBack` callback is wired
    - For all generated drama data with episodes, each episode card has a play button
    - Verify `dramaRepository.deleteDrama` and `fileStorage.deleteDramaFiles` remain exported from `backend/src/db/dramaRepository.ts` and `backend/src/db/fileStorage.ts`
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix: Remove frontend delete flow and backend DELETE endpoint

  - [x] 3.1 Remove delete functionality from `DramaDetailView.tsx`
    - Remove `onDelete?: (dramaId: string) => void` from `DramaDetailViewProps` interface
    - Remove `onDelete` from the props destructuring in the component function signature
    - Remove `const [deleting, setDeleting] = useState(false)` state
    - Remove the entire `async function handleDelete()` block
    - Remove the `{onDelete && (...)}` conditional block that renders the delete button JSX
    - _Bug_Condition: isBugCondition(input) where input.type = "UI_CLICK" AND input.target = "delete-button" AND input.context = "DramaDetailView"_
    - _Expected_Behavior: DramaDetailView SHALL NOT render any delete button or accept an onDelete prop_
    - _Preservation: Drama title, synopsis, style badge, thumbnail, episode list, play buttons, and back navigation remain unchanged_
    - _Requirements: 1.1, 2.1, 2.2, 3.1, 3.2, 3.3_

  - [x] 3.2 Remove delete button styles from `DramaDetailView.css`
    - Remove `.detail__delete-btn` base rule
    - Remove `.detail__delete-btn:hover` rule
    - Remove `.detail__delete-btn:disabled` rule
    - Remove `.detail__delete-btn:focus-visible` rule
    - _Preservation: All other CSS rules for detail view, episode cards, hero section, back button remain unchanged_
    - _Requirements: 2.1_

  - [x] 3.3 Remove `deleteDrama` function from `frontend/src/api.ts`
    - Remove the entire `export async function deleteDrama(id: string): Promise<void>` function
    - All other API functions (`fetchDramas`, `createDramaByFile`, `createDramaByPrompt`, `fetchDrama`, `fetchDramaStatus`, `fetchStyles`, `getAudioUrl`) remain unchanged
    - _Bug_Condition: isBugCondition(input) where input.type = "HTTP_REQUEST" AND input.method = "DELETE"_
    - _Expected_Behavior: deleteDrama SHALL NOT exist as an export in frontend/src/api.ts_
    - _Preservation: All other API client functions remain exported and functional_
    - _Requirements: 1.2, 2.2, 3.5_

  - [x] 3.4 Remove delete wiring from `frontend/src/App.tsx`
    - Remove `deleteDrama` from the import statement: `import { fetchDrama, fetchDramaStatus, deleteDrama } from './api'` → `import { fetchDrama, fetchDramaStatus } from './api'`
    - Remove the entire `const handleDeleteDrama = useCallback(...)` block
    - Remove `onDelete={handleDeleteDrama}` prop from the `<DramaDetailView>` JSX
    - _Bug_Condition: App.tsx wires deleteDrama through handleDeleteDrama to DramaDetailView.onDelete_
    - _Expected_Behavior: App.tsx SHALL NOT import deleteDrama, define handleDeleteDrama, or pass onDelete to DramaDetailView_
    - _Preservation: All other App.tsx functionality (navigation, creation, processing, playback) remains unchanged_
    - _Requirements: 1.2, 2.2, 3.3, 3.5_

  - [x] 3.5 Remove DELETE route from `backend/src/api/dramaRoutes.ts`
    - Remove the entire `router.delete('/:id', ...)` handler block
    - Remove `deleteDrama` from the `dramaRepository` import: `import { getAllDramas, getDrama, getDramaAsync, createDrama, updateDrama, deleteDrama, refreshDramaCache } from '../db/dramaRepository.js'` → remove `deleteDrama`
    - Remove `import { deleteDramaFiles } from '../db/fileStorage.js'` (only used by the DELETE route)
    - POST, GET list, and GET detail routes remain unchanged
    - _Bug_Condition: isBugCondition(input) where input.method = "DELETE" AND input.path MATCHES "/api/dramas/:id"_
    - _Expected_Behavior: DELETE /api/dramas/:id SHALL return 404 (route not found)_
    - _Preservation: POST /api/dramas, GET /api/dramas, GET /api/dramas/:id continue to function correctly_
    - _Requirements: 1.3, 2.3, 3.5_

  - [x] 3.6 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Delete UI and API Endpoint Removed
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior (no delete button, no deleteDrama export, no DELETE route)
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.7 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Delete UI and API Functionality Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite: `npm run test` in both `frontend/` and `backend/`
  - Ensure all property-based tests pass (bug condition and preservation)
  - Ensure all existing tests still pass (no regressions)
  - Verify that `dramaRepository.deleteDrama` and `fileStorage.deleteDramaFiles` are still exported from their respective modules (admin use preserved)
  - Ask the user if questions arise
