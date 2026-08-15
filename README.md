# ESI Web TV

ESI Web TV is a self-hosted web television platform for École nationale Supérieure d'Informatique. It gives students, teachers, admins, clubs, and public visitors one place to watch recorded videos, join live broadcasts, and manage educational media.

## Features

- Public video library for club content, explanations, and open broadcasts
- Role-based access for guests, students, teachers, and admins
- Student-scoped module content through year groups such as `1CP`, `2CP`, and `1CS`
- Teacher dashboard for uploading MP4 videos and starting browser-based live rooms
- Admin dashboard for creating and deleting users
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

Start the local services:

```bash
docker compose up -d
```

Create a `.env` file:

```bash
DATABASE_URL="postgresql://esitv:esitvpassword@localhost:5433/esitvdb"
NEXTAUTH_SECRET="replace-with-a-long-random-secret"
NEXTAUTH_URL="http://localhost:3000"

LIVEKIT_API_KEY="devkey"
LIVEKIT_API_SECRET="secret"
NEXT_PUBLIC_LIVEKIT_URL="ws://localhost:7880"

MINIO_ENDPOINT="localhost"
MINIO_PORT="9000"
MINIO_USE_SSL="false"
MINIO_ROOT_USER="minioadmin"
MINIO_ROOT_PASSWORD="minioadmin"
MEDIA_SIGNED_URL_TTL_SECONDS="60"
```

Prepare the database and seed demo users:

```bash
npx prisma db push
npx prisma db seed
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Demo Accounts

After running the seed command, these local accounts are available:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@esi.dz` | `admin` |
| Teacher | `teacher@esi.dz` | `teacher` |
| Student | `student@esi.dz` | `student` |

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
npm run build
npm run lint
npx playwright test
npx prisma db seed
```

## Local Services

The included Docker Compose file starts:

| Service | URL / Port |
| --- | --- |
| Next.js | `http://localhost:3000` |
| PostgreSQL | `localhost:5433` |
| MinIO API | `http://localhost:9000` |
| MinIO Console | `http://localhost:9001` |
| LiveKit | `ws://localhost:7880` |

## Video Upload Notes

Uploaded MP4 files are written to a temporary folder, processed with FFmpeg, and stored in a private MinIO bucket. Playback and thumbnails are served through app authorization endpoints that issue short-lived signed URLs. For production, move the processing work to a background queue such as BullMQ, a worker service, or a job runner on the VM.

Make sure FFmpeg is installed on the host that runs the Next.js server:

```bash
ffmpeg -version
```

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
