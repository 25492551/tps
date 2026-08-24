# Job: Transactions page — remove USDT balance subtitle

**When (UTC)**: 2026-08-24T164909

## Summary

Removed redundant `USDT 잔액 …` line from `/app/transactions` main area (balance remains in top bar).

## Changes

- `04_script/apps/web/src/portals/user/pages.tsx` — `TransactionsPage`
