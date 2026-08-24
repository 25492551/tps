# Mobile hamburger nav for portals

## Summary

On viewports ≤860px, admin/agent/member shells hide the sidebar and open it from a top-right hamburger. Route change and backdrop close the drawer.

## Changes

- `04_script/apps/web/src/portals/shared/ShellLayout.tsx` — shared chrome
- `04_script/apps/web/src/portals/{admin,agent,user}/*Shell.tsx` — use ShellLayout
- `04_script/apps/web/src/styles.css` — mobile drawer styles
