# Cloudflare migration — 1.6.0

The frontend remains on Vercel, at the existing URL. Supabase is no longer a runtime dependency: the existing SDK is retained only as an HTTP/session transport to a small compatibility API on Cloudflare Workers. Database rows live in D1. Existing media files are Workers Static Assets. New uploads are chunked into D1 BLOB rows; neither R2 nor a paid subscription is required.

## Data protection

- Original Supabase project and downloaded archives are retained, not deleted.
- User IDs, card IDs, bcrypt password hashes, existing confirmation state, and deck IDs are preserved. Browser-local study schedules and outbox data are not erased.
- Account ownership is enforced by the Worker for every record read/write. Administrative access requires a server-only credential. Anonymous users cannot query records or user profiles.
- Login requests are rate-limited. Password verification runs in the existing Vercel Node runtime to stay within Workers Free CPU limits. Only short-lived RSA-signed requests from the Worker are accepted by the verifier. Private keys and recovery data are gitignored; only the public verification key is committed.
- Public media buckets retain their original public, unguessable paths. `user-backups` requires authentication or a time-limited signed link. Supabase sessions are not imported; existing users log in again with the same credentials.

## Free tier constraints

This is not an unlimited service. Workers Free request and D1 quotas still apply. The former Supabase 5 GB cached-egress allowance does not apply to this backend. Do not enable paid services automatically.

Existing static media must fit Workers' asset limits. New media uploads are capped at 25 MiB per file and 300 MiB aggregate, leaving room below the free D1 database size limit. Large automated media archives may exceed the per-file limit; browser-created full backups remain available without uploading the archive. Automated backup settings were disabled in the recovered snapshot and remain disabled.

## Recovery and deployment

1. Keep database/storage recovery archives outside the repository.
2. `node scripts/prepare-cloudflare-migration.mjs <database.backup.gz> <storage.zip>` creates ignored assets, SQL, and manifest/count files. Do not rerun SQL import over an existing production database.
3. `cloudflare/wrangler.jsonc` identifies the Worker and D1 binding. `pnpm dlx wrangler@4 deploy --config cloudflare/wrangler.jsonc` updates only this backend.
4. Worker secrets: `AUTH_BRIDGE_PRIVATE_JWK`, `ADMIN_KEY`, `LEGACY_ADMIN_HASH`. Never commit their values. The legacy hash permits the existing Vercel server credential without copying that credential into client code.
5. `node scripts/smoke-cloudflare.mjs` creates an isolated disposable test account, checks SDK auth/CRUD/storage/security, and removes that account's data afterward.
6. `node scripts/verify-migrated-media.mjs` verifies all recovered files by HTTP byte ranges, without downloading every file in full.
7. Frontend and server-side APIs share the destination defined in `shared/backend-config.js`. Legacy media references are mapped to the recovered files without discarding locally cached cards.

Rollback: restore the former client configuration and server API configuration together. That rollback still requires the original Supabase service to become available; it cannot lift a provider restriction.
