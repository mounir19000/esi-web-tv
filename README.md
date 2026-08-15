# ESI Web TV

ESI Web TV is a self-hosted web television platform for École nationale Supérieure d'Informatique. It gives students, teachers, admins, clubs, and public visitors one place to watch recorded videos, join live broadcasts, and manage educational media.

## Features

- Public video library for club content, explanations, and open broadcasts
- Role-based access for guests, students, teachers, and admins
- Student-scoped module content through year groups such as `1CP`, `2CP`, and `1CS`
- Teacher dashboard for uploading MP4 videos and starting browser-based live rooms
- Admin dashboard for creating, changing, and disabling users
- Live streaming rooms powered by LiveKit
- Video storage through MinIO
- Source-aware HLS transcoding, thumbnail generation, and WebVTT caption playback through FFmpeg
- PostgreSQL database with Prisma ORM
- End-to-end Playwright tests for auth, upload, and live flows

## Tech Stack

- Next.js 16 App Router
- React 19
- NextAuth.js v5
- Prisma 7
- PostgreSQL
- MinIO
- LiveKit
- FFmpeg
- Playwright

## Getting Started

Install dependencies:

```bash
npm install
```

Create an explicit local environment file and edit the placeholder values:

```bash
cp .env.local.example .env.local
```

Generate strong local values with `openssl rand -base64 32`. Runtime config is validated at startup; production mode fails if required variables are missing, point at localhost, or use known sample values.

Start the local services:

```bash
docker compose --env-file .env.local up -d
```

Prepare the database:

```bash
DOTENV_CONFIG_PATH=.env.local npx prisma migrate deploy
```

For an existing database that predates Prisma migrations, follow
[Database Migrations And Retention](docs/database-migrations.md) before running
deployments.

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Admin Bootstrap And Demo Accounts

Production admins should be created with the one-time bootstrap command:

```bash
DOTENV_CONFIG_PATH=.env.local BOOTSTRAP_ADMIN_EMAIL="admin@esi.dz" npm run bootstrap:admin
```

If `BOOTSTRAP_ADMIN_PASSWORD` is unset, the command prints one generated password once. The command refuses to run after an active admin already exists.

Local/test demo users are optional and gated by `APP_ENV=local` or `APP_ENV=test` plus `ALLOW_DEMO_SEED=true`:

```bash
DOTENV_CONFIG_PATH=.env.local npx prisma db seed
```

The seed script no longer contains fixed demo passwords. It reads `DEMO_ADMIN_PASSWORD`, `DEMO_TEACHER_PASSWORD`, and `DEMO_STUDENT_PASSWORD` when provided, or generates and prints local/test passwords during the seed run.

Only `@esi.dz` email addresses are accepted.

## User Roles

| Role | Access |
| --- | --- |
| Guest | Can browse public videos and public live streams |
| Student | Can access public content, ESI-wide private content, and assigned cohort/module content |
| Teacher | Can access public and ESI-wide content, upload videos, start live streams, and publish to assigned modules |
| Admin | Can manage users and access all content |

Detailed audience semantics are documented in [Audience Policies](docs/audience-policies.md).
Validation, rate limits, and lifecycle controls are documented in [Validation And Management Workflows](docs/management-workflows.md).

## Useful Commands

```bash
npm run dev
npm run worker:media
npm run build
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e
npm run audit
npm run test:livekit-smoke
npm run reconcile:livekit
DOTENV_CONFIG_PATH=.env.local npx prisma migrate deploy
DOTENV_CONFIG_PATH=.env.local npx prisma db seed
DOTENV_CONFIG_PATH=.env.local npm run bootstrap:admin
```

## Local Services

The included Docker Compose file starts:

| Service | URL / Port |
| --- | --- |
| Next.js | `http://localhost:3000` |
| PostgreSQL | `localhost:5433` |
| MinIO API | `http://localhost:9000` |
| MinIO Console | `http://localhost:9001` |
| Redis | `localhost:6379` |
| Media worker | `npm run worker:media` |
| LiveKit | `ws://localhost:7880` |
| LiveKit Egress | Docker Compose worker |

## LiveKit Deployment Notes

Local Compose runs LiveKit from the pinned `livekit/livekit-server:v1.13.4` image digest and mounts `livekit.yaml` for ports and RTC settings. `scripts/start-livekit.sh` writes the LiveKit key file inside the container from `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`; the credential value is never printed in logs. When `LIVEKIT_WEBHOOK_URL` is set, the script appends a signed webhook target to the runtime config. The local browser endpoint is configured by `NEXT_PUBLIC_LIVEKIT_URL`.

Production should expose LiveKit to clients through a TLS endpoint such as `wss://livekit.example.edu` and set `NEXT_PUBLIC_LIVEKIT_URL` to that WSS URL. Put the API/WebSocket port `7880` behind TLS termination, expose the configured WebRTC TCP/UDP ports at the edge, and enable TURN/TLS or TURN/UDP for restrictive networks. Do not run production with `--dev`; update `livekit.yaml` for public IP discovery, firewall rules, and TURN certificates before exposing it outside local development.

