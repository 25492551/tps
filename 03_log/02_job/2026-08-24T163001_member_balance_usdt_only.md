# Job: Member popup balance — USDT only + KRW estimate

**When (UTC)**: 2026-08-24T163001

## Summary

Admin/agent member popup (`/admin/member/:loginId`) balance section no longer shows or adjusts KRW ledger; USDT balance shows sell-rate KRW estimate in parentheses (same pattern as top bar).

## Changes

- `04_script/apps/web/src/portals/shared/MemberDetailPage.tsx`
