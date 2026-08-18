# OTC settle via on-chain USDT (no platform USDT ledger)

**When**: 2026-08-17T082349 UTC

## Summary

OTC buy/sell no longer credit/debit platform USDT ledger. Buy settles by TRC-20 transfer from admin custody to the user’s default managed wallet; sell pulls USDT from that wallet to custody then credits KRW ledger. Migration `013` adds `settling_onchain` status and `trades.onchain_txid`.

## Changes

- `04_script/db/013_otc_onchain_settle.sql` — status + `onchain_txid`
- `04_script/apps/api/src/tronTransfer.ts` — TronWeb TRC-20 USDT send
- `04_script/apps/api/src/otcWallets.ts` — load custody / user hot wallets
- `04_script/apps/api/src/otcSettle.ts` — buy/sell on-chain settle flow
- `04_script/apps/api/src/routes/trades.ts` — confirm/settle → on-chain; OTC cancel without fake USDT/KRW ledger refund
- `04_script/apps/api/src/routes/orders.ts` — sell always on-chain path; require managed wallet
- `04_script/apps/web/src/portals/user/pages.tsx` — wallet/buy/sell/trade copy
- `04_script/apps/web/src/portals/admin/pages.tsx` — holds actions (on-chain + retry)
- `04_script/apps/web/src/lib/api.ts` — `settling_onchain` badge
- `dictionary.md`, `.cursorrules`, `02_layout/03_as_built_ia.md`, `07_manual/02_tether_market_ops.md`
