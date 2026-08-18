# Fix admin users table row border misalignment

**When**: 2026-08-11T142215 UTC

## Summary

Action column borders were staggered because `display: flex` was applied directly on `<td>`. Flex now lives on an inner `.table-actions` wrapper; `<td>` stays a normal table cell.

## Changes

- `04_script/apps/web/src/styles.css` — `.table-actions` as inner wrapper; `td.actions-cell`
- `04_script/apps/web/src/portals/admin/pages.tsx` — users + holds action cells
