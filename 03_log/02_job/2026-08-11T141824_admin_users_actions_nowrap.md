# Admin users table actions nowrap

**When**: 2026-08-11T141824 UTC

## Summary

Fixed `/admin/users` (and OTC holds) action cells wrapping onto multiple lines by using a dedicated `.table-actions` row (`flex-wrap: nowrap`) and horizontal scroll on wide tables.

## Changes

- `04_script/apps/web/src/styles.css` — `.table-actions`, `.table-scroll`
- `04_script/apps/web/src/portals/admin/pages.tsx` — users + holds action `<td>` use `table-actions`; users panel uses `table-scroll`
