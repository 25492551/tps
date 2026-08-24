# Agent transactions show USDT and KRW

**When**: 2026-08-19T110548 UTC

## Summary

`/agent/transactions` lists both assets; OTC rows include counterpart KRW/USDT from the trade. Member filter shows USDT and KRW balances.

## Changes

- `04_script/apps/api/src/routes/agent.ts`
- `04_script/apps/web/src/portals/agent/pages.tsx`
- `07_manual/02_tether_market_ops.md`
