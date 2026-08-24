# Sitewide: credit/debit → Korean UI labels

**When**: 2026-08-19T122620 UTC

## Summary

User-visible ledger direction labels now show **입금** / **출금** instead of English credit/debit. API/DB values remain `credit`/`debit`. Member and agent portals already used Korean; admin transactions filter, adjust form, and table cells were updated.

## Changes

- `04_script/apps/web/src/portals/admin/pages.tsx` — filter labels, adjust select, table direction column
