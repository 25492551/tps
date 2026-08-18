# Job: Partner sync bankAccount min-4 guard + debug cleanup

**When**: 2026-08-17T144132 UTC

## Summary

S01→TPS member sync failed with TPS 400 zod `bankAccount` min(4) when S01 stored placeholder accounts (e.g. `.`). S01 now rejects digit length &lt; 4 with a Korean message before calling TPS, and sends digit-normalized `bankAccount`. Debug session instrumentation removed from S01/TPS after verification.

## Changes

- `../s01/04_script/apps/api/src/services/tpsClient.ts` — digit normalize + length ≥ 4 before upsert
- `../s01/04_script/apps/api/src/routes/cash.ts` — tether-handoff pre-check for short/placeholder bank
- `04_script/apps/api/src/partner/routes.ts` — removed debug ingest logs
