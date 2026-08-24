# Job: Admin settings — OTC notify section spacing

**When (UTC)**: 2026-08-24T162816

## Summary

Fixed overlapping "OTC 알림" title and description on `/admin/settings` by using the same `setting-title` / `setting-desc` block inside the panel as the duplicate-login section (removed negative-margin `page-sub`).

## Changes

- `04_script/apps/web/src/portals/admin/pages.tsx` — merge OTC header into `.panel.stack`; drop standalone `h2.section-title` + inline negative margin.
