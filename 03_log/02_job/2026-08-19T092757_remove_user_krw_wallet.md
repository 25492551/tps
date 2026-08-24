# Job: Remove user KRW wallet (USDT-only)

**When**: 2026-08-19T092757 UTC

## Summary

User portal no longer shows KRW balances or 원화계좌. Platform manages USDT only; sell settle does on-chain sweep without KRW ledger credit (KRW paid off-platform).

## Changes

- `04_script/apps/web/src/portals/user/{pages,UserShell}.tsx` — drop KRW UI / banks nav
- `04_script/apps/api/src/routes/{assets,transactions}.ts` — USDT-only balances; bank-accounts 410
- `04_script/apps/api/src/otcSettle.ts` — sell settle without KRW credit
- `04_script/apps/web/src/portals/admin/pages.tsx` — holds copy
- `dictionary.md`, `02_layout/03_as_built_ia.md`, `07_manual/02_tether_market_ops.md`
