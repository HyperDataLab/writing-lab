# Writing Lab Worker

The Worker validates the HyperDataLab SSO token, checks project ownership through ResearchHub's authenticated `/api/projects` API, then handles requests for that user and project. Writing records are stored in Cloud Firestore at `users/{uid}/projects/{projectId}/writingRecords/{recordId}`. The ResearchHub Files workspace is not used for these records.

## Local setup

Copy `.dev.vars.example` to `.dev.vars` and set `FIREBASE_SERVICE_ACCOUNT_JSON` to the service-account JSON. Keep the private key out of Git. The service account must have Firestore read/write access. Start with `npm run dev:worker` from the repository root.

## Production

- `FIREBASE_SERVICE_ACCOUNT_JSON` is a Wrangler secret. The key stays in the Worker and never reaches the browser.
- `wrangler.toml` contains ResearchHub, SSO, allowed-origin, and model endpoint settings.
- `RESEARCH_HUB` is a remote service binding to `research-hub-files` so project checks use the existing ResearchHub API.
- Firestore rules deny direct client access. The Worker uses the service account and enforces the user/project path after validating SSO and project ownership.
- Current Writing Lab data is structured text/JSON, so it is stored directly in Firestore. Use Cloudflare R2 if a future feature needs binary attachments or large exports.

Deploy with `npm run deploy:worker` from the repository root after Wrangler is authenticated to the intended Cloudflare account.
