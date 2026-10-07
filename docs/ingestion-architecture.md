# Telegram → webpage ingestion architecture

## Decision

Use the existing VPS for the always-on Telegram Local Bot API and ingestion worker. Use Cloudflare D1 for durable intake/metadata/rights state and Cloudflare R2 for private originals, quarantine files, OCR output, covers, and rights evidence. Keep the public website on the existing production domain and publish only records whose rights review and metadata approval are complete.

This is a staged implementation. It does **not** register a Telegram webhook, migrate the bot, create a tunnel, or publish a PDF until staging tests and the rights workflow are ready.

## Data flow

```text
Telegram group
  → Telegram Local Bot API on VPS (large-file capable)
  → authenticated intake endpoint
  → D1: persist + deduplicate update before HTTP 200
  → VPS worker claims queued item
  → Local Bot API download
  → signature/MIME/size/hash/malware checks
  → R2 private quarantine/originals
  → OCR + metadata draft
  → rights evidence review
  → approved book record
  → website catalog reads published records only
```

## Invariants

- `telegram_update_id` and Telegram `file_id` are idempotency keys.
- The receiver persists a candidate before acknowledging it to Telegram.
- Raw Telegram updates, captions, user details, bot tokens, and API secrets are not written to logs.
- Originals remain private/quarantined; Telegram file URLs are never public catalog URLs.
- A group upload creates a draft/review item, not an automatic public book.
- Rights approval and metadata approval are both required before `published`.
- Retries are bounded and visible through `ingestion_events` and failure fields.
- Existing webhook settings remain unchanged until end-to-end staging validation passes.

## Current blocker / prerequisites

- Cloudflare account `Hlah3894@gmail.com's Account` is connected. No D1 database exists yet.
- Cloudflare R2 is not enabled in the account; enablement must be completed in the Cloudflare Dashboard before bucket creation.
- VPS hostname, SSH user, deployment directory, and the user's preferred SSH access method are still needed. Do not send private keys or bot secrets in chat.
- The Telegram Local Bot API migration requires `api_id` and `api_hash` and causes a short delivery interruption. Do not perform it until the exact cutover and rollback plan is approved.

## Repository layout for the next implementation step

- `infra/cloudflare/schema.sql` — D1 tables and indexes for intake, rights, drafts, and events.
- `docs/telegram-ingestion.md` — existing Telegram behavior and rights notes.
- `HANDOFF.md` — operational handoff and safety blockers.
- `app/api/telegram/webhook/route.ts` — current filter-only receiver; it must not be activated until replaced by a durable receiver.

## Rollout order

1. Create D1 database and private R2 bucket after confirming resource names and account.
2. Deploy the durable receiver/worker contract to a protected staging endpoint.
3. Provision the VPS Local Bot API and worker with secrets stored only on the VPS.
4. Run synthetic updates and test deduplication, retries, failure/quarantine, and rollback.
5. Attach rights evidence to each intake item and test review → publish transitions.
6. Connect the website catalog to `published` records and verify that unapproved files remain private.
7. Only then register the Telegram webhook and verify `getWebhookInfo`; never use `drop_pending_updates=true`.
