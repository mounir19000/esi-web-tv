# Database Migrations And Retention

This project uses reviewed Prisma migrations for schema changes. Do not use
`prisma db push` against shared, staging, or production databases.

## Fresh Database

Apply all committed migrations:

```bash
DOTENV_CONFIG_PATH=.env.local npx prisma migrate deploy
```

Then seed local/test data only when explicitly enabled:

```bash
DOTENV_CONFIG_PATH=.env.local npx prisma db seed
```

## Existing Database Baseline

Before baselining an existing database:

1. Create and verify a PostgreSQL backup.
2. Create and verify a MinIO backup or bucket mirror.
3. Compare the live schema with the baseline migration and the remediation
   migrations already present in the database.
4. Record relation counts for `Module`, `Video`, `LiveStream`, and
   `UploadSession`.

PostgreSQL backup example:

```bash
pg_dump --format=custom --dbname "$DATABASE_URL" --file "backups/postgres-$(date +%Y%m%d%H%M%S).dump"
pg_restore --list "backups/postgres-YYYYMMDDHHMMSS.dump" >/dev/null
```

MinIO backup example using `mc`:

```bash
mc alias set esitv "$MINIO_ENDPOINT" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"
mc mirror "esitv/$MINIO_VIDEO_BUCKET" "backups/minio-$MINIO_VIDEO_BUCKET-$(date +%Y%m%d%H%M%S)"
```

If the database already contains only the original pre-remediation schema,
mark the baseline migration as applied and let Prisma apply the remaining
migrations:

```bash
DOTENV_CONFIG_PATH=.env.local npx prisma migrate resolve --applied 20260815000000_baseline_schema
DOTENV_CONFIG_PATH=.env.local npx prisma migrate deploy
```

If a database was previously updated with `db push` or manual SQL and already
contains the changes from the P0 remediation migrations, mark each matching
migration as applied after schema review:

```bash
DOTENV_CONFIG_PATH=.env.local npx prisma migrate resolve --applied 20260815000000_baseline_schema
DOTENV_CONFIG_PATH=.env.local npx prisma migrate resolve --applied 20260815154000_add_upload_sessions
DOTENV_CONFIG_PATH=.env.local npx prisma migrate resolve --applied 20260815161000_add_video_processing_state
DOTENV_CONFIG_PATH=.env.local npx prisma migrate resolve --applied 20260815172000_add_session_revocation
DOTENV_CONFIG_PATH=.env.local npx prisma migrate deploy
```

Do not mark a migration as applied unless the target database already contains
the same schema changes.

## Module Deduplication

Migration `20260815190000_module_integrity_indexes` selects one canonical
module for each exact `name` and `yearGroup`, repoints videos, live streams,
and upload sessions to that row, removes duplicate module rows, and then adds
the database unique constraint.

Verify the result:

```sql
SELECT name, "yearGroup", count(*)
FROM "Module"
GROUP BY name, "yearGroup"
HAVING count(*) > 1;
```

The query must return zero rows.

## User Retention

User-owned institutional content is retained by default:

- `Video.uploaderId` and `LiveStream.hostId` use restrictive foreign keys.
- Admin workflows disable accounts instead of hard-deleting content owners.
- Account/session rows may cascade when an identity is removed, but published
  videos and live stream records require an explicit ownership or retention
  decision before hard deletion.
