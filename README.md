# Writing Lab

Standalone paragraph-writing workspace built with Next.js, Cloud Firestore and a Cloudflare Worker API. Writing records are scoped to the ResearchHub user and project in Firestore. Cloudflare R2 is reserved for future binary attachments or large exports; current writing features do not upload files.

## Requirements

- Node.js 20.9 or newer
- A Cloud Firestore database and a service account with Firestore read/write permission
- Wrangler authentication for deploying the Worker

## Setup

1. Install dependencies: `npm install`.
2. Copy `.env.example` to `.env.local`; register `http://localhost:3000/auth/callback` as an OIDC public-client callback and set the resulting client ID.
3. Configure `worker/.dev.vars` from `worker/.dev.vars.example`. Put the Firebase service-account JSON in `FIREBASE_SERVICE_ACCOUNT_JSON`; never commit it.
4. Set `ALLOWED_ORIGINS` in `worker/wrangler.toml` to exact ResearchHub and frontend origins. Local development uses `worker/wrangler.local.toml`, which avoids the remote ResearchHub service binding so Wrangler does not need a Cloudflare login just to start.
5. Start the app and API in separate terminals: `npm run dev` and `npm run dev:worker`. Keep the frontend on `http://localhost:3000`; the default Worker URL is `http://localhost:8787`.
6. In ResearchHub admin tool settings, set Writing Lab URL to the deployed frontend. ResearchHub appends the active `projectId` and passes the SSO session by the existing `postMessage` handoff.
7. Deploy the Worker with `npm run deploy:worker`. Production needs the `FIREBASE_SERVICE_ACCOUNT_JSON` Wrangler secret.

The Worker verifies the HyperDataLab SSO token with `/oauth/userinfo`, checks the requested project against ResearchHub's authenticated `GET /api/projects`, and only then accesses Firestore at `users/{uid}/projects/{projectId}/writingRecords/{recordId}`. It does not add writing records to ResearchHub's paper workspace. Firestore Rules deny direct browser access; only the Worker service account reads and writes records. Never put service-account keys or private API tokens in `NEXT_PUBLIC_*` variables.

## Text storage

`src/shared/storage/writingRepository.ts` stores versioned JSON records through the Worker in Firestore. Records include evaluation, revision, generation and calibration results. Writes use Firestore `updateTime` preconditions and return `412` if another writer updated the record. The large `recordJson` field is exempt from indexing.

The Writing Lab routes include Evaluate, Revise, Generate, History, Calibration, report/print and before/after comparison. Model calls require a user API key and a recorded privacy consent; the key remains in browser localStorage and passes through the Worker without logging. The Worker allows only configured 9router hostnames. Evaluation issues are shown only when their quoted source text can be anchored to an exact span.

## Worker API

`GET /api/health` confirms that the Worker is reachable. Set `NEXT_PUBLIC_WORKER_API_URL` to the deployed Worker URL for production. Add API routes under `/v1/*` and keep secrets in Wrangler secrets rather than `wrangler.toml`.
