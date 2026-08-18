# Job: Per-user buy/sell tether permissions

**When**: 2026-08-11T055758 UTC

## Summary

Added independent `canBuyTether` / `canSellTether` flags on users. Admin toggles in user management; API and board UI enforce posting and trade-start by permission.

## Changes

- `04_script/db/006_user_trade_permissions.sql`
- `04_script/apps/api` — types, listings/trades gates, admin PATCH
- `04_script/apps/web` — admin user toggles; board create/trade CTAs
- `dictionary.md`, `07_manual/02_tether_market_ops.md`
