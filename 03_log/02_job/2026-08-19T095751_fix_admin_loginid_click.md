# Fix admin loginId click → transactions

**When**: 2026-08-19T095751 UTC

## Summary

Admin users (and bank-requests / transactions list) login id click now uses `navigate` / `setSearchParams` button links so filtering reliably opens `/admin/transactions?loginId=…`. Transactions page reloads when URL `loginId` string changes.

## Changes

- `04_script/apps/web/src/portals/admin/pages.tsx`
- `04_script/apps/web/src/styles.css` — `.link-btn`
