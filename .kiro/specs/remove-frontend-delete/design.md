# Remove Frontend Delete Bugfix Design

## Overview

The application exposes an unauthenticated delete flow: a "🗑 Delete" button in `DramaDetailView` calls `DELETE /api/dramas/:id`, which permanently removes drama records and Cloudinary assets without any authorization. The fix removes the entire delete surface from the frontend UI and backend API while preserving the database-level utility functions (`dramaRepository.deleteDrama`, `fileStorage.deleteDramaFiles`) for admin use.

## Glossary

- **Bug_Condition (C)**: Any attempt to delete a drama through the frontend UI or the `DELETE /api/dramas/:id` API endpoint
- **Property (P)**: Delete operations via UI/API should be impossible — no button rendered, no client function available, no route registered
- **Preservation**: All non-delete functionality (viewing dramas, playing episodes, navigating, creating dramas, database-level admin delete) must remain unchanged
- **`DramaDetailView`**: React component in `frontend/src/components/DramaDetailView.tsx` that renders drama details and currently includes a delete button
- **`handleDeleteDrama`**: Callback in `frontend/src/App.tsx` that calls the `deleteDrama` API function and navigates back to library
- **`deleteDrama` (API client)**: Function in `frontend/src/api.ts` that sends `DELETE` to `/api/dramas/:id`
- **`deleteDrama` (repository)**: Function in `backend/src/db/dramaRepository.ts` that deletes a drama row from Supabase — kept for admin use
- **`deleteDramaFiles`**: Function in `backend/src/db/fileStorage.ts` that removes Cloudinary assets — kept for admin use

## Bug Details

### Bug Condition

The bug manifests when any user (authenticated or not) can permanently delete dramas and their associated cloud assets through the frontend UI or by sending a DELETE request to the API. There are no authorization checks, making this a security vulnerability.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type UserAction
  OUTPUT: boolean

  RETURN (input.type = "UI_CLICK" AND input.target = "delete-button" AND input.context = "DramaDetailView")
         OR (input.type = "HTTP_REQUEST" AND input.method = "DELETE" AND input.path MATCHES "/api/dramas/:id")
