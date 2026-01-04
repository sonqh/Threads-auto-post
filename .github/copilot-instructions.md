# Threads Auto-Post Codebase Guide

## Task Routing (developer guidance)

When working on user requests, consult the implemented feature sections in `BUSINESS_FEATURES.md` to find authoritative implementation details before making backend or frontend changes:

- **Backend tasks**: If the user's request references the backend workspace or the `dev:backend` script, consult the **"## 3. Backend Implementation"** section in `BUSINESS_FEATURES.md` for the expected responsibilities, flows, and files to touch.

- **Frontend tasks**: If the user's request references the frontend workspace or `apps/frontend`, consult the **"## 2. Frontend Implementation"** section in `BUSINESS_FEATURES.md` for the expected UI pages, hooks, components, and API interactions.

- **React hooks / docs**: If the user's request references the `react-use` documentation file, consult **"## React-use Hook Features"** section in `react-use.md` for the authoritative list of available hooks, categories, and naming conventions before making changes that touch hook behavior, documentation, or imports.

This ensures edits are consistent with the documented implementation and reduces accidental divergence between code and documentation.

## Architecture Overview

This is a **Turbo monorepo** with separate backend worker and API server processes:

- **apps/backend**: Express API + BullMQ worker (separate processes)
- **apps/frontend**: React + Vite + Shadcn UI
- **Infrastructure**: MongoDB (posts), Redis (job queue), Docker Compose

## Rate Limiting & Retries

Worker config ([worker.ts](../apps/backend/src/worker.ts)):

- Concurrency: 5 jobs parallel
- Rate limit: 10 requests/minute
- Retries: 3 attempts with exponential backoff (2s base)

Do not increase rate limits without checking Threads API quotas.

## Documentation Policy

- **Skip auto-generated documentation** unless explicitly requested in the chat
- Only create documents when the user specifically asks for documentation, guides, or summaries
- Focus on code implementation first

## Code Modification Policy

- **Ask before making major changes** to existing code
- Describe what changes will be made and wait for confirmation if:
  - Refactoring core business logic
  - Changing data flow or architecture
  - Modifying API contracts
  - Altering database schema
