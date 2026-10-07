# VPS deployment handoff

The existing VPS is the intended always-on host for Telegram's official Local Bot API server and the ingestion worker that downloads files larger than Telegram Cloud Bot API's 20 MB limit.

Before deployment, collect the VPS hostname or IP, SSH username, deployment directory, OS/Docker availability, and the user's preferred secret storage method. Do not put an SSH private key, Telegram bot token, `api_id`, `api_hash`, webhook secret, or Cloudflare R2 credential in Git or chat.

The cutover must be staged: run the Local Bot API in an isolated test mode, verify the worker can claim and download a test item, then approve the short Telegram webhook migration and rollback window. Do not call `logOut`, `setWebhook`, or `drop_pending_updates=true` as part of repository setup.
