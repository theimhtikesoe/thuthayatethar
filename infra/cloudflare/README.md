# Cloudflare Telegram ingestion infrastructure

This directory contains the Worker source, D1 schema, and test harness for the Telegram PDF ingestion pipeline.

## Production resources

- Worker: `thuthayatethar-telegram-ingestion` at `https://thuthayatethar-telegram-ingestion.hlah3894.workers.dev`.
- D1: `thuthayatethar-ingestion` (`e6631b37-bcbb-4550-b4c7-3acebb961484`).
- R2: `thuthayatethar-private-ingestion` (private by default; no public `r2.dev` or custom-domain exposure).
- The public website domain is a verified Vercel project domain. Its DNS is unproxied and there is no Cloudflare Worker route for the site root; Cloudflare is used here for ingestion and private storage, not as the site's reverse proxy.
- The Worker receives Telegram/API and relay credentials through secret bindings/Secret Store. Never print, commit, or request those values in chat.

## Storage and security

The bucket lifecycle is configured to abort incomplete multipart uploads after 1 day, delete `tmp/` after 2 days, `ocr-temp/` after 7 days, `quarantine-expiring/` after 14 days, and `failed/` after 30 days. Approved originals, published assets, and rights evidence must use separate prefixes and are not covered by those deletion rules.

Keep originals private. A successful retry creates a D1 book draft and private R2 object only; it does not approve rights or publish the book. Rights evidence and a human admin approval remain prerequisites for publication. The Worker currently does not provide automated OCR or a malware verdict.

## Large-file stream requirement

R2 must receive the native `readable` half of `FixedLengthStream` so Cloudflare retains the known-length metadata required for streaming. Do not pass a derived result from `source.pipeThrough(new FixedLengthStream(size))` to `R2Bucket.put`; that can fail with `Provided readable stream must have a known length` for large PDFs.

The intake processor builds `new FixedLengthStream(expectedBytes)`, sends `fixedLengthStream.readable` directly to `BUCKET.put`, and pipes the incoming counted stream into `fixedLengthStream.writable`. The stream is aborted on upload/pipe errors, and the intake stays failed rather than publishing partial content.

## Admin recovery

The authenticated `/admin` list includes failed intake rows and their error messages. `POST /admin/retry/:intakeId` requires the existing admin token, accepts only a failed PDF intake, prevents duplicate concurrent retries by changing its status conditionally, and schedules private reprocessing. On success, check the resulting D1 `storage_key`, `byte_size`, and `draft` state. Do not read the PDF payload to verify storage.

## Validation and deployments

- `pnpm test:ingestion` runs Worker webhook, large-stream, private-draft retry, and PDF range-request tests.
- `pnpm typecheck` and `pnpm build` validate the Next.js admin proxy/UI.
- Cloudflare's script-content update API changes Worker code **without touching config or metadata**; use this code-only endpoint so live D1/R2 and secret bindings are preserved. Verify `/health` and `/catalog` after deployment.
- The website UI deploys through GitHub `main` → Vercel. Do not point the site domain at the ingestion Worker or legacy proxy.
