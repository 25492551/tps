# Job: Plain-text login id + admin solution column

**When**: 2026-08-19T091659 UTC

## Summary

Login ids are plain text (not email). Existing `users.email` values had `@…` stripped (partner members prefer `external_login_id`). Admin `/admin/users` shows **솔루션** (`partners.name`). Partner upsert stores `loginId` directly.

## Changes

- `04_script/db/015_login_id_plain_text.sql` — data migration
- `04_script/apps/api/src/loginId.ts` — normalize/validate
- `04_script/apps/api/src/routes/{auth,admin,transfers}.ts`, `partner/routes.ts`, `seed.ts`
- `04_script/apps/web` — login/create/transfer labels; users table solution column
- `07_manual/*`, `dictionary.md`, `02_layout/03_as_built_ia.md`
