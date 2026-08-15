# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder
WORKDIR /app

COPY . .

ENV APP_ENV=local \
  ALLOW_DEMO_SEED=false \
  DATABASE_URL=postgresql://build_user:build_password@localhost:5432/builddb?schema=public \
  AUTH_SECRET=build-time-auth-secret-with-32-characters \
  NEXTAUTH_URL=http://localhost:3000 \
  LIVEKIT_API_KEY=build-livekit-key \
  LIVEKIT_API_SECRET=build-livekit-secret-with-32-characters \
  NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880 \
  LIVEKIT_TOKEN_TTL_SECONDS=600 \
  LIVEKIT_ANONYMOUS_TOKEN_TTL_SECONDS=120 \
  LIVEKIT_ROOM_EMPTY_TIMEOUT_SECONDS=600 \
  LIVEKIT_ROOM_DEPARTURE_TIMEOUT_SECONDS=60 \
  LIVEKIT_MAX_PARTICIPANTS=100 \
  LIVEKIT_PUBLIC_MAX_PARTICIPANTS=50 \
  LIVEKIT_RECORDING_ENABLED=false \
  MINIO_ENDPOINT=localhost \
  MINIO_PORT=9000 \
  MINIO_USE_SSL=false \
  MINIO_ACCESS_KEY=build-minio-access \
  MINIO_SECRET_KEY=build-minio-secret \
  MINIO_VIDEO_BUCKET=esitv-videos \
  REDIS_URL=redis://localhost:6379 \
  MEDIA_WORKER_VERSION=build-image \
  MEDIA_WORKER_CONCURRENCY=1 \
  MEDIA_MAX_DURATION_SECONDS=14400 \
  MEDIA_MAX_FRAME_PIXELS=8294400 \
  MEDIA_FFMPEG_TIMEOUT_SECONDS=3600 \
  MEDIA_FFMPEG_THREADS=2 \
  MEDIA_HLS_SEGMENT_SECONDS=6

RUN npx prisma generate && npm run build

FROM ${NODE_IMAGE} AS runner
WORKDIR /app

ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  PORT=3000 \
  HOSTNAME=0.0.0.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates dumb-init \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
