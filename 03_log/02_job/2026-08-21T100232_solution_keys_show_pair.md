# Show public and private partner API keys

## Summary

`/admin/solution-keys` now shows each solution’s **공개키** (access) and **개인키** (secret). Partner API auth still uses the private key (`X-Partner-Key`). Secrets are stored encrypted so the admin list can display them after issue. Legacy hashed-only keys need reissue to reveal the private key.

## Changes

- `04_script/db/024_partner_api_key_pair.sql` — `api_public_key`, `api_secret_enc`
- `04_script/apps/api/src/partner/crypto.ts` — `generatePartnerKeyPair`
- `04_script/apps/api/src/routes/admin.ts` — issue/list decrypt + display
- `04_script/apps/api/src/seed.ts` — s01 key pair
- `04_script/apps/web/src/portals/admin/SolutionKeysPage.tsx` — public/private columns
- `04_script/apps/web/src/styles.css`, `ApiGuidePage.tsx`
- `dictionary.md`, `07_manual/02_tether_market_ops.md`, `06_docs/02_partner_api_v1.md`
