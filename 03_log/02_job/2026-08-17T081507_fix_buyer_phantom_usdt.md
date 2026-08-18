# Fix buyer phantom 5 USDT; clarify wallet balances

**When**: 2026-08-17T081507 UTC

## Summary

buyer@tps.local ledger showed 15 USDT (legacy P2P demo 5 + OTC buy 10). Debited the demo 5 so ledger is 10. User wallet page now leads with on-chain (actual TRC-20) balance and clarifies ledger vs chain.

## Changes

- DB: admin_adjust debit 5 USDT on buyer (legacy P2P demo)
- `04_script/apps/web/src/portals/user/pages.tsx` — balance section order/copy
