# Admin holds: trade id not clickable

**When**: 2026-08-19T111345 UTC

## Summary

`/admin/holds` trade id column is plain text (no link to `/app/trades/:id`).

## Changes

- `04_script/apps/web/src/portals/admin/pages.tsx`
