# Stage 1: Build React frontend
FROM node:20-alpine AS frontend-build
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Python backend + built frontend + data
FROM python:3.12-slim
WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=frontend-build /app/frontend/dist ./static/
COPY send/PointCross/ /app/data/PointCross/

ENV SEND_DATA_DIR=/app/data

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
