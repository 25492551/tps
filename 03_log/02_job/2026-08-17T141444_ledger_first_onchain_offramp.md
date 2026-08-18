# Ledger-first balances; on-chain only for sell + external withdraw

**When**: 2026-08-17T141444 UTC

## Summary

User balances are internal ledger by default (UI looks like normal trades; no wallet address shown). Real TRC-20 sends only for (1) USDT→KRW sell settle — custody hot→cold/sweep, and (2) withdraw to a non-platform address. Buy and member-to-member transfer stay ledger-only.

## Changes

- `04_script/apps/api/src/otcSettle.ts` — buy = ledger USDT; sell = on-chain sweep + KRW
- `04_script/apps/api/src/externalWithdraw.ts` — custody→external on-chain withdraw
- `04_script/apps/api/src/routes/orders.ts` — sell holds ledger USDT on create
- `04_script/apps/api/src/routes/trades.ts` — buy/sell settle wiring; hide custody address from users
- `04_script/apps/api/src/routes/assets.ts` — no address in user wallets API; external transfer executes on-chain
- `04_script/apps/api/src/routes/transfers.ts` — email/user = ledger; unknown T-address = on-chain
- `04_script/apps/api/src/routes/transactions.ts` — display titles + TX- ids
- `04_script/apps/web/src/portals/user/*` — hide addresses; wallet/transfer/history copy
- `04_script/apps/web/src/portals/admin/pages.tsx` — holds action labels
- `dictionary.md`, `.cursorrules`, `02_layout/03_as_built_ia.md`, `07_manual/02_tether_market_ops.md`
