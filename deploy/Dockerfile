# MD Slide Studio · WorkBuddy & Container Deployment (Server Mode)
# Build from repository root:
#   docker build -t md-slide-studio -f deploy/Dockerfile .
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    MD_STUDIO_DATA_DIR=/data

WORKDIR /app

COPY pyproject.toml README.md THIRD_PARTY_NOTICES.md ./
COPY src ./src
COPY demo/showcase.md ./demo/showcase.md

RUN pip install --no-cache-dir . \
 && useradd --create-home --shell /usr/sbin/nologin mdstudio \
 && mkdir -p /data \
 && chown -R mdstudio:mdstudio /data /app

USER mdstudio
VOLUME ["/data"]
EXPOSE 9000

CMD ["md-slide-studio", "serve", "--host", "0.0.0.0", "--port", "9000", "--no-browser"]
