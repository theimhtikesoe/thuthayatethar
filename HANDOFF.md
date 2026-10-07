# Telegram PDF ingestion — handoff

**Updated:** 2026-10-08 (UTC+7)

**Repository:** `theimhtikesoe/thuthayatethar`

**Working branch:** `audit/telegram-file-ingestion` (started from `main`, commit `081e2caa4ffa93fb06c9cea1555c1adf334676a8`)

## Current state

- Vercel project `thuthayatethar` is linked to this GitHub repository in team `theimhtikesoe's projects` (Hobby plan); production branch is `main`.
- Current production Vercel deployment: `dpl_Ev4ouoNbfvLx6qDR3iXJjwAzeP4A`, state `READY`, from `main` commit `081e2caa4ffa93fb06c9cea1555c1adf334676a8`.
- Custom domain `thuthayatethar.rz99systems.com` is attached to this Vercel project and Vercel reports it `verified: true`. Public fetch returned the expected Thuthayatethar homepage (8 catalog entries). The Cloudflare DNS record was **not edited** during this work: the exact-host record observed was a proxied `AAAA 100::` record; authoritative DNS is Cloudflare (`alice.ns.cloudflare.com`, `uriah.ns.cloudflare.com`). Re-check DNS and live routing before any further cutover or cleanup.
- Vercel deployment protection reports SSO enabled for all Vercel deployments except custom domains. The custom domain is therefore the public hostname; do not weaken project-wide SSO protection just to expose a webhook.
- Environment variable **names and scopes** confirmed without reading secret values:
  - `TELEGRAM_ALLOWED_CHAT_IDS=-4314141664` in Production, Preview, Development.
  - `TELEGRAM_BOT_TOKEN` — sensitive/secret, Production only.
  - `TELEGRAM_WEBHOOK_SECRET` — sensitive/secret, Production only.
  - Never retrieve, print, commit, or ask the user to send the secret values in chat.
- No Telegram webhook was registered or changed by this work.
- The user says they have authorization/licensing evidence for the PDFs and will provide it. Evidence has not yet been attached or independently checked; do not publish any full PDF until the matching evidence is reviewed and recorded.

## Critical safety blocker — do not activate Telegram webhook yet

`app/api/telegram/webhook/route.ts` validates the webhook secret and chat allowlist, recognizes group `document`/`photo` updates, writes only a privacy-safe log line, then returns HTTP 200 with `status: "accepted"`. It does **not** persist the Telegram update, enqueue work, download the file, or publish catalog content. Registering this endpoint with Telegram now would acknowledge and discard incoming media updates. **Do not call `setWebhook` until a durable queue/storage path is implemented, tested, and ready.** Preserve any existing Telegram webhook until the new route is fully ready.

## Platform badge and continuation notes

- The application source does not contain a `Made with Manus` label or badge. An anonymous fetch of the live custom domain showed that the Manus gateway injects platform-owned HTML metadata, a `<manus-content-root>` element, and an editor/badge runtime; its current runtime configuration reports `hideBadge: false`.
- This badge is not controlled by React markup, CSS, an environment variable, or the Webdev config plane. Do not add a client-side DOM/CSS hack to suppress it. Use the owner-only Manus Dashboard badge-visibility setting when the correct project account is available; the current sandbox was not attached to that managed project and the authenticated dashboard account did not list it, so no owner setting was changed during this work.
- Keep this `HANDOFF.md` file in version control as the project continuation source of truth. Update it when branch, deployment, hosting, secrets scope, rights evidence, or safety blockers change. The Manus `handoff` tool is for transferring one temporary file between execution devices; it is not a replacement for repository project documentation.

## Large-file / host constraints

- The group contains PDFs reported as 129 MB and 59 MB. Telegram's cloud Bot API `getFile` download limit is 20 MB. The official local Bot API server can remove that download limit in `--local` mode, but requires `api_id` and `api_hash` from `my.telegram.org` and a deliberate bot migration (`logOut` from `api.telegram.org` before switching). Expect a short delivery interruption during cutover.
- No persistent Cloud Computer is available in the authorized device inventory. The only available host is the user's Mac. Docker CLI is present but the Docker daemon was not running; `cloudflared` is absent. The connected Cloudflare account has no existing tunnel or D1 database; R2 is not enabled. Do not create paid resources, new tunnels, expose a local API, or switch the bot without the user's explicit approval of the exact plan.
- If the Mac is used as the host, it must remain awake, online, and running Docker; a sleeping/offline Mac stops ingestion and file delivery. Prefer a dedicated always-on host for production reliability.

## Recommended continuation

1. Review the user's rights/license evidence **per PDF** and keep evidence metadata with each intake item.
2. Implement a durable, idempotent intake path: validate webhook secret + chat allowlist, persist update before HTTP 200, deduplicate by Telegram `update_id`/file ID, and provide bounded retries/error visibility.
3. Choose/approve durable storage and worker hosting. Store originals privately/quarantined first; verify PDF signature/type/size/hash; never expose raw uploads directly to the public catalog.
4. Run the local Bot API server on an approved always-on host for files over 20 MB, behind an authenticated TLS tunnel/reverse proxy. Keep `api_id`, `api_hash`, bot token, and tunnel credentials in host/secret-manager storage, never Git.
5. Add a review/publish step so a file is added to the public book catalog only after rights evidence and metadata are approved. The current homepage has static catalog entries; no upload-to-catalog publish flow exists.
6. Only after staging tests pass, set Telegram's webhook URL to `https://thuthayatethar.rz99systems.com/api/telegram/webhook`, using the configured secret header. Verify `getWebhookInfo`, end-to-end retry behavior, large-file downloads, storage, and rollback. Do not set `drop_pending_updates=true`.
7. Keep Vercel production on `main`; use the audit branch for implementation and a protected preview until the user approves a production deploy/cutover.

## Official references checked

- Telegram Bot FAQ: https://core.telegram.org/bots/faq (cloud `getFile` limit and group delivery/privacy behavior).
- Official Telegram Bot API server: https://github.com/tdlib/telegram-bot-api (`--local`, `api_id`/`api_hash`, migration behavior).
- Telegram privacy mode: https://core.telegram.org/bots/features#privacy-mode.
