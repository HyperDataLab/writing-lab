# Writing Lab architecture

This is a standalone writing tool. Keep frontend modules independent from PaperLab runtime and deployment assumptions.

## Structure and dependency direction

```text
src/app/                 Next.js routing, layout, providers
src/modules/<feature>/   Writing features, each with a public index.ts
src/shared/              Firebase, Worker API, reusable UI and infrastructure
src/core/                Pure domain types and logic
worker/src/              Cloudflare Worker API
```

Dependency direction is `app -> modules -> shared -> core`. `core` must not import React, Firebase, `fetch`, browser globals, or current time/randomness; pass generated IDs and timestamps in as values. Feature modules should access Firestore through repositories under `src/shared/storage`, not call Firebase APIs directly from components.

## Storage and API

- Cloud Firestore is the source of truth for structured writing records. Keep the user/project document path and schema version behind `shared/storage` repositories.
- `firestore.rules` denies direct client access; the Worker uses its service account only after validating ResearchHub identity and project access.
- Use Cloudflare R2 for future binary attachments or large exports; do not put those blobs in Firestore documents.
- The browser calls backend routes through the Cloudflare Worker. Keep credentials in Wrangler secrets; never expose private values via `NEXT_PUBLIC_*`.
- Keep the Worker API contract independent from Next.js routes so the frontend and Worker deploy separately.

Use strict TypeScript and English identifiers. User-facing UI text is Vietnamese. Read commands from `package.json` and the relevant Worker package before running them.