Live streams are created as `STARTING` and become `LIVE` only after a signed LiveKit webhook confirms an active publishing host participant. The webhook endpoint is `/api/livekit/webhook`; it validates LiveKit's raw signed body before applying room, participant, and Egress events. Schedule reconciliation to repair missed webhooks and stale rooms:

```bash
DOTENV_CONFIG_PATH=.env.local npm run reconcile:livekit
```

Recording is enabled by `LIVEKIT_RECORDING_ENABLED=true`. Compose starts a pinned `livekit/egress:v1.9.1` worker with Redis and private MinIO application credentials in `EGRESS_CONFIG_BODY`; room-composite output is written under `recordings/`. Hosts can download, discard, retry, or publish finished recordings from the live room page. Publishing creates a normal queued `Video` that the media worker transcodes into protected playback assets.

Run the LiveKit browser smoke test after the service is healthy:

```bash
npm run test:livekit-smoke
```

## Video Upload Notes

Uploaded MP4 files use server-created multipart upload sessions. Creators select an explicit `PUBLIC`, `ESI`, or `MODULE` audience before upload. The browser uploads chunks directly to private MinIO staging with short-lived signed URLs, then the app finalizes the object and enqueues durable BullMQ media processing in Redis. A standalone media worker downloads staging objects, probes and validates them with FFprobe, runs bounded FFmpeg jobs, publishes adaptive HLS renditions, and updates video lifecycle state.

The worker stores source metadata on `Video`, keeps the private source object as a tracked `SOURCE` media asset, and records every generated manifest, variant playlist, segment, thumbnail, and caption in `MediaAsset` or `VideoVariant`. The HLS ladder is generated only up to the source height, so low-resolution uploads are not upscaled. Aspect ratio is preserved with scale-only renditions; the player consumes the master manifest through authorized app routes.

Thumbnail state is tracked separately from video readiness. A video can still become `READY` if thumbnail extraction fails, and owners/admins can retry processing from the saved source. Owners/admins can attach WebVTT caption files from the video page with language, label, and default-track metadata.

Only `READY` videos appear in public and scoped library listings. Owners and admins can open processing or failed uploads directly and retry failed processing from the video page.

The MinIO API endpoint must be reachable from the browser and allow CORS requests from the Next.js origin for direct-upload `PUT`, `POST`, `DELETE`, `GET`, and `HEAD`. HLS manifests, HLS segments, and captions are served through protected app routes after authorization; large source fallbacks and thumbnails use short-lived signed redirects. Expose the `ETag` header if you add client-side part verification.

The application and media worker use `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY`, not root credentials. Local Compose provisions a limited MinIO user through `scripts/init-minio.sh` and `config/minio/app-policy.json`; production should provision an equivalent service account out of band and rotate it separately from the root/admin account.

Run the media worker next to Redis, PostgreSQL, and MinIO while testing uploads locally:

```bash
npm run worker:media
```

Make sure FFmpeg and FFprobe are installed on the host that runs the media worker:

```bash
ffmpeg -version
ffprobe -version
```

Tune `MEDIA_MAX_DURATION_SECONDS`, `MEDIA_MAX_FRAME_PIXELS`, `MEDIA_FFMPEG_TIMEOUT_SECONDS`, `MEDIA_FFMPEG_THREADS`, and `MEDIA_HLS_SEGMENT_SECONDS` for the worker host. These limits bound source complexity, FFmpeg execution time, CPU thread use, and segment duration.

## Secret Management

Do not commit concrete `.env`, `.env.local`, or production environment files. Keep `.env.local.example` for local shape and `.env.production.example` for deployment shape only.

For production, store `DATABASE_URL`, `AUTH_SECRET`, LiveKit credentials, MinIO application credentials, Redis credentials, and bootstrap values in the deployment secret manager. Rotate all currently deployed sample credentials before exposing the system. If any credential is disclosed, rotate the affected secret, increment impacted user session versions when identity credentials are involved, and restart the app and media worker so validated configuration is reloaded.

## Testing

Run the quick local suites:

```bash
npm run typecheck
npm run test
```

Run the full browser test suite:

```bash
npm run test:e2e
```

The Playwright suite creates a disposable `esitv_e2e_*` database, a disposable `esitv-e2e-*` MinIO bucket, applies migrations, seeds deterministic modules, and removes those resources in teardown. It uses port `3100` by default so it cannot accidentally reuse a developer server on `3000`.

The tests cover:

- Teacher login, dashboard access, and student restrictions
- Upload API authorization and validation failures
- Browser upload through a real multipart object, backend processing to `READY`, generated HLS/thumbnail assets, and protected media authorization
- Live stream creation backed by a LiveKit room and token
- Session revocation and already-open-tab denial paths

## Repository

Recommended repository name:

```text
esi-web-tv
```

Recommended repository description:

```text
Self-hosted ESI Web TV platform for live classes, educational videos, club content, and role-based media access.
```
