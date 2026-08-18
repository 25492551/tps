# Admin holds: show request time

**When**: 2026-08-17T081124 UTC

## Summary

Added **요청 시각** column on `/admin/holds` (trade `created_at`, KST via `formatKst`).

## Changes

- `04_script/apps/web/src/portals/admin/pages.tsx`
