# Fix scrollbar auto-hide on table sections

**When**: 2026-08-24T160519 UTC

## Summary

Table sections no longer use a fixed height (which kept a scroll viewport even for short lists). They grow with content up to 85vh, so scrollbars appear only on overflow. Scroll thumbs stay transparent until hover on scroll containers.

## Changes

- `04_script/apps/web/src/styles.css` — `.table-scroll`, `.agent-tree-pane`, scrollbar hover rules
