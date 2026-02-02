# Version Conflict Fix (Optimistic Concurrency)

**Date:** 2026-02-02  
**Issue:** Jobs failing with "No matching document found for id ... version X" error

---

## Problem

Posts were failing with "An unknown error occurred" which was actually a **Mongoose VersionError** (optimistic concurrency conflict).

### What is Optimistic Concurrency?

Mongoose uses version numbers (`__v`) to detect when a document has been modified by another process:
1. Process A reads Post (version 14)
2. Process B modifies and saves Post (version becomes 15)
3. Process A tries to save Post with version 14
4. Mongoose throws VersionError: "No matching document found... version 14"

### Why Was This Happening?

Multiple processes were modifying the same post simultaneously:
- **Worker**: Trying to publish the post
- **Scheduler**: Updating `publishingProgress` or `scheduleConfig`
- **API Server**: Responding to user actions

When the worker retried a failed job, it would:
1. Use stale post data from a previous attempt
2. Try to save with an outdated version number
3. Fail with VersionError
4. Get misclassified as "Unknown error"
5. Incorrectly marked as FAILED or RETRYABLE

---

## Solution

### Fix #1: Detect VersionError
Added specific detection for Mongoose version conflicts in `classifyError()`:

```typescript
// Detect VersionError patterns
if (
  error.name === "VersionError" ||
  (error.message && error.message.includes("No matching document found for id")) ||
  (error.message && error.message.includes("version"))
) {
  return {
    category: ErrorCategory.TRANSIENT,
    shouldRollback: false,
    message: "Document was modified by another process",
    suggestedAction: "This is normal and will be retried automatically with refreshed data.",
  };
}
```

### Fix #2: Handle TRANSIENT Errors Correctly
Added special handling for TRANSIENT errors that skips database updates:

```typescript
// For transient errors, don't modify post status
// Just let BullMQ retry - the post will be refetched on next attempt
if (classification.category === ErrorCategory.TRANSIENT) {
  log.warn(`⏳ Transient error for post ${postId}, will retry`);
  throw error; // Let BullMQ handle retry
}
```

**Key difference:**
- **Before**: TRANSIENT errors → Try to save error → Trigger another VersionError → Infinite loop
- **After**: TRANSIENT errors → Skip save → Let BullMQ retry → Fresh refetch on next attempt

---

## How It Works Now

1. Job attempts to publish post
2. VersionError occurs (post was modified elsewhere)
3. Error is classified as `TRANSIENT`
4. Worker logs warning but doesn't modify post
5. BullMQ retries the job (attempt 2, 3...)
6. Worker **refetches** post (fresh version number)
7. Publish succeeds with fresh data

---

## Impact

### Before
- VersionErrors → "Unknown error occurred"
- Post incorrectly marked as FAILED
- Required manual intervention to republish
- Confusing logs and error messages

### After  
- VersionErrors → Automatic retry with fresh data
- Post status unchanged (stays SCHEDULED)
- Self-healing through retries
- Clear logging: "Document was modified by another process"

---

## Testing

Look for these log patterns:

**Good** (expected for concurrent operations):
```
⏳ Transient error for post XXX, will retry
  message: "Document was modified by another process"
  attempt: 1
  maxAttempts: 3
```

**Bad** (shouldn't see these anymore):
```
❌ Failed: An unknown error occurred
Error: No matching document found for id...
```

---

## Technical Notes

- BullMQ automatically refetches the post on each retry attempt
- The version conflict is a race condition that's safe to retry
- This is different from RETRYABLE errors (user needs to fix) and FATAL errors (can't fix)
- TRANSIENT = temporary issue that will resolve itself on retry

---

## Related Files Modified

- `apps/backend/src/worker.ts`
  - Added VersionError detection to `classifyError()`
  - Added TRANSIENT error early-exit logic