END FUNCTION
```

### Examples

- User views drama detail page → sees "🗑 Delete" button → clicks it → confirms → drama and all Cloudinary assets permanently deleted. Expected: no delete button visible.
- HTTP client sends `DELETE /api/dramas/abc-123` → receives 204, drama gone. Expected: 404 (route not found).
- User opens browser dev tools, calls `fetch('/api/dramas/abc-123', { method: 'DELETE' })` → succeeds. Expected: 404.
- Automated script iterates all drama IDs and deletes them all without authentication. Expected: 404 for each request.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Drama detail page displays title, synopsis, style badge, thumbnail, and episode list correctly
- Episode play buttons trigger audio playback as before
- "← Back to Library" navigation continues to work
- `dramaRepository.deleteDrama()` in `backend/src/db/dramaRepository.ts` remains functional for admin/script use
- `deleteDramaFiles()` in `backend/src/db/fileStorage.ts` remains functional for admin/script use
- Both functions remain exported from `backend/src/db/index.ts`
- `POST /api/dramas`, `GET /api/dramas`, `GET /api/dramas/:id` endpoints continue to work
- Drama creation flow (file upload and prompt-based) is unaffected

**Scope:**
All inputs that do NOT involve the delete button UI or the `DELETE /api/dramas/:id` endpoint should be completely unaffected by this fix. This includes:
- All GET and POST API requests
- All UI interactions except the delete button (play, navigate, create)
- Direct database operations via repository functions
- Cloudinary upload operations

## Hypothesized Root Cause

This is a design issue rather than a traditional code bug. The root cause is that delete functionality was implemented without any access control:

1. **No Authorization Layer**: The `DELETE /:id` route in `dramaRoutes.ts` (lines 133-145) has no middleware or checks for user identity/role. Any HTTP client can call it.

2. **Unrestricted UI Exposure**: `DramaDetailView.tsx` renders the delete button for all users unconditionally (when `onDelete` prop is provided, which `App.tsx` always passes).

3. **Full Wiring Without Guards**: `App.tsx` imports `deleteDrama` from `api.ts`, creates `handleDeleteDrama`, and passes it as `onDelete` to `DramaDetailView` — a complete unguarded delete pipeline from UI to database.

The fix is to remove the entire pipeline rather than add authorization, since the product decision is that delete should only be available at the database level for admins.

## Correctness Properties

Property 1: Bug Condition - Delete UI and API Removed

_For any_ user action where the bug condition holds (attempting to delete via UI or API), the fixed system SHALL prevent the deletion: the delete button SHALL NOT be rendered in `DramaDetailView`, the `deleteDrama` function SHALL NOT exist in `frontend/src/api.ts`, and the `DELETE /api/dramas/:id` route SHALL NOT be registered, returning 404 for any DELETE request.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Non-Delete Functionality Unchanged

_For any_ input where the bug condition does NOT hold (viewing dramas, playing episodes, navigating, creating dramas, using database utilities), the fixed system SHALL produce the same result as the original system, preserving all existing read/create/update functionality, episode playback, navigation, and database-level admin delete capabilities.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

**File**: `frontend/src/components/DramaDetailView.tsx`

**Specific Changes**:
1. **Remove `onDelete` prop**: Remove `onDelete?: (dramaId: string) => void` from `DramaDetailViewProps` interface
2. **Remove `deleting` state**: Remove `const [deleting, setDeleting] = useState(false)`
3. **Remove `handleDelete` function**: Remove the entire `async function handleDelete()` block
4. **Remove delete button JSX**: Remove the `{onDelete && (...)}` conditional block rendering the delete button
5. **Update destructuring**: Remove `onDelete` from the props destructuring in the function signature

**File**: `frontend/src/components/DramaDetailView.css`

**Specific Changes**:
6. **Remove delete button styles**: Remove `.detail__delete-btn`, `.detail__delete-btn:hover`, `.detail__delete-btn:disabled`, and `.detail__delete-btn:focus-visible` CSS rules

**File**: `frontend/src/api.ts`

**Specific Changes**:
7. **Remove `deleteDrama` function**: Remove the entire `export async function deleteDrama(id: string)` function

**File**: `frontend/src/App.tsx`

**Specific Changes**:
8. **Remove `deleteDrama` import**: Remove `deleteDrama` from the `import { fetchDrama, fetchDramaStatus, deleteDrama } from './api'` statement
9. **Remove `handleDeleteDrama` callback**: Remove the entire `const handleDeleteDrama = useCallback(...)` block
10. **Remove `onDelete` prop passing**: Remove `onDelete={handleDeleteDrama}` from the `<DramaDetailView>` JSX

**File**: `backend/src/api/dramaRoutes.ts`

**Specific Changes**:
11. **Remove DELETE route**: Remove the entire `router.delete('/:id', ...)` handler block (lines 133-145)
12. **Remove unused imports**: Remove `deleteDrama` from the `dramaRepository` import and `deleteDramaFiles` from the `fileStorage` import (these are only used by the DELETE route in this file)

**Files NOT modified** (preservation):
- `backend/src/db/dramaRepository.ts` — `deleteDrama()` stays for admin use
- `backend/src/db/fileStorage.ts` — `deleteDramaFiles()` stays for admin use
- `backend/src/db/index.ts` — continues to re-export both functions

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm that the delete flow is fully functional and unprotected on unfixed code.

**Test Plan**: Write tests that verify the delete button renders, the API client function exists, and the DELETE endpoint accepts requests. Run these on UNFIXED code to confirm the vulnerability.

**Test Cases**:
1. **Delete Button Renders**: Render `DramaDetailView` with `onDelete` prop → confirm delete button is in the DOM (will pass on unfixed code, confirming the bug)
2. **API Client Exports deleteDrama**: Import `deleteDrama` from `api.ts` → confirm it's a function (will pass on unfixed code)
3. **DELETE Endpoint Accepts Requests**: Send `DELETE /api/dramas/:id` → confirm it returns 204 (will succeed on unfixed code)
4. **No Auth Check**: Send DELETE without any auth headers → confirm it still succeeds (will pass on unfixed code)

**Expected Counterexamples**:
- Delete button is rendered and clickable without any authorization
- DELETE endpoint returns 204 and destroys data without authentication

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed system prevents deletion.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  IF input.type = "UI_RENDER" THEN
    rendered := render(DramaDetailView, {dramaId, onBack})
    ASSERT NOT exists(rendered, "[aria-label='Delete drama']")
  END IF
  IF input.type = "HTTP_REQUEST" THEN
    result := sendRequest(DELETE, "/api/dramas/" + input.dramaId)
    ASSERT result.status = 404
  END IF
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed system produces the same result as the original.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT handleRequest(input) = handleRequest'(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for all non-delete operations, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Detail View Rendering Preservation**: Verify drama title, synopsis, style badge, thumbnail, and episode list render correctly after fix
2. **Episode Playback Preservation**: Verify `onPlayEpisode` callback still fires when play button is clicked
3. **Navigation Preservation**: Verify `onBack` callback fires when back button is clicked
4. **GET Endpoints Preservation**: Verify `GET /api/dramas` and `GET /api/dramas/:id` return same responses
5. **POST Endpoint Preservation**: Verify `POST /api/dramas` still creates dramas
6. **Database Utility Preservation**: Verify `dramaRepository.deleteDrama()` and `fileStorage.deleteDramaFiles()` still function when called directly

### Unit Tests

- Test that `DramaDetailView` renders without a delete button (no `onDelete` prop accepted)
- Test that `DramaDetailView` still renders title, synopsis, badge, episodes correctly
- Test that `App.tsx` does not pass `onDelete` to `DramaDetailView`
- Test that `api.ts` does not export `deleteDrama`
- Test that `DELETE /api/dramas/:id` returns 404

### Property-Based Tests

- Generate random drama data and verify `DramaDetailView` never renders a delete button
- Generate random HTTP methods and paths and verify DELETE on `/api/dramas/:id` always returns 404 while other methods work correctly
- Generate random drama states and verify detail view always displays all expected fields without delete controls

### Integration Tests

- Test full flow: create drama → view detail → confirm no delete button → play episode → navigate back
- Test that sending DELETE requests to the API returns 404 and drama data is untouched
- Test that database-level `deleteDrama()` still works when called directly (admin scenario)
