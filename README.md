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
- MP4 processing and thumbnail generation through FFmpeg
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
DOTENV_CONFIG_PATH=.env.local npx prisma db push
```

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
| Student | Can access public content and videos/live rooms for their year group |
| Teacher | Can access teaching content, upload videos, and start live streams |
| Admin | Can manage users and access all content |

## Useful Commands

```bash
npm run dev
npm run worker:media
npm run build
npm run lint
npm run test:unit
npm run test:livekit-smoke
npx playwright test
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

## LiveKit Deployment Notes

Local Compose runs LiveKit from the pinned `livekit/livekit-server:v1.13.4` image digest and mounts `livekit.yaml` for ports and RTC settings. `scripts/start-livekit.sh` writes the LiveKit key file inside the container from `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`; the credential value is never printed in logs. The local browser endpoint is configured by `NEXT_PUBLIC_LIVEKIT_URL`.

Production should expose LiveKit to clients through a TLS endpoint such as `wss://livekit.example.edu` and set `NEXT_PUBLIC_LIVEKIT_URL` to that WSS URL. Put the API/WebSocket port `7880` behind TLS termination, expose the configured WebRTC TCP/UDP ports at the edge, and enable TURN/TLS or TURN/UDP for restrictive networks. Do not run production with `--dev`; update `livekit.yaml` for public IP discovery, firewall rules, and TURN certificates before exposing it outside local development.

Run the LiveKit browser smoke test after the service is healthy:

```bash
npm run test:livekit-smoke
```

## Video Upload Notes

Uploaded MP4 files use server-created multipart upload sessions. The browser uploads chunks directly to private MinIO staging with short-lived signed URLs, then the app finalizes the object and enqueues durable BullMQ media processing in Redis. A standalone media worker downloads staging objects, validates them with FFprobe, runs FFmpeg, publishes ready renditions, and updates video lifecycle state.

Only `READY` videos appear in public and scoped library listings. Owners and admins can open processing or failed uploads directly and retry failed processing from the video page.

The MinIO API endpoint must be reachable from the browser and allow CORS requests from the Next.js origin for `PUT`, `POST`, `DELETE`, `GET`, and `HEAD`. Expose the `ETag` header if you add client-side part verification.

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

## Secret Management

Do not commit concrete `.env`, `.env.local`, or production environment files. Keep `.env.local.example` for local shape and `.env.production.example` for deployment shape only.

For production, store `DATABASE_URL`, `AUTH_SECRET`, LiveKit credentials, MinIO application credentials, Redis credentials, and bootstrap values in the deployment secret manager. Rotate all currently deployed sample credentials before exposing the system. If any credential is disclosed, rotate the affected secret, increment impacted user session versions when identity credentials are involved, and restart the app and media worker so validated configuration is reloaded.

## Testing

Run the full browser test suite:

```bash
npx playwright test
```

The tests cover:

- Teacher login and dashboard access
- Student restriction from upload pages
- Teacher video upload flow
- Teacher live stream creation flow

## Repository

Recommended repository name:

```text
esi-web-tv
```

Recommended repository description:

```text
Self-hosted ESI Web TV platform for live classes, educational videos, club content, and role-based media access.
```
