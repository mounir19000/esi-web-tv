# Production Operations

This runbook covers the production Compose stack in `compose.prod.yml`. It is intended for a single VM or small host cluster where Docker Compose manages the app, worker, database, Redis, MinIO, LiveKit, Egress, Caddy, and optional Prometheus.

## Deployment Shape

Only these host ports should be public:

| Purpose | Port |
| --- | --- |
| HTTP redirect / ACME | `80/tcp` |
| HTTPS, WSS, S3 API through Caddy | `443/tcp`, `443/udp` |
| LiveKit RTC TCP mux | `7881/tcp` |
| LiveKit RTC UDP mux | `7882/udp` |
| TURN/TLS | `5349/tcp` |
| TURN/UDP | `3478/udp` |

PostgreSQL, Redis, MinIO API, MinIO console, the app container, Prometheus, and LiveKit API port `7880` stay on Docker's private `internal` network. Browser traffic for the web app, LiveKit WSS, and direct-upload S3 URLs goes through Caddy TLS virtual hosts.

## First Deploy

1. Point DNS records at the host:
   - `APP_DOMAIN` -> web app
   - `LIVEKIT_DOMAIN` -> LiveKit WSS
   - `S3_DOMAIN` -> MinIO S3 API
   - `TURN_DOMAIN` -> TURN endpoint
2. Create `.env.production` from `.env.production.example` and replace every placeholder secret.
   Confirm these public origins before starting:
   - `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` are `https://$APP_DOMAIN`
   - `NEXT_PUBLIC_MEDIA_URL` is `https://$S3_DOMAIN`
   - `NEXT_PUBLIC_LIVEKIT_URL` is `wss://$LIVEKIT_DOMAIN`
3. Build the app and worker images:

```bash
docker compose --env-file .env.production -f compose.prod.yml build app media-worker
```

4. Start dependencies and the app:

```bash
docker compose --env-file .env.production -f compose.prod.yml up -d
```

5. Apply migrations:

```bash
docker compose --env-file .env.production -f compose.prod.yml --profile maintenance run --rm migrate
```

6. Bootstrap the first admin, once:

```bash
docker compose --env-file .env.production -f compose.prod.yml --profile maintenance run --rm bootstrap-admin
```

7. Confirm health:

```bash
docker compose --env-file .env.production -f compose.prod.yml ps
curl -fsS "https://$APP_DOMAIN/api/health"
curl -fsS "https://$APP_DOMAIN/api/ready"
```

Run a host scan from outside the VM and confirm only the public ports listed above are reachable.

## Monitoring And Alerts

Start Prometheus when you want local scraping:

```bash
docker compose --env-file .env.production -f compose.prod.yml --profile monitoring up -d prometheus
```

Prometheus scrapes `app:3000/api/metrics` on the private network. Caddy returns `404` for public `/api/metrics` requests on the app domain.

Metrics include dependency readiness, queue job counts, failed/processing videos, active live streams, tracked media bytes, and tracked media asset count. Alert rules live in `config/prometheus/alerts.yml` and cover dependency outages, queue backlog, media failures, and worker stalls.

## Backup

Run database and object backups from the host:

```bash
ENV_FILE=.env.production ./scripts/backup-postgres.sh
ENV_FILE=.env.production ./scripts/backup-minio.sh
```

Set `BACKUP_ENCRYPTION_PASSPHRASE` to encrypt backup artifacts with AES-256-CBC/PBKDF2. Set `BACKUP_REMOTE_RSYNC_TARGET` to copy each artifact off-host after it is written.

Keep at least:

- hourly backups for 24 hours
- daily backups for 14 days
- weekly backups for 8 weeks

Store at least one copy outside the VM or storage account that hosts production MinIO.

## Restore Test

Restore into staging first:

```bash
CONFIRM_RESTORE=yes ENV_FILE=.env.production ./scripts/restore-postgres.sh backups/postgres/postgres-YYYYMMDDTHHMMSSZ.dump.gz
CONFIRM_RESTORE=yes ENV_FILE=.env.production ./scripts/restore-minio.sh backups/minio/minio-YYYYMMDDTHHMMSSZ.tar.gz
```

After restore:

1. Run `docker compose --env-file .env.production -f compose.prod.yml --profile maintenance run --rm migrate`.
2. Open `/api/ready`.
3. Sign in as an admin.
4. Play a restored video.
5. Start a short live stream and request a token.
6. Upload a small MP4 and verify the worker publishes HLS output.

Record the restore duration and any manual repair steps. A backup is not accepted until this staging restore passes.

## Failure Drills

Run these drills before exposing a new production environment:

- Stop Redis and confirm `/api/ready` reports failure and queue alerts fire.
- Stop MinIO and confirm uploads fail closed while readiness fails.
- Stop the media worker and confirm queue backlog/worker stall alerts fire.
- Stop LiveKit and confirm live token requests fail without affecting video playback.
- Fill a test MinIO bucket or disk quota and confirm storage alerts/firewall procedures are followed.

## Rolling Updates And Rollback

Use immutable `IMAGE_TAG` values, preferably the merge commit SHA.

Deploy:

```bash
IMAGE_TAG=<new-sha> docker compose --env-file .env.production -f compose.prod.yml build app media-worker
IMAGE_TAG=<new-sha> docker compose --env-file .env.production -f compose.prod.yml up -d app media-worker
IMAGE_TAG=<new-sha> docker compose --env-file .env.production -f compose.prod.yml --profile maintenance run --rm migrate
```

For rollback, set `IMAGE_TAG` to the previous known-good tag and run `up -d app media-worker`. Do not delete Redis or database volumes during rollback; queued jobs must remain durable. If a migration is not backward-compatible, restore staging first and use the database rollback plan documented with that release.
