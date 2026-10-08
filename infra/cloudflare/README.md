# Cloudflare ingestion infrastructure

This directory contains infrastructure inputs for the Telegram ingestion pipeline.

## Resources

- D1 database: `thuthayatethar-ingestion` (schema applied and verified)
- R2 bucket: `thuthayatethar-private-ingestion` (APAC, Standard, private by default)
- Schema: [`schema.sql`](./schema.sql)

## Automatic cleanup

The bucket lifecycle is configured to abort incomplete multipart uploads after 1 day, delete `tmp/` after 2 days, delete `ocr-temp/` after 7 days, delete `quarantine-expiring/` after 14 days, and delete `failed/` after 30 days. Approved originals, published assets, and rights evidence must use different prefixes and are not covered by these deletion rules.

R2 Standard currently includes 10 GB-month of storage, 1 million Class A operations, 10 million Class B operations, and free egress each month. This cleanup policy reduces temporary-file growth but cannot guarantee the account stays under 10 GB if approved originals accumulate; storage usage must still be monitored.

## Security rules

- Keep the bucket private. Do not attach a public `r2.dev` or custom domain for originals.
- Keep Telegram bot tokens, webhook secrets, Cloudflare API tokens, R2 S3 credentials, `api_id`, and `api_hash` outside Git.
- Use VPS/secret-manager environment variables for worker credentials.
- Do not register or change the Telegram webhook until the durable receiver and rollback path are tested.

This is intentionally a staging contract; it does not perform Telegram cutover by itself.

## Deployed staging receiver

- Worker: `thuthayatethar-telegram-ingestion` (`workers.dev` enabled; preview URLs disabled).
- Health URL: `https://thuthayatethar-telegram-ingestion.hlah3894.workers.dev/health`.
- Webhook path: `https://thuthayatethar-telegram-ingestion.hlah3894.workers.dev/telegram/webhook`.
- The Worker is bound to the `thuthayatethar-ingestion` D1 database and allowlisted for the approved group ID. Its webhook secret is intentionally not configured yet.
- Verified behavior: `GET /health` returns HTTP 200; `POST /telegram/webhook` without a secret returns HTTP 503 (`webhook_not_configured`). The Telegram webhook has not been registered or changed.
- The `feat/telegram-pdf-reader` source branch accepts only PDF documents from the allowlisted group, validates the `%PDF-` header and configured byte limit, stores the bytes in private R2, records the operator's rights attestation, and creates a published D1 book record. The `GET /books/:slug/pdf` route serves only published objects inline; `/catalog` includes its PDF reader URL.
- The Next.js site consumes the catalog response and opens the PDF in a responsive reader frame. It keeps the sample catalog only when the catalog API is not configured or unavailable.
- A dedicated Cloudflare Tunnel and DNS name, `pdf-relay.rz99systems.com`, have been created with the origin set to the future `pdf-relay:8090` container. The route is not active yet because the tunnel connector and relay container have not been installed on the VPS.
- The VPS relay source is in `infra/vps/pdf-relay`. It proxies only Telegram `getFile` metadata and streams files from the Local Bot API's read-only data volume. A Cloudflare Access self-hosted app and Service Auth policy now protect `pdf-relay.rz99systems.com`, allowing only the dedicated ingestion Worker token; its client ID and secret are stored as Worker secret bindings. Never publish relay port 8090 or Local Bot API port 8081 on the VPS host.
- Live Worker settings remain on `https://api.telegram.org` and `MAX_FILE_BYTES=20971520`; the `feat/telegram-pdf-reader` template uses `https://pdf-relay.rz99systems.com` and `MAX_FILE_BYTES=167772160`. The live Worker has not been switched or deployed, and Telegram's webhook/session has not been changed.
