# Telegram PDF ingestion — handoff

**Updated:** 2026-10-10 (UTC+7)

**Repository:** `theimhtikesoe/thuthayatethar`

## Current topology

- The public site is hosted by the Vercel project `thuthayatethar`. Its custom domain points directly to Vercel through an unproxied Cloudflare DNS record; no Cloudflare Worker route serves the site root. Do not repoint DNS or attach the legacy proxy without a separate reason.
- Telegram intake is handled by the separate production Worker `thuthayatethar-telegram-ingestion` at `https://thuthayatethar-telegram-ingestion.hlah3894.workers.dev`, using D1 `thuthayatethar-ingestion` and the private R2 bucket `thuthayatethar-private-ingestion`.
- The current Worker bindings include the admin token, D1/R2, Telegram/relay configuration and Secret Store references. Secret values were not read or printed. The live Vercel and Worker catalogs matched at 75 published records during verification.

## Diagnosed intake failures

- The latest Telegram PDFs had D1 intake records but no R2 storage key or private book draft. The first confirmed failure was passing a derived stream without Cloudflare's native known-length marker to `R2Bucket.put`.
- PR #14 corrected the R2 streaming handoff and added authenticated admin retry. The two retries returned to `received` but remained pending after several minutes.
- Cloudflare's official runtime documentation explains the second issue: `ctx.waitUntil()` work is cancelled after 30 seconds once the HTTP response is complete. The Worker must not use it for long PDF transfer.

## Durable recovery change

- The follow-up change drains D1 `received` intakes through a one-minute native Worker Cron. A conditional D1 update claims one `downloading` item at a time; a download left `downloading` for 20 minutes is eligible for recovery. Cron invocations can run for up to 15 minutes.
- Admin retry only changes a failed PDF to `received` and records a retry event; it does not approve rights. On success, a Telegram document PDF received at or after the `AUTO_PUBLISH_FROM` Worker var is auto-published (intake and book draft become `published`; the RightsRecord stays `missing` with `evidence_note = 'auto_publish_unreviewed'`). An older item becomes a private `draft`. Policy decision (2026-10-10): auto-publish stays. An admin can record rights afterwards from `/admin` ("Rights အတည်ပြုမည်"), which does not change the publication status.
- After deployment, verify that the Worker's Cron schedule is `* * * * *`, then inspect D1 `status`, `storage_key`, and `byte_size` for the two pending records. Do not read the PDF payload to verify storage.
- Regression tests cover large streaming, retry with the auto-publish cutoff, active-claim exclusion and recovery of stale downloads. The real production retry is not complete until D1 shows `published` (or `draft` for an item received before `AUTO_PUBLISH_FROM`) with a storage key.

## Security and operations

- No Telegram `setWebhook` call was made. D1 proves that Telegram documents reached the intake path, but the Bot API's current `getWebhookInfo` was not queried; do not claim or change the remote webhook URL based on this handoff alone.
- Keep bot/admin/webhook/Cloudflare/relay secrets out of Git, logs and chat. Never ask the user to paste them into chat.
- The root website deploys through GitHub `main` → Vercel. Cloudflare Worker content deployments must preserve existing bindings and secrets. Verify `/health`, `/catalog`, Cron schedules and intake state after a release.
