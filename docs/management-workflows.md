# Validation And Management Workflows

Shared validation lives in `src/lib/validation.ts`. Server routes and actions should use the shared limits for names, titles, descriptions, emails, passwords, enums, and audience combinations before writing to the database.

## Validation Rules

| Field | Rule |
| --- | --- |
| ESI email | Normalized lowercase `@esi.dz` address |
| Password | At least 12 characters |
| Title | Required, 160 characters or less |
| Description | Optional, 2,000 characters or less |
| Year group | 16 characters or less |
| Enum fields | Must match generated Prisma enum values |

Browser media MIME values are treated as upload hints. The media worker remains authoritative because it probes sources with FFprobe before publishing any playable media.

## Lifecycle Controls

Admins can enable or disable users, reset passwords, revoke sessions, change roles/provisioning status, and update cohort/module assignments from User Management. Disable and manual session revocation require explicit confirmation in the form and re-check authorization on submit.

Video owners and admins can edit title, description, audience, and module; transfer ownership to an active approved teacher/admin; retry processing; attach captions; and archive videos. Archive hides the video from listings by moving it out of the `READY` lifecycle.

## Rate Limits

The application applies process-local rate limits to:

| Surface | Bucket |
| --- | --- |
| Credential login | Email address |
| Upload initialization | User ID |
| LiveKit token issuance | User ID or anonymous IP |
| Admin mutations | Admin user ID |

Production deployments should keep these application limits and add edge-level rate limiting for login, upload initialization, token issuance, and admin routes.

## Audit Events

Privileged account actions record audit events for user creation, role/provisioning changes, disabling, password reset, and session revocation. Video management records content update, archive, and ownership-transfer events with the content ID in metadata and user IDs in actor/subject fields.
