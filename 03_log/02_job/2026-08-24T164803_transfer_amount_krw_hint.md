# Job: Transfer tab — KRW estimate below amount

**When (UTC)**: 2026-08-24T164803

## Summary

`/app/transfer` (and agent reuse) shows sell-rate KRW equivalent (`≈ N원`) below the USDT amount input as the user types.

## Changes

- `04_script/apps/web/src/portals/user/pages.tsx` — `TransferPage`: `useSpotRate('sell')`, `estimateUsdtKrw`, hint under amount field
