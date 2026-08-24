# Admin solution API key tab

## Summary

Admin `/admin/solution-keys` manages Partner API keys per solution: register, issue (plaintext once), rotate, revoke, enable/disable. Only issued keys may call Partner API.

## Changes

- `04_script/apps/api/src/routes/admin.ts` — list/create/issue/revoke/patch; fix audit payload
- `04_script/apps/api/src/partner/crypto.ts` — virtual deposit address generator
- `04_script/apps/web/src/portals/admin/SolutionKeysPage.tsx` — register form, filters, copy
- `04_script/apps/web/src/portals/admin/ApiGuidePage.tsx` — point operators to the keys tab
- `02_layout/03_as_built_ia.md`, `dictionary.md`, `07_manual/02_tether_market_ops.md`, `06_docs/02_partner_api_v1.md`
