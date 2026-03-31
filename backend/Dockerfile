FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install only base dependencies (no ML/torch) — API doesn't run classifiers
COPY backend/requirements-base.txt .
RUN pip install --no-cache-dir -r requirements-base.txt

COPY backend/app/ ./app/

ENV PORT=8000
EXPOSE ${PORT}

# Single worker is sufficient for typical load and saves ~50% RAM
CMD gunicorn app.main:app --workers 1 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:${PORT}
