# Job: Implement Tether Market MVP (Phases 0–7)

**When**: 2026-08-11T025150 UTC

## Summary

Shipped full MVP from `01_plan/01_tether_market_site_build.md`: schema, auth, admin/user portals, boards, admin custody dual-deposit exchange, WebSocket chat, seed, manuals. Verified happy path balances (buyer USDT, seller KRW) after ledger seq fix.

## Changes

- `04_script/db/002_tether_market.sql`, `003_ledger_seq.sql`
- `04_script/apps/api/src/**` — Express API, WS, ledger, seed, exchange invariant test
- `04_script/apps/web/src/**` — landing, auth, user/admin portals
- Docs: `.cursorrules`, `README.md`, `dictionary.md`, `02_layout/03_as_built_ia.md`, `07_manual/*`, `06_docs/01_plan_archive_worklog.md`
- `.env.example`; local Docker Postgres `tps-pg` used for verification

## Demo

- `admin@tps.local` / `admin123`
- `buyer@tps.local`, `seller@tps.local` / `demo1234`
