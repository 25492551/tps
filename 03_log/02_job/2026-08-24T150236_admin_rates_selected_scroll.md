# Admin rates: selected label + themed scroll

**When**: 2026-08-24T150236 UTC

## Summary

`/admin/rates`: removed source-column `선택됨` badge; show `선택됨` text in the action column where Select was. Themed scrollbars site-wide; rate table no longer wraps in a forced scroll box so content expands when space allows.

## Changes

- `04_script/apps/web/src/portals/admin/pages.tsx` — selected state in actions
- `04_script/apps/web/src/styles.css` — scrollbar theme, `.rate-selected-label`, overflow visible on rate sources
