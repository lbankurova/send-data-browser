# Stage 1: Build React frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY shared/ ../shared/
COPY frontend/ ./
RUN npm run build

# Stage 2: Python backend + built frontend + data
FROM python:3.12-slim
WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY shared/ /shared/
COPY --from=frontend-build /app/frontend/dist ./static/
COPY send/PointCross/PC201708_XPT/ /app/data/PointCross/

ENV SEND_DATA_DIR=/app/data
ENV SHARED_DIR=/shared
ENV OPENBLAS_NUM_THREADS=1

# Verify shared data files exist (fail build if missing)
RUN echo "=== Shared files check ===" && \
    ls /shared/syndrome-definitions.json && \
    ls /shared/progression-chains.yaml && \
    ls /shared/rules/field-consensus-thresholds.json && \
    ls /shared/hcd-reference-ranges.json && \
    ls /shared/adversity-dictionary.json && \
    echo "All shared files present."

# Verify data is present; regenerate if generated/ is missing or empty
RUN echo "=== Build-time data check ===" && \
    echo "XPT files:" && ls /app/data/PointCross/*.xpt | head -5 && \
    echo "Generated files:" && ls /app/generated/PointCross/*.json 2>/dev/null | head -5 || true && \
    if [ ! -f /app/generated/PointCross/unified_findings.json ]; then \
      echo "Generated data missing — running generator..." && \
      cd /app && python -m generator.generate PointCross && \
      echo "Generator complete:" && ls /app/generated/PointCross/*.json | wc -l; \
    else \
      echo "Generated data present — skipping generator."; \
    fi

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1
