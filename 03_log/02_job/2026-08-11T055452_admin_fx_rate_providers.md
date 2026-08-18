# Job: Admin FX rate provider page

**When**: 2026-08-11T055452 UTC

## Summary

Added admin **환율** page listing multiple KRW/USDT sources with live quotes; admin can select the site reference provider. Deployed to production.

## Changes

- `04_script/db/005_fx_rate_provider.sql`
- `04_script/apps/api/src/rates.ts`, `settings.ts`, `routes/admin.ts` — list/fetch/select providers
- `04_script/apps/web` — `/admin/rates` UI
- `dictionary.md`, `02_layout/03_as_built_ia.md`, `07_manual/02_tether_market_ops.md`

Providers: Upbit, Bithumb, CoinGecko, CoinPaprika, Binance+USD/KRW approx.
