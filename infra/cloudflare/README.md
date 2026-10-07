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
- The Worker now stores Telegram file metadata, downloads supported files through the configured Telegram API, writes validated bytes to the private `originals/` R2 prefix, creates a D1 book draft, and records processing failures/events. It does not automatically approve rights or publish a book.
- `GET /catalog` returns only `publication_status='published'` records. `POST /admin/publish/:slug` requires `ADMIN_TOKEN` and an existing `rights_status='approved'` record. The Next.js site proxies this catalog through `/api/catalog` and keeps its sample catalog as a fallback until `CATALOG_API_URL` is configured.
- For files larger than Telegram's hosted Bot API download limit, deploy the same Worker with `TELEGRAM_API_BASE_URL` pointing to the approved Local Bot API endpoint and test the VPS flow before registering the production webhook.
