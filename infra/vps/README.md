# VPS Telegram PDF relay

## Current state

The VPS already has the official Telegram Local Bot API container running in `--local` mode on `127.0.0.1:8081`, with its data persisted in the Docker volume `telegram-local-bot-api_telegram-bot-api-data`. Keep that port loopback-only. Existing Hiddify HAProxy, `rpxy-l4`, and other bot containers must not be changed.

A Cloudflare Tunnel named `thuthayatethar-pdf-relay` and the hostname `pdf-relay.rz99systems.com` have been created after the operator approved the new public hostname. The Tunnel currently routes to the future `http://pdf-relay:8090` service. No `cloudflared` connector is running yet, so the public route is not active.

## Relay design

`pdf-relay/` contains a small standard-library HTTP service. It accepts only Telegram `getFile` metadata lookups and PDF reads from the Bot API data volume, rejects paths outside that volume, checks the `%PDF-` signature, and enforces a 160 MiB cap. It is not bound to a host port. The cloudflared container and relay container will share only the existing Local Bot API Compose network.

The Cloudflare Access self-hosted app and Service Auth policy are already created for `pdf-relay.rz99systems.com`; the policy permits only the dedicated Telegram-ingestion Worker service token. Its client ID and secret are stored as Worker secret bindings, not in the repository. The Local Bot API port, relay port, bot token, API ID/hash, Access credentials, and Tunnel connector token must never be published in Git or sent in chat.

## Cutover safety

Do not call Bot API `logOut`, change `setWebhook`, or discard pending updates as part of relay setup. These actions belong to a separate cutover after the relay is deployed and tested. Telegram's Local Bot API mode returns absolute VPS file paths, so a Cloudflare Worker cannot download a large local-mode file merely by changing `TELEGRAM_API_BASE_URL`; the relay is required.
