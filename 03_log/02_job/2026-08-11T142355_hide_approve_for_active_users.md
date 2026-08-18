# Hide approve button for active users

**When**: 2026-08-11T142355 UTC

## Summary

On `/admin/users`, the **승인** action is hidden when `status === 'active'`.

## Changes

- `04_script/apps/web/src/portals/admin/pages.tsx`
