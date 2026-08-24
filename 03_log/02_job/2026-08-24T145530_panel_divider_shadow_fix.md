# Panel section divider shadow fix

**When**: 2026-08-24T145530 UTC

## Summary

Section dividers looked flat because Figma’s `filter: drop-shadow` on a transparent panel was mapped to element `box-shadow` (weak on `#b0b0b0`), and `.rate-sources` had briefly forced `box-shadow: none`. Restored visible line + `0 3px 6px` shadow via `.panel::after`.

## Changes

- `04_script/apps/web/src/styles.css` — `.panel::after` divider stroke + shadow; removed `.rate-sources` shadow kill
