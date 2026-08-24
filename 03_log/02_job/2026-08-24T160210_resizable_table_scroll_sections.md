# Resizable table sections; scrollbar only on overflow

**When**: 2026-08-24T160210 UTC

## Summary

`.table-scroll` (and agent-tree panes) are vertically resizable. Scrollbars appear only when content overflows. Minimum height keeps table-count + header + filter + one data row visible.

## Changes

- `04_script/apps/web/src/styles.css` — `.table-scroll`, `.agent-tree-pane`
- `07_manual/02_tether_market_ops.md`
