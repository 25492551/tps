# Show API key tab in admin nav

## Summary

Renamed admin nav item to **API 키 관리**, made the sidebar scroll so bottom links stay reachable, and rebuilt `gce-tps-1` so the live site picks up the tab.

## Changes

- `04_script/apps/web/src/portals/admin/AdminShell.tsx` — nav label
- `04_script/apps/web/src/styles.css` — sticky scrollable sidebar
- `04_script/apps/api/src/routes/admin.ts` — typed solution-key query rows (build)
- `04_script/apps/web/src/portals/admin/{SolutionKeysPage,ApiGuidePage}.tsx`
- `02_layout/03_as_built_ia.md`, `dictionary.md`, `07_manual/02_tether_market_ops.md`
