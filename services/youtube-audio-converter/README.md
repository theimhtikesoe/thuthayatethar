# YouTube audio converter

This service accepts authorized YouTube watch URLs, downloads audio with `yt-dlp`, converts it to MP3 with FFmpeg, and posts the audio bytes back to the thuthayatethar Worker. It uses a persistent SQLite queue so jobs survive container restarts.

The service must only be used for content the site operator is authorized to download and publish. The Worker remains the source of truth for catalog publication and R2 storage.

## Endpoints

- `GET /health` — liveness and queue depth
- `POST /jobs` — enqueue `{ "intakeId": "...", "sourceUrl": "https://www.youtube.com/watch?v=...", "title": "..." }` with `X-Converter-Secret`
- `GET /jobs/{id}` — inspect an authorized job

The converter calls the Worker callback with `X-Converter-Secret` and `X-Intake-Id`. Successful callbacks are `audio/mpeg` bodies; failed callbacks are JSON.
