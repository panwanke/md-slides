# Self-hosted deck library (mode B).
# Build from the repository root:
#   docker build -t jc-slide-studio deploy/cloudrun
# Persist /data for SQLite or /data/assets when using CloudBase PostgreSQL.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    JC_STUDIO_DATA_DIR=/data

WORKDIR /app

COPY pyproject.toml ./
COPY README.md ./
COPY THIRD_PARTY_NOTICES.md ./
COPY src ./src

RUN pip install --no-cache-dir . \
 && useradd --create-home --shell /usr/sbin/nologin jcstudio \
 && mkdir -p /data \
 && chown jcstudio:jcstudio /data

USER jcstudio
VOLUME ["/data"]
EXPOSE 9000

CMD ["jc-slide-studio", "serve", "--host", "0.0.0.0", "--port", "9000", "--no-browser"]
