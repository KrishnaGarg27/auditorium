# Bugfix Requirements Document

## Introduction

Any frontend user can delete any audio drama via a delete button in the `DramaDetailView` component. The backend `DELETE /api/dramas/:id` endpoint has no authentication or authorization checks, allowing unrestricted deletion of dramas and their associated assets (Cloudinary files, thumbnails). This is a security and design issue — only an admin should be able to delete dramas, and only directly from the database. The entire delete flow must be removed from the frontend UI and the backend API.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user views a drama detail page THEN the system displays a "🗑 Delete" button that allows any user to delete the drama

1.2 WHEN a user clicks the delete button and confirms THEN the system calls `DELETE /api/dramas/:id` which permanently removes the drama record and all associated Cloudinary assets without any authentication or authorization check

1.3 WHEN any HTTP client sends a `DELETE` request to `/api/dramas/:id` THEN the system deletes the drama and its assets without verifying the caller's identity or permissions

### Expected Behavior (Correct)

2.1 WHEN a user views a drama detail page THEN the system SHALL NOT display any delete button or delete-related UI controls

2.2 WHEN a user attempts to delete a drama from the frontend THEN the system SHALL NOT provide any mechanism to do so — no `onDelete` prop, no `handleDelete` function, and no `deleteDrama` API client function

2.3 WHEN any HTTP client sends a `DELETE` request to `/api/dramas/:id` THEN the system SHALL respond with a 404 (route not found) or equivalent rejection because the endpoint no longer exists

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user views a drama detail page THEN the system SHALL CONTINUE TO display the drama title, synopsis, style badge, thumbnail, and episode list correctly

3.2 WHEN a user clicks the play button on an episode THEN the system SHALL CONTINUE TO play the episode audio as before

3.3 WHEN a user navigates back from the detail view to the library THEN the system SHALL CONTINUE TO return to the library view correctly

3.4 WHEN an admin deletes a drama directly from the database using `dramaRepository.deleteDrama()` and `fileStorage.deleteDramaFiles()` THEN the system SHALL CONTINUE TO delete the drama record and associated Cloudinary assets correctly

3.5 WHEN the system creates, reads, or updates dramas via the existing API endpoints (POST /api/dramas, GET /api/dramas, GET /api/dramas/:id) THEN the system SHALL CONTINUE TO function correctly

---

## Bug Condition

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type HTTPRequest
  OUTPUT: boolean

  // The bug is triggered whenever a delete operation is attempted
  // via the frontend UI or the backend API endpoint
  RETURN X.method = "DELETE" AND X.path MATCHES "/api/dramas/:id"
END FUNCTION
```

## Property Specification

```pascal
// Property: Fix Checking — DELETE endpoint removed
FOR ALL X WHERE isBugCondition(X) DO
  result ← handleRequest'(X)
  ASSERT result.status = 404 OR result.status = 405
  ASSERT drama_still_exists(X.params.id)
END FOR
```

## Preservation Goal

```pascal
// Property: Preservation Checking — All non-delete operations unchanged
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT handleRequest(X) = handleRequest'(X)
END FOR
```
