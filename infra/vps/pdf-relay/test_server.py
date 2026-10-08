import json
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parent))
import server


EXPECTED_URL = "https://thuthayatethar-telegram-ingestion.hlah3894.workers.dev/telegram/webhook"


class FakeBotApiHandler(BaseHTTPRequestHandler):
    calls = []

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        type(self).calls.append((self.path, json.loads(body)))
        response = b'{"ok":true,"result":true,"description":"Webhook was set"}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response)

    def log_message(self, _format, *_args):
        return


class RelayWebhookTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        FakeBotApiHandler.calls = []
        cls.api = ThreadingHTTPServer(("127.0.0.1", 0), FakeBotApiHandler)
        cls.api_thread = threading.Thread(target=cls.api.serve_forever, daemon=True)
        cls.api_thread.start()
        cls.relay = ThreadingHTTPServer(("127.0.0.1", 0), server.RelayHandler)
        cls.relay_thread = threading.Thread(target=cls.relay.serve_forever, daemon=True)
        cls.relay_thread.start()
        cls.old_api = server.LOCAL_API
        cls.old_expected_url = server.EXPECTED_WEBHOOK_URL
        server.LOCAL_API = f"http://127.0.0.1:{cls.api.server_port}"
        server.EXPECTED_WEBHOOK_URL = EXPECTED_URL
        cls.url = f"http://127.0.0.1:{cls.relay.server_port}"

    @classmethod
    def tearDownClass(cls):
        server.LOCAL_API = cls.old_api
        server.EXPECTED_WEBHOOK_URL = cls.old_expected_url
        cls.relay.shutdown()
        cls.api.shutdown()

    def post(self, payload):
        request = Request(
            f"{self.url}/bot123456:FAKE/setWebhook",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=5) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            return error.code, json.load(error)

    def test_valid_worker_webhook_is_forwarded_without_logging_secrets(self):
        status, body = self.post({
            "url": EXPECTED_URL,
            "secret_token": "test_secret_123",
            "allowed_updates": ["message", "edited_message"],
            "drop_pending_updates": False,
        })
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])
        self.assertEqual(len(FakeBotApiHandler.calls), 1)
        path, forwarded = FakeBotApiHandler.calls[-1]
        self.assertEqual(path, "/bot123456:FAKE/setWebhook")
        self.assertEqual(forwarded["url"], EXPECTED_URL)
        self.assertEqual(forwarded["secret_token"], "test_secret_123")
        self.assertFalse(forwarded["drop_pending_updates"])

    def test_rejects_other_webhook_url_without_forwarding(self):
        before = len(FakeBotApiHandler.calls)
        status, body = self.post({
            "url": "https://attacker.example/hook",
            "secret_token": "test_secret_123",
            "allowed_updates": ["message", "edited_message"],
        })
        self.assertEqual(status, 400)
        self.assertEqual(body["error"], "unexpected_webhook_url")
        self.assertEqual(len(FakeBotApiHandler.calls), before)

    def test_rejects_dropping_pending_updates(self):
        before = len(FakeBotApiHandler.calls)
        status, body = self.post({
            "url": EXPECTED_URL,
            "secret_token": "test_secret_123",
            "allowed_updates": ["message", "edited_message"],
            "drop_pending_updates": True,
        })
        self.assertEqual(status, 400)
        self.assertEqual(body["error"], "cannot_drop_pending_updates")
        self.assertEqual(len(FakeBotApiHandler.calls), before)

    def test_rejects_invalid_webhook_secret(self):
        before = len(FakeBotApiHandler.calls)
        status, body = self.post({
            "url": EXPECTED_URL,
            "secret_token": "contains:invalid:characters",
            "allowed_updates": ["message", "edited_message"],
        })
        self.assertEqual(status, 400)
        self.assertEqual(body["error"], "invalid_webhook_secret")
        self.assertEqual(len(FakeBotApiHandler.calls), before)


if __name__ == "__main__":
    unittest.main(verbosity=2)
