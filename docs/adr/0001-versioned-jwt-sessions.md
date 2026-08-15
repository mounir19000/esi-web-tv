# ADR 0001: Versioned JWT Sessions

## Status

Accepted

## Context

ESI Web TV uses NextAuth credentials login for local ESI accounts. Credentials sessions require JWT-backed sessions, so switching completely to database sessions would break the current login path without a larger auth redesign.

JWTs can become stale when a user is deleted, disabled, demoted, or reset. A token that still carries an old role must not remain authoritative for privileged routes.

## Decision

Keep JWT sessions, add `User.sessionVersion`, and treat the database user row as authoritative on every privileged request.

The JWT stores the session version at sign-in. Auth callbacks compare that claim with the current database value and mark mismatched, deleted, or disabled users as revoked. Server-side authorization helpers load the active database user before granting user, educator, or admin access. Role changes, account disables, password resets, and security resets must increment `sessionVersion`; any database sessions are also deleted as defense in depth.

## Consequences

Existing privileged code must use `requireUser`, `requireEducator`, or `requireAdmin` instead of trusting `session.user.role` directly. Public browsing can treat a stale session as signed out. Revocation is immediate after the next request because the database user state is checked before privileged work runs.
