# Event-Driven Scheduler Improvements

**Date:** 2026-02-02  
**Issues Fixed:**
1. Lock error when removing active scheduler jobs
2. Scheduler not self-healing after failures

---

## Problem 1: "Job locked by another worker" Error

### Root Cause
When the scheduler tried to schedule the "next check", it would:
1. Try to remove the existing scheduler job
2. Create a new scheduler job with updated timing

**BUT**, if the existing job was currently executing (locked by the worker), step #1 would fail with:
```
Job scheduler-check-XXX could not be removed because it is locked by another worker
```

### The Fix (Bug Fix #8)
**File:** `apps/backend/src/services/EventDrivenScheduler.ts`

**Before:**
```typescript
const existingJob = await schedulerQueue.getJob(existingJobId);
if (existingJob) {
  await existingJob.remove(); // ❌ Fails if job is active/locked
}
```

**After:**
```typescript
const existingJob = await schedulerQueue.getJob(existingJobId);
if (existingJob) {
  const state = await existingJob.getState();
  
  // Skip removal if job is currently executing
  if (state === "active" || state === "waiting-children") {
    log.debug(`Skipping removal of active job, will replace on completion`);
  } else {
    try {
      await existingJob.remove();
      log.info(`Removed previous scheduler job`);
    } catch (removeError) {
      // If removal fails, it's ok - job will auto-remove
      log.debug(`Could not remove job: ${removeError.message}`);
    }
  }
}
```

**Key Changes:**
- ✅ Check job state before attempting removal
- ✅ Skip removal if job is active (locked)
- ✅ Wrap removal in try-catch
- ✅ Let active jobs complete naturally (they auto-remove via `removeOnComplete`)

---

## Problem 2: Scheduler Not Self-Healing

### Root Cause
When `scheduleNextCheck()` encountered an error (like the lock error above), it would:
1. Log the error
2. **Do nothing else**

This meant:
- No retry logic
- No fallback mechanism
- Scheduler effectively "dies" until server restart

### The Fix (Bug Fix #9)
**File:** `apps/backend/src/services/EventDrivenScheduler.ts`

**Added retry logic with exponential backoff:**

```typescript
async scheduleNextCheck(): Promise<void> {
  const maxRetries = 3;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      // ... scheduling logic ...
      return; // Success, exit loop
    } catch (error) {
      attempt++;
      
      if (attempt >= maxRetries) {
        log.error("❌ Scheduler failed to self-heal after retries");
        await clearSchedulerState(); // Allow fresh start
      } else {
        const backoffMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
        log.info(`⏳ Retrying in ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }
}
```

**Key Changes:**
- ✅ Retry up to 3 times on failure
- ✅ Exponential backoff (1s, 2s, 4s)
- ✅ Clear state after max retries (allows fresh start)
- ✅ Detailed logging for debugging

---

## Impact

### Before
- **Lock errors:** Scheduler would crash and stay dead
- **No recovery:** Required manual server restart
- **User experience:** Posts wouldn't publish until restart

### After
- **Lock errors:** Gracefully handled, skips locked jobs
- **Auto-recovery:** Retries 3 times with backoff
- **User experience:** Scheduler stays alive through transient errors

---

## Testing Recommendations

1. **Monitor logs** for these patterns:
   ```
   [DEBUG] Skipping removal of active job
   [INFO] ⏳ Retrying in 1000ms...
   [INFO] ⏳ Retrying in 2000ms...
   ```

2. **Verify no more lock errors**:
   ```bash
   # Should NOT see this anymore:
   "Job ... could not be removed because it is locked by another worker"
   ```

3. **Check scheduler stays alive**:
   - Schedule multiple posts
   - Watch logs - should see "Next check scheduled in Xs"
   - If errors occur, should see retry attempts
   - Scheduler should recover automatically

---

## Additional Notes

- These fixes work together: #8 prevents the lock error, #9 ensures recovery if other errors occur
- The scheduler is now more resilient to race conditions and transient failures
- Manual intervention should rarely be needed (only if MongoDB/Redis is down)
