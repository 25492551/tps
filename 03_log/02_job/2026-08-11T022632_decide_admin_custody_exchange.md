# Job: Decide admin custody dual-deposit exchange

**When**: 2026-08-11T022632 UTC

## Summary

Locked settlement model: buyer deposits KRW and seller deposits USDT to admin accounts; admin confirms both; held assets are exchanged. Removed pending D1/D2; updated plan FSM, API sketch, and dictionary terms.

## Changes

- `Pending user decision.md` — removed D1, D2; kept D3–D5
- `01_plan/01_tether_market_site_build.md` — custody exchange north star, deposit_intents, FSM, Phase 5, APIs
- `dictionary.md` — Buyer/Seller/Admin, custody, dual deposit, hold, exchange, refund
