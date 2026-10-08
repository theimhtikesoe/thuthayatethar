FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    RELAY_PORT=8090 \
    TELEGRAM_FILE_ROOT=/var/lib/telegram-bot-api \
    MAX_FILE_BYTES=167772160

WORKDIR /app
COPY server.py /app/server.py
# The Local Bot API data volume may be owned by its own container UID. This
# read-only, unprivileged container needs read access to those files.
USER 0:0
EXPOSE 8090
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8090/health', timeout=2)"
CMD ["python", "/app/server.py"]
