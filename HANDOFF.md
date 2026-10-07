# Telegram PDF ingestion — handoff

**Updated:** 2026-10-08 (UTC+7)

**Repository:** `theimhtikesoe/thuthayatethar`

**Working branch:** `feat/telegram-ingestion-worker` (PR #2 merged; staging status documentation is being updated here)

## Current state

- Vercel project `thuthayatethar` is linked to this repository in team `theimhtikesoe's projects`; production branch is `main`.
- Latest Vercel production deployment is READY: `dpl_7kPab9WU3hY3E5cSTCd5AHMTyct4`, from `main` commit `51b0537001ef7ce3dffa8ff1b4a4849a83b8beaa` (merge of PR #2).
- Custom domain `https://thuthayatethar.rz99systems.com/` is attached to the Vercel project and previously verified as public. The live catalog still contains static/sample entries; no Telegram-to-catalog publish flow exists.
- Vercel deployment protection remains SSO-enabled for Vercel aliases except custom domains. No project-wide protection setting was changed.
- Environment variable names/scopes were confirmed without reading secret values: `TELEGRAM_ALLOWED_CHAT_IDS=-4314141664` in Production/Preview/Development; `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` are secret Production variables. Never retrieve, print, commit, or ask the user to send secret values in chat.
- No Telegram webhook was registered or changed in this work.
- The user says licensing/authorization evidence exists for the PDFs, but evidence has not been attached or checked. Do not publish full PDFs until evidence is reviewed and recorded per item.

## Cloudflare staging receiver

- Cloudflare account: `557f8dd4f971a942beb3057ddc74a248` (Worker Bindings and full API calls succeeded during this work).
- D1 database: `thuthayatethar-ingestion` (`e6631b37-bcbb-4550-b4c7-3acebb961484`), schema applied and verified.
- Private R2 bucket: `thuthayatethar-private-ingestion` in APAC Standard. Lifecycle cleanup is configured for incomplete multipart uploads (1 day), `tmp/` (2 days), `ocr-temp/` (7 days), and `failed/` (30 days); approved originals and rights evidence are not covered by those deletions.
- Staging Worker `thuthayatethar-telegram-ingestion` is deployed, D1-bound, and available at `https://thuthayatethar-telegram-ingestion.hlah3894.workers.dev`. Its `workers.dev` endpoint is enabled and preview URLs are disabled.
- Verified live: `GET /health` returns HTTP 200. `POST /telegram/webhook` without a webhook secret returns HTTP 503 (`webhook_not_configured`). The secret is intentionally unset, so no real Telegram updates are accepted yet.
- Current source Worker binds the private R2 bucket, downloads files through the configured Telegram API, writes `originals/<intake-id>/...`, creates a draft, and records `stored_in_r2`/failure events. It still does not run OCR or auto-publish; rights approval is required before `POST /admin/publish/:slug` can publish.
- PR #2 (`fix: fail closed when webhook secret is missing`) was merged; its regression test confirms the unconfigured-secret path returns 503. The worker source has 3 passing ingestion tests.

## Critical safety blockers

`app/api/telegram/webhook/route.ts` still validates the secret and group allowlist, recognizes media updates, and then returns HTTP 200 with `status: "accepted"` without persisting the update. Registering Telegram to that Vercel endpoint would acknowledge and discard media. The Cloudflare staging receiver now persists metadata, but its secret is unset and file download/storage is not implemented. **Do not call `setWebhook` until the receiver secret, durable file processing to private R2, large-file handling, end-to-end tests, and rollback path are ready.** Preserve any existing Telegram webhook until then.

## Large-file / host constraints

- PDFs in the group were reported as 129 MB and 59 MB. Telegram's cloud Bot API `getFile` download limit is 20 MB.
- User-provided inspection output described a VPS named `wg-sg-01` running Ubuntu 22.04 x86_64 with Docker 29.2.1. The inspection also showed that `/root/.ssh/id_ed25519` was not present in that shell. This sandbox has not connected to or deployed on the VPS; host access and secret storage still need a safe setup.
- Telegram's official Local Bot API server can remove the download limit in `--local` mode, but requires `api_id` and `api_hash` and a deliberate bot migration (`logOut` from `api.telegram.org` before switching). Expect a short delivery interruption. Do not switch the bot or create paid resources/tunnels without explicit approval of the exact plan.
- Keep `api_id`, `api_hash`, bot token, webhook secret, R2 credentials, and SSH private keys out of Git and chat.

## Recommended continuation

1. Deploy the updated Worker with the R2 binding and secrets; then run synthetic updates and verify the private R2 object plus D1 draft.
2. For files over 20 MB, test the official Local Bot API on the approved always-on VPS. Confirm host access and secret storage first; do not migrate the bot until the test and rollback steps are explicit.
3. Configure webhook and bot credentials only through a secure secret-entry mechanism, never in chat. Before changing Telegram, check `getWebhookInfo` and show the user the exact current and target URLs, allowed updates, pending-update behavior, and rollback. Do not use `drop_pending_updates=true`.
4. Test the staging Worker end to end with synthetic updates and test files; verify D1 retry/deduplication and private R2 writes. Only then register Telegram to `https://thuthayatethar-telegram-ingestion.hlah3894.workers.dev/telegram/webhook`.
5. Review rights/licensing evidence per PDF and retain the evidence metadata. Add an approval/review step before any book becomes public.
6. Set Vercel `CATALOG_API_URL` to the Worker `/catalog` endpoint; the site will show published records and retain sample fallback when the endpoint is not configured.

## Official references checked

- Telegram Bot FAQ: https://core.telegram.org/bots/faq
- Official Telegram Bot API server: https://github.com/tdlib/telegram-bot-api
- Telegram privacy mode: https://core.telegram.org/bots/features#privacy-mode
