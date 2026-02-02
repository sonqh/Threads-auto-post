# Refactoring Plan: Taming the Chaos

The codebase has grown rapidly with new features (Multi-account, Event-driven scheduler, Monitoring). This plan addresses the complexity and reorganizes the code for maintainability.

## 1. Backend Refactoring

### **A. Worker Decomposition (`apps/backend/src/worker.ts`)**
The worker file is currently ~1000 lines mixed with logic for publishing, error handling, database updates, and scheduling.
- **Goal:** Split `worker.ts` into specialized services.
- **Action Items:**
  1. **Create `PublishingJobProcessor.ts`**: Move the main job processing logic here.
  2. **Create `ErrorClassificationService.ts`**: Move all error classification logic (currently in worker) to a dedicated service.
  3. **Create `PostRecoveryService.ts`**: Move stalled job recovery and rollback logic here.
  4. **Create `NotificationService.ts`**: (Future) For alerting on failures.

### **B. Post Service & Model Cleanup**
- **Goal:** Clear separation between business logic and data access.
- **Action Items:**
  1. Move complex status transition logic from `worker.ts` to `Post.ts` methods or `PostService.ts`.
  2. Standardize `publishingProgress` updates. Currently, it's updated ad-hoc in multiple places. Create a helper `updatePostProgress(post, step, status)`.

### **C. Unified Scheduler Logic**
- **Goal:** Avoid confusion between `SchedulerService` (polling) and `EventDrivenScheduler`.
- **Action Items:**
  1. Deprecate `SchedulerService` (Polling) once Event-Driven is stable.
  2. Move all scheduling logic (next run time calculation) to `SchedulingDomain.ts` so it's shared and testable.

---

## 2. Frontend Refactoring

### **A. Component Decomposition**
- **Goal:** Smaller, reusable components.
- **Action Items:**
  1. Extract `PostStatusBadge` from `PostRow.tsx` (already started, but make it a standalone component).
  2. Extract `PostProgressIndicator` from `PostRow.tsx`.
  3. Move API calls from components to custom hooks (e.g., `usePostScheduler`, `usePostPublisher`).

### **B. Constants and Types**
- **Goal:** Centralize definitions.
- **Action Items:**
  1. Move all interface definitions (`Post`, `ScheduleConfig`) to a shared package or dedicated `types` folder if adhering to monorepo structure.

---

## 3. Immediate Action Plan (Next Steps)

1. **Extract Error Classification**: The `classifyError` function in `worker.ts` is a low-hanging fruit. Move it to `src/services/ErrorService.ts`.
2. **Standardize Logging**: Ensure all logs use the `logger` instance and have consistent metadata (postId, accountId).
3. **Clean up Dead Code**: Remove commented-out code blocks in `worker.ts` (idempotency, duplicate checks that were disabled).

---

## 4. Status Check

- **Chaos Level**: High in `worker.ts`, Moderate in `PostRow.tsx`.
- **Risk**: High (Worker handles critical publishing logic).
- **Strategy**: Incremental refactoring. Do not rewrite everything at once. Start with extracting pure functions.
