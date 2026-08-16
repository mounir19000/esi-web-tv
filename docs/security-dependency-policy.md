# Security And Dependency Policy

## Automated Checks

CI runs both dependency audits on every pull request and push to `main`:

```bash
npm run audit
npm run audit:prod
```

`npm run audit:prod` uses `--omit=dev --audit-level=high` and is the release gate for production dependency risk. Dependabot opens weekly pull requests for npm packages and GitHub Actions.

## Updating Dependencies

Use the smallest dependency update that removes the advisory, then run:

```bash
npm install
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e
npm run audit
npm run audit:prod
```

For GitHub Actions updates, keep actions on versions that use the currently supported GitHub Actions runtime and verify the workflow on the pull request before merging.

## Exceptions

High or critical advisories are not accepted silently. If a fix is unavailable, open a tracking issue and document:

- advisory identifier and affected package path
- production reachability analysis
- compensating controls
- owner
- expiry date, no more than 30 days out
- commands proving that all unrelated advisories are still clear

Expired exceptions block release until renewed with fresh reachability analysis or removed by an upgrade.
