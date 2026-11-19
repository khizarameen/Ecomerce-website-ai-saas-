FROM python:3.11-slim

ARG INSTALL_CHROMA=false

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    libjpeg62-turbo \
    zlib1g \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /tmp/requirements.txt

RUN if [ "${INSTALL_CHROMA}" = "true" ]; then \
      pip install --upgrade pip && pip install -r /tmp/requirements.txt; \
    else \
      grep -viE '^chromadb' /tmp/requirements.txt > /tmp/requirements-docker.txt && \
      pip install --upgrade pip && pip install -r /tmp/requirements-docker.txt; \
    fi && rm -f /tmp/requirements.txt /tmp/requirements-docker.txt

COPY . /app

RUN sed -i 's/\r$//' /app/docker-entrypoint.sh && \
    chmod +x /app/docker-entrypoint.sh && \
    mkdir -p /app/logs /app/media /app/staticfiles /app/chroma_db

EXPOSE 8000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
