#!/usr/bin/env python3
"""Private-side relay for Telegram Local Bot API metadata and PDF bytes.

Only expose this container through the dedicated Cloudflare Tunnel hostname protected
by a Cloudflare Access Service Auth policy. Do not publish port 8090 on the VPS host.
"""
from __future__ import annotations

import json
import os
import re
import shutil
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, urlopen

HOST = "0.0.0.0"
PORT = int(os.environ.get("RELAY_PORT", "8090"))
LOCAL_API = os.environ.get("LOCAL_BOT_API_URL", "http://telegram-local-api:8081").rstrip("/")
FILE_ROOT = Path(os.environ.get("TELEGRAM_FILE_ROOT", "/var/lib/telegram-bot-api")).resolve()
MAX_FILE_BYTES = int(os.environ.get("MAX_FILE_BYTES", str(160 * 1024 * 1024)))
FILE_CHUNK_BYTES = 1024 * 1024
GET_FILE_PATH = re.compile(r"^/bot[^/]+/getFile$")
SET_WEBHOOK_PATH = re.compile(r"^/bot[^/]+/setWebhook$")
EXPECTED_WEBHOOK_URL = os.environ.get(
    "TELEGRAM_WEBHOOK_URL",
    "https://thuthayatethar-telegram-ingestion.hlah3894.workers.dev/telegram/webhook",
)
MAX_CONTROL_BODY_BYTES = 8192
WEBHOOK_SECRET_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,256}$")


def json_bytes(value: dict[str, object]) -> bytes:
    return json.dumps(value, separators=(",", ":")).encode("utf-8")


