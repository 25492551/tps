# Admin wallet transfer: left-align fields; block same from/to

**When**: 2026-08-24T161014 UTC

## Summary

On `/admin/wallets` transfer form, withdrawal/deposit/amount fields are left-aligned (fixed widths). Selecting the same wallet for from and to is blocked in the UI (disabled options) and rejected by API with a Korean message.

## Changes

- `04_script/apps/web/src/portals/admin/pages.tsx`
- `04_script/apps/web/src/styles.css` — `.wallet-transfer-*`
- `04_script/apps/api/src/custodyWallets.ts`
- `07_manual/02_tether_market_ops.md`
