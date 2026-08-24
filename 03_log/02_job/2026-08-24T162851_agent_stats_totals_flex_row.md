# Job: Agent stats totals — fix horizontal layout

**When (UTC)**: 2026-08-24T162851

## Summary

Fixed `/admin/agent-stats` summary boxes stacking vertically: `.panel` sets `flex-direction: column`, which was inherited by `.agent-stats-totals` because row direction was not overridden.

## Changes

- `04_script/apps/web/src/styles.css` — `.agent-stats-totals`: add `flex-direction: row`.