class RelayHandler(BaseHTTPRequestHandler):
    server_version = "TelegramPdfRelay/1.0"

    # Do not log request paths: getFile URLs contain the bot token.
    def log_message(self, _format: str, *_args: object) -> None:
        return

    def send_json(self, status: int, value: dict[str, object]) -> None:
        body = json_bytes(value)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        parsed = urlsplit(self.path)
        if parsed.path == "/health":
            self.send_json(200, {"ok": True, "service": "telegram-pdf-relay"})
            return
        if GET_FILE_PATH.fullmatch(parsed.path):
            self.proxy_get_file(parsed.path, parsed.query)
            return
        if parsed.path == "/relay/file":
            self.serve_file(parse_qs(parsed.query, keep_blank_values=True).get("path", []))
            return
        self.send_json(404, {"ok": False, "error": "not_found"})

    def do_POST(self) -> None:
        parsed = urlsplit(self.path)
        if not SET_WEBHOOK_PATH.fullmatch(parsed.path):
            self.send_json(404, {"ok": False, "error": "not_found"})
            return
        if "application/json" not in (self.headers.get("Content-Type") or "").lower():
            self.send_json(415, {"ok": False, "error": "unsupported_content_type"})
            return
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_json(400, {"ok": False, "error": "invalid_content_length"})
            return
        if content_length <= 0 or content_length > MAX_CONTROL_BODY_BYTES:
            self.send_json(413, {"ok": False, "error": "control_body_too_large"})
            return
        try:
            payload = json.loads(self.rfile.read(content_length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.send_json(400, {"ok": False, "error": "invalid_json"})
            return
        if not isinstance(payload, dict) or payload.get("url") != EXPECTED_WEBHOOK_URL:
            self.send_json(400, {"ok": False, "error": "unexpected_webhook_url"})
            return
        secret = payload.get("secret_token")
        if not isinstance(secret, str) or not WEBHOOK_SECRET_PATTERN.fullmatch(secret):
            self.send_json(400, {"ok": False, "error": "invalid_webhook_secret"})
            return
        allowed_updates = payload.get("allowed_updates", ["message", "edited_message"])
        if allowed_updates != ["message", "edited_message"]:
            self.send_json(400, {"ok": False, "error": "unexpected_allowed_updates"})
            return
        if payload.get("drop_pending_updates", False) is not False:
            self.send_json(400, {"ok": False, "error": "cannot_drop_pending_updates"})
            return
        forwarded_payload = json.dumps(
            {
                "url": EXPECTED_WEBHOOK_URL,
                "secret_token": secret,
                "allowed_updates": allowed_updates,
                "drop_pending_updates": False,
            },
            separators=(",", ":"),
        ).encode("utf-8")
        self.proxy_set_webhook(parsed.path, forwarded_payload)

    def proxy_set_webhook(self, path: str, body: bytes) -> None:
        # This route is reachable only through Cloudflare Access and only sets the fixed Worker URL.
        # Never log the request path or body: the URL path contains the bot token and the body the webhook secret.
        try:
            request = Request(
                f"{LOCAL_API}{path}",
                data=body,
                headers={"Accept": "application/json", "Content-Type": "application/json"},
                method="POST",
            )
            with urlopen(request, timeout=60) as response:
                response_body = response.read(256 * 1024 + 1)
                if len(response_body) > 256 * 1024:
                    self.send_json(502, {"ok": False, "error": "telegram_response_too_large"})
                    return
                self.send_response(response.status)
                self.send_header("Content-Type", response.headers.get("Content-Type", "application/json"))
                self.send_header("Content-Length", str(len(response_body)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(response_body)
        except HTTPError as error:
            response_body = error.read(256 * 1024)
            self.send_response(error.code)
            self.send_header("Content-Type", error.headers.get("Content-Type", "application/json"))
            self.send_header("Content-Length", str(len(response_body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(response_body)
        except (URLError, TimeoutError, OSError):
            self.send_json(502, {"ok": False, "error": "telegram_api_unavailable"})

    def proxy_get_file(self, path: str, query: str) -> None:
        # This proxy permits only the metadata lookup used by the Worker, never arbitrary Bot API methods.
        try:
            request = Request(f"{LOCAL_API}{path}?{query}", headers={"Accept": "application/json"}, method="GET")
            with urlopen(request, timeout=60) as response:
                body = response.read(256 * 1024 + 1)
                if len(body) > 256 * 1024:
                    self.send_json(502, {"ok": False, "error": "telegram_response_too_large"})
                    return
                self.send_response(response.status)
                self.send_header("Content-Type", response.headers.get("Content-Type", "application/json"))
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(body)
        except HTTPError as error:
            body = error.read(256 * 1024)
            self.send_response(error.code)
            self.send_header("Content-Type", error.headers.get("Content-Type", "application/json"))
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        except (URLError, TimeoutError, OSError):
            self.send_json(502, {"ok": False, "error": "telegram_api_unavailable"})

    def serve_file(self, path_values: list[str]) -> None:
        if len(path_values) != 1 or not path_values[0]:
            self.send_json(400, {"ok": False, "error": "file_path_required"})
            return
        try:
            candidate = Path(path_values[0]).resolve(strict=True)
            if not candidate.is_relative_to(FILE_ROOT):
                self.send_json(403, {"ok": False, "error": "file_path_outside_storage"})
                return
            if not candidate.is_file() or candidate.suffix.lower() != ".pdf":
                self.send_json(404, {"ok": False, "error": "pdf_not_found"})
                return
            size = candidate.stat().st_size
            if size <= 0:
                self.send_json(422, {"ok": False, "error": "empty_pdf"})
                return
            if size > MAX_FILE_BYTES:
                self.send_json(413, {"ok": False, "error": "file_too_large"})
                return
            with candidate.open("rb") as file_handle:
                if file_handle.read(5) != b"%PDF-":
                    self.send_json(415, {"ok": False, "error": "invalid_pdf"})
                    return
                file_handle.seek(0)
                self.send_response(200)
                self.send_header("Content-Type", "application/pdf")
                self.send_header("Content-Length", str(size))
                self.send_header("Cache-Control", "no-store")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.end_headers()
                shutil.copyfileobj(file_handle, self.wfile, length=FILE_CHUNK_BYTES)
        except FileNotFoundError:
            self.send_json(404, {"ok": False, "error": "pdf_not_found"})
        except (BrokenPipeError, ConnectionResetError):
            return
        except OSError:
            self.send_json(500, {"ok": False, "error": "file_read_failed"})


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), RelayHandler)
    server.daemon_threads = True
    server.serve_forever()


if __name__ == "__main__":
    main()
