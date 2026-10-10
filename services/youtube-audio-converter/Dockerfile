FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install --no-cache-dir --break-system-packages --upgrade "yt-dlp[default]"

WORKDIR /app
COPY server.py /app/server.py
RUN useradd --create-home --uid 10001 converter \
    && mkdir -p /var/lib/youtube-converter \
    && chown -R converter:converter /app /var/lib/youtube-converter
USER converter
ENV PYTHONUNBUFFERED=1 PORT=8787 WORK_DIR=/var/lib/youtube-converter
EXPOSE 8787
CMD ["python3", "/app/server.py"]
