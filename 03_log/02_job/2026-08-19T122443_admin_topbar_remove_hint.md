# Admin top bar: remove notify hint text

**When**: 2026-08-19T122443 UTC

## Summary

Removed the admin top-bar right-side hint “신규 요청 시 알림음 · 설정은 사이트 설정”. Alert behavior and settings page are unchanged.

## Changes

- `04_script/apps/web/src/portals/admin/AdminShell.tsx` — drop `admin-topbar-hint` paragraph
