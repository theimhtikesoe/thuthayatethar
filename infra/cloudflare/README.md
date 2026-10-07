# Cloudflare ingestion infrastructure

This directory contains infrastructure inputs for the Telegram ingestion pipeline.

## Resources

- D1 database: `thuthayatethar-ingestion` (to be created after approval)
- R2 bucket: `thuthayatethar-private-ingestion` (to be created after R2 is enabled)
- Schema: [`schema.sql`](./schema.sql)

## Security rules

- Keep the bucket private. Do not attach a public `r2.dev` or custom domain for originals.
- Keep Telegram bot tokens, webhook secrets, Cloudflare API tokens, R2 S3 credentials, `api_id`, and `api_hash` outside Git.
- Use VPS/secret-manager environment variables for worker credentials.
- Do not register or change the Telegram webhook until the durable receiver and rollback path are tested.

This is intentionally a staging contract; it does not create Cloudflare resources or perform Telegram cutover by itself.
