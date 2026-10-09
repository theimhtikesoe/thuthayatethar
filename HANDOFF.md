# Telegram PDF ingestion — handoff

**Updated:** 2026-10-09 (UTC+7)

**Repository:** `theimhtikesoe/thuthayatethar`

## Current topology

- The public website is hosted by Vercel project `thuthayatethar`; `https://thuthayatethar.rz99systems.com/` is a verified project domain. Cloudflare DNS has an unproxied A record to Vercel (`76.76.21.21`) and the `rz99systems.com` zone has no Worker routes. The website is therefore not served through the legacy Cloudflare proxy Worker. Do not repoint DNS or attach that proxy without a separate reason; its old origin is not used by this domain.
- The ingestion backend is a separate production Cloudflare Worker: `thuthayatethar-telegram-ingestion` at `https://thuthayatethar-telegram-ingestion.hlah3894.workers.dev`. It is bound to D1 `thuthayatethar-ingestion` (`e6631b37-bcbb-4550-b4c7-3acebb961484`) and the private R2 bucket `thuthayatethar-private-ingestion`.
- Worker bindings include an admin token, D1/R2, Telegram/relay configuration and secret-store references. Secret values were not read or printed. The catalog served through the Vercel API and the Worker catalog matched exactly at 75 records during this check.
- The latest 135 MB Telegram PDF reached D1 but ended with `status=failed`; it has no storage key or book draft. The recorded R2 error was that the readable stream had no known length. The cause was wrapping Cloudflare's `FixedLengthStream` in `pipeThrough`, which removed the native known-length marker before `R2Bucket.put` received the stream.

## Recovery and safety

- PR #14 fixes the R2 stream handoff, lists failed PDF intakes and their error messages in the authenticated `/admin` screen, and adds a one-shot admin retry endpoint.
- Retry reuses the stored Telegram file ID and saves the file to private R2 as a draft. It does **not** approve rights or publish the book. Rights evidence still needs human review before publication. If retry fails, the item remains failed with a diagnostic message.
- Regression tests cover the native `FixedLengthStream.readable` path and retry-to-private-draft behavior. Production retry of the recorded 135 MB intake must be verified after the Worker code and admin UI are deployed.
- No Telegram `setWebhook` call was made in this work. D1 shows the file reached the Worker intake path, but the Bot API's current `getWebhookInfo` response was not queried; do not claim or change the remote webhook URL based on this handoff alone.

## Security and operations

- Keep bot/admin/webhook/Cloudflare/relay secrets out of Git, logs, and chat. Never ask the user to paste them into chat.
- Keep R2 private. The retry path creates a private draft only; publishing remains a separate admin action gated by rights review.
- For a new release, merge the tested GitHub PR to `main` for Vercel. Deploy Worker **content only** through the Cloudflare script-content API so existing config/bindings remain unchanged; verify `/health`, `/catalog`, then inspect the D1 status and storage metadata of the retried intake without reading the PDF contents.
