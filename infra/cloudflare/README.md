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
