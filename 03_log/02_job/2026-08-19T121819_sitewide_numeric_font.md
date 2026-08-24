# Sitewide readable numeric typography

**When**: 2026-08-19T121819 UTC

## Summary

All portals use IBM Plex Sans KR tabular lining figures for amounts (body, tables, `.rate-num`, top-bar chips). Syne no longer used for numeric displays.

## Changes

- `04_script/apps/web/src/styles.css` — `--font-num`, body/table/rate-num/num tabular figures
- `04_script/apps/web/src/lib/api.ts` — duplicate `formatKrw` cleanup
