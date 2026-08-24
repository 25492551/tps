# Job: Bank register request + admin approval tab

**When**: 2026-08-19T093200 UTC

## Summary

User 원화 계좌 uses **등록 요청** (pending). Admin **계좌 변경 승인** (`/admin/bank-requests`) approves/rejects; approved banks become active `bank_accounts`.

## Changes

- `04_script/db/016_bank_change_requests.sql`
- `04_script/apps/api/src/routes/assets.ts` — request/cancel APIs
- `04_script/apps/api/src/routes/admin.ts` — list/approve/reject
- `04_script/apps/web` — BanksPage, AdminBankRequestsPage, nav/routes
- `07_manual/02_tether_market_ops.md`, `dictionary.md`, `02_layout/03_as_built_ia.md`
