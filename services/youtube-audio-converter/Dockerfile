FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir --upgrade yt-dlp

WORKDIR /app
COPY server.py /app/server.py
RUN useradd --create-home --uid 10001 converter \
    && mkdir -p /var/lib/youtube-converter \
    && chown -R converter:converter /app /var/lib/youtube-converter
USER converter
ENV PYTHONUNBUFFERED=1 PORT=8787 WORK_DIR=/var/lib/youtube-converter
EXPOSE 8787
CMD ["python", "/app/server.py"]
