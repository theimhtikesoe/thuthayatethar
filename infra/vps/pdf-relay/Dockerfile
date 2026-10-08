FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    RELAY_PORT=8090 \
    TELEGRAM_FILE_ROOT=/var/lib/telegram-bot-api \
    MAX_FILE_BYTES=167772160

WORKDIR /app
COPY server.py /app/server.py
RUN useradd --system --no-create-home --uid 10001 relay
USER 10001:10001
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8090/health', timeout=2)"
CMD ["python", "/app/server.py"]
