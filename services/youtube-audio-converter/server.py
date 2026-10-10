from __future__ import annotations

import json
import os
import queue
import re
import sqlite3
import subprocess
import threading
import time
import urllib.error
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

PORT = int(os.getenv("PORT", "8787"))
SECRET = os.environ["CONVERTER_SECRET"]
CALLBACK_URL = os.environ["WORKER_CALLBACK_URL"].rstrip("/")
WORK_DIR = Path(os.getenv("WORK_DIR", "/var/lib/youtube-converter"))
DOWNLOAD_DIR = WORK_DIR / "downloads"
DB_PATH = WORK_DIR / "jobs.sqlite3"
MAX_BYTES = int(os.getenv("MAX_AUDIO_BYTES", str(100 * 1024 * 1024)))
YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}
JOB_QUEUE: queue.Queue[str] = queue.Queue()


def now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with db() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY, intake_id TEXT NOT NULL UNIQUE, source_url TEXT NOT NULL,
            title TEXT, status TEXT NOT NULL, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        )""")
        rows = conn.execute("SELECT id FROM jobs WHERE status = 'running'").fetchall()
        for row in rows:
            conn.execute("UPDATE jobs SET status='queued', updated_at=? WHERE id=?", (now(), row["id"]))
            JOB_QUEUE.put(row["id"])
        for row in conn.execute("SELECT id FROM jobs WHERE status='queued' ORDER BY created_at").fetchall():
            JOB_QUEUE.put(row["id"])


def valid_youtube_url(value: str) -> bool:
    try:
        parsed = urlparse(value)
        host = (parsed.hostname or "").lower().removeprefix("www.")
        return parsed.scheme == "https" and host in YOUTUBE_HOSTS and bool(parsed.path or parsed.query)
    except Exception:
        return False


def callback(intake_id: str, status: str, audio: bytes | None = None, error: str | None = None) -> None:
    if status == "completed" and audio is not None:
        request = urllib.request.Request(
            f"{CALLBACK_URL}/internal/youtube-audio-callback",
            data=audio,
            method="POST",
            headers={"X-Converter-Secret": SECRET, "X-Intake-Id": intake_id, "Content-Type": "audio/mpeg", "Content-Length": str(len(audio))},
        )
    else:
        payload = json.dumps({"status": status, "error": error or "conversion_failed"}).encode()
        request = urllib.request.Request(
            f"{CALLBACK_URL}/internal/youtube-audio-callback",
            data=payload,
            method="POST",
            headers={"X-Converter-Secret": SECRET, "X-Intake-Id": intake_id, "Content-Type": "application/json"},
        )
    with urllib.request.urlopen(request, timeout=60) as response:
        if response.status >= 300:
            raise RuntimeError(f"callback_http_{response.status}")


def set_job(job_id: str, status: str, error: str | None = None) -> None:
    with db() as conn:
        conn.execute("UPDATE jobs SET status=?, error=?, updated_at=? WHERE id=?", (status, error, now(), job_id))


def process(job_id: str) -> None:
    with db() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
    if not row:
        return
    set_job(job_id, "running")
    output = DOWNLOAD_DIR / f"{job_id}.mp3"
    try:
        command = ["yt-dlp", "--no-playlist", "--restrict-filenames", "--extract-audio", "--audio-format", "mp3", "--audio-quality", "128K", "--max-filesize", str(MAX_BYTES), "--output", str(DOWNLOAD_DIR / f"{job_id}.%(ext)s"), row["source_url"]]
        result = subprocess.run(command, capture_output=True, text=True, timeout=4 * 60 * 60)
        if result.returncode != 0 or not output.exists():
            raise RuntimeError((result.stderr or result.stdout or "yt_dlp_failed")[-1000:])
        data = output.read_bytes()
        if not data or len(data) > MAX_BYTES:
            raise RuntimeError("audio_size_limit_exceeded")
        callback(row["intake_id"], "completed", data)
        set_job(job_id, "completed")
    except Exception as exc:
        message = str(exc)[:1000]
        set_job(job_id, "failed", message)
        try:
            callback(row["intake_id"], "failed", error=message)
        except Exception:
            pass
    finally:
        for path in DOWNLOAD_DIR.glob(f"{job_id}.*"):
            try:
                path.unlink()
            except OSError:
                pass


def worker() -> None:
    while True:
        job_id = JOB_QUEUE.get()
        try:
            process(job_id)
        finally:
            JOB_QUEUE.task_done()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: object) -> None:
        print(f"{self.address_string()} {fmt % args}", flush=True)

    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def authorized(self) -> bool:
        return self.headers.get("X-Converter-Secret") == SECRET

    def do_GET(self) -> None:
        if self.path == "/health":
            self.send_json(200, {"ok": True, "service": "youtube-audio-converter", "queue": JOB_QUEUE.qsize()})
            return
        if self.path.startswith("/jobs/") and self.authorized():
            job_id = self.path.rsplit("/", 1)[-1]
            with db() as conn:
                row = conn.execute("SELECT id,intake_id,status,error,created_at,updated_at FROM jobs WHERE id=?", (job_id,)).fetchone()
            self.send_json(200 if row else 404, dict(row) if row else {"ok": False, "error": "job_not_found"})
            return
        self.send_json(404, {"ok": False, "error": "not_found"})

    def do_POST(self) -> None:
        if self.path != "/jobs" or not self.authorized():
            self.send_json(401, {"ok": False, "error": "unauthorized"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length))
            intake_id = str(payload["intakeId"])
            source_url = str(payload["sourceUrl"])
            title = str(payload.get("title") or "")[:180]
            if not re.fullmatch(r"[A-Za-z0-9_-]{8,80}", intake_id) or not valid_youtube_url(source_url):
                raise ValueError("invalid_youtube_job")
        except Exception as exc:
            self.send_json(400, {"ok": False, "error": str(exc)})
            return
        job_id = str(uuid.uuid4())
        created = False
        with db() as conn:
            try:
                conn.execute("INSERT INTO jobs(id,intake_id,source_url,title,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)", (job_id, intake_id, source_url, title, "queued", now(), now()))
                created = True
            except sqlite3.IntegrityError:
                row = conn.execute("SELECT id,status FROM jobs WHERE intake_id=?", (intake_id,)).fetchone()
                job_id = row["id"]
        if created:
            JOB_QUEUE.put(job_id)
        self.send_json(202, {"ok": True, "jobId": job_id, "status": "queued"})


if __name__ == "__main__":
    init_db()
    threading.Thread(target=worker, daemon=True, name="converter-worker").start()
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
