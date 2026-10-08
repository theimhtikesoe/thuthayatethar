# VPS Telegram PDF relay

## Current state

The VPS already has the official Telegram Local Bot API container running in `--local` mode on `127.0.0.1:8081`, with its data persisted in the Docker volume `telegram-local-bot-api_telegram-bot-api-data`. Keep that port loopback-only. Existing Hiddify HAProxy, `rpxy-l4`, and other bot containers must not be changed.

A Cloudflare Tunnel named `thuthayatethar-pdf-relay` and the hostname `pdf-relay.rz99systems.com` have been created after the operator approved the new public hostname. The Tunnel routes to `http://pdf-relay:8090`. In the latest VPS check, the relay was healthy but `cloudflared` was restarting because its non-root process could not read the mode-600 token file. The updated Compose override runs that container as root with a read-only filesystem, no Linux capabilities, and no-new-privileges; apply it and rerun the installer to preserve the existing token and recreate the connector.

## Relay design

`pdf-relay/` contains a small standard-library HTTP service. It accepts Telegram `getFile` metadata lookups, PDF reads from the Bot API data volume, and a constrained `setWebhook` request to the fixed Worker URL. It rejects paths outside the Bot API volume, checks the `%PDF-` signature, enforces a 160 MiB cap, rejects requests that would drop pending updates, and never logs token-bearing paths or webhook secrets. It is not bound to a host port. The cloudflared container and relay container share only the existing Local Bot API Compose network; Cloudflare Access permits the dedicated ingestion Worker service token.

The Cloudflare Access self-hosted app and Service Auth policy are already created for `pdf-relay.rz99systems.com`; the policy permits only the dedicated Telegram-ingestion Worker service token. Its client ID and secret are stored as Worker secret bindings, not in the repository. The Local Bot API port, relay port, bot token, API ID/hash, Access credentials, and Tunnel connector token must never be published in Git or sent in chat.

`cloudflared` needs root inside its container only to read the root-owned token file. It remains confined by a read-only root filesystem, dropped capabilities, and `no-new-privileges`; the relay's Bot API data mount remains read-only and neither container publishes a VPS host port.

## Install relay and Tunnel connector

From the existing VPS root shell, run:

```bash
git clone --depth 1 --branch feat/telegram-pdf-reader \
  https://github.com/theimhtikesoe/thuthayatethar.git /opt/thuthayatethar
bash /opt/thuthayatethar/infra/vps/install-relay.sh
```

The installer checks that the existing Local Bot API container, Compose file, `.env`, and data volume are present. It preserves the existing `.env`, copies the relay override, then prompts without echoing for the Tunnel connector token. Get the token in Cloudflare Dashboard → Networking → Tunnels → `thuthayatethar-pdf-relay` → Add a replica. The token is saved only to `/opt/telegram-local-bot-api/tunnel-token` with mode `600`; it is not printed, committed, or sent here. The connector uses Cloudflare's `--token-file` option (cloudflared 2025.4.0 or newer).

The installer starts only the relay and Tunnel containers. It does **not** call Bot API `logOut`, change `setWebhook`, or discard pending updates. After the relay is updated and healthy, the Worker can safely register its webhook using the webhook secret already held by Cloudflare; no Telegram token or webhook secret needs to be sent in chat.

## Cutover safety

Telegram's Local Bot API mode returns absolute VPS file paths, so a Cloudflare Worker cannot download a large local-mode file merely by changing `TELEGRAM_API_BASE_URL`; the relay is required. If `getWebhookInfo` on the local API returns an empty `url`, Telegram has no delivery destination and the Worker will never ingest group messages. Register the configured Worker URL through the Access-protected relay after confirming that the Local Bot API is authenticated. Never set `drop_pending_updates=true` during this repair.
