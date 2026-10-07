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
- Current code stores Telegram file metadata, an initial missing-rights record, and a received event in D1. It does **not** download the PDF into R2, run OCR, or publish a catalog entry. Do not describe this as end-to-end book ingestion.
