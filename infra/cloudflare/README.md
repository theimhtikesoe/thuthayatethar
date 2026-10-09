# Cloudflare Telegram ingestion infrastructure

This directory contains the production Worker source, D1 schema, Wrangler example, and regression tests for Telegram PDF intake.

## Production resources

- Worker: `thuthayatethar-telegram-ingestion` at `https://thuthayatethar-telegram-ingestion.hlah3894.workers.dev`.
- D1: `thuthayatethar-ingestion` (`e6631b37-bcbb-4550-b4c7-3acebb961484`).
- R2: `thuthayatethar-private-ingestion` (private by default; no public `r2.dev` or custom-domain exposure).
- The website domain is a verified Vercel project domain. Its DNS is unproxied and there is no Cloudflare Worker route for the site root; Cloudflare is used here for intake and private storage, not as the site's reverse proxy.
- Telegram/API and relay credentials are provided through secret bindings/Secret Store. Never print, commit, or request secret values in chat.

## D1-backed scheduled processing

Telegram intake and admin retries first persist a D1 `received` record and return promptly. They must not start long PDF transfers through `ctx.waitUntil()`: Cloudflare cancels HTTP-triggered `waitUntil` work 30 seconds after the response/client disconnect.

The Worker has a one-minute Cron Trigger (`* * * * *`). Each scheduled invocation:

1. Selects the oldest `received` intake, or a `downloading` item whose `updated_at` is older than 20 minutes.
2. Uses a conditional D1 update to claim it as `downloading`. A second invocation cannot claim an active download; only one file is processed at a time.
3. Downloads and validates the Telegram file, streams it to private R2, then marks an eligible Telegram document PDF `published` in D1 after storage succeeds. The private R2 object remains private; the published Worker routes serve it to the site. Other media remains a draft. A failure marks the intake `failed` with a bounded diagnostic code; the next admin retry returns it to `received`.

Cron invocations have a 15-minute wall-time limit. The 20-minute stale threshold gives a failed/terminated invocation time to finish or be cancelled before another attempt. Cron changes can take up to 15 minutes to propagate. After deployment, verify the active schedule using the Cloudflare Worker schedules endpoint.

Successful Telegram PDF ingestion/retry auto-publishes per the owner's instruction. This intentionally does not perform rights review: the RightsRecord remains `missing`. It is not a copyright clearance, OCR, or malware verdict. Only send PDFs authorized for public publication. The configured file-size ceiling remains 160 MiB by default; over-limit or failed uploads are never published.

## Large-file stream requirement

R2 must receive the native `readable` half of `FixedLengthStream` so Cloudflare retains the known-length metadata required for streaming. Do not pass a derived stream from `source.pipeThrough(new FixedLengthStream(size))` to `R2Bucket.put`; that can fail with `Provided readable stream must have a known length` for large PDFs.

The intake processor builds `new FixedLengthStream(expectedBytes)`, sends `fixedLengthStream.readable` directly to `BUCKET.put`, and pipes the incoming counted stream into `fixedLengthStream.writable`. The stream is aborted on upload/pipe errors, and the intake stays failed rather than publishing partial content.

## Admin recovery

The authenticated `/admin` list includes failed intake rows and their error messages. `POST /admin/retry/:intakeId` requires the existing admin token and accepts only a failed PDF intake. It conditionally changes the status to `received`, records `retry_queued`, and returns `202`; the scheduled processor handles it. The UI monitors `received`/`downloading` and reports success only after the D1 row reaches `draft`. Verify `storage_key`, `byte_size`, and status; do not read PDF contents for diagnostics.

## Validation and deployments

### SoundCloud audiobook support

- Published catalog rows may include `soundcloud_url`. SoundCloud-only Telegram links enter the same rights-review flow as other link submissions; a reviewer must approve them before publication. A SoundCloud URL posted with a PDF is retained on that PDF's book draft.
- A Telegram link to a public SoundCloud profile, `/tracks`, or `/popular-tracks` page is expanded into up to 50 separate track drafts. The Worker reads public SoundCloud HTML and extracts track names and permalinks from track microdata. Each track gets its own D1 intake, book draft and pending rights record. Repeated channel imports deduplicate on canonical track permalink; the records remain drafts until a reviewer approves them.
- Page fetches are limited to 8 seconds and 1 MiB, follow only HTTPS redirects to SoundCloud, and return a retryable webhook error if the page cannot be parsed or contains no tracks. This uses SoundCloud's public HTML rather than its OAuth-protected API, so a SoundCloud markup change may require updating the extractor. SoundCloud playlists (`/sets/...`) are not expanded yet; they currently remain a single SoundCloud link draft.
- Before deploying the Worker code, apply `migrations/0004_soundcloud_audiobooks.sql` to existing D1 databases (for example, from the repository root: `pnpm dlx wrangler d1 execute thuthayatethar-ingestion --remote --file=infra/cloudflare/migrations/0004_soundcloud_audiobooks.sql`). Do not reapply the `ALTER TABLE` if the column already exists. Fresh schema installations already include the column in `schema.sql`.
- The website caches catalog metadata and book covers for offline browsing and stores SoundCloud playback position locally. SoundCloud audio is still streamed by SoundCloud and is unavailable offline; the service worker intentionally does not cache the third-party audio stream.

- `pnpm test:ingestion` covers webhook intake, duplicate delivery, large known-length stream, private-draft retry, stale-claim recovery, size-limit failures, and PDF range requests.
- `pnpm typecheck` and `pnpm build` validate the Next.js admin proxy/UI.
- Cloudflare's script-content API changes Worker code without replacing bindings/settings. Use the dedicated schedules endpoint to set Cron triggers; preserve existing schedules and Worker configuration when editing them.
- Verify `/health`, `/catalog`, active Cron schedule, then inspect D1 state and storage metadata after production retry.
- The website UI deploys through GitHub `main` → Vercel. Do not point the site domain at the ingestion Worker or legacy proxy.
