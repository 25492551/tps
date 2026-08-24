# Wire TM composite fonts site-wide

**When**: 2026-08-24T151454 UTC

## Summary

Connected generated `tm-fonts.css` (Latin/EN → Noto Serif KR, Hangul → Noto Sans KR) and pointed `--font-display` / `--font-body` / `--font-num` at composite family `TM`. Inter lacks Hangul glyphs so Korean uses Noto Sans KR. Remote Cursor queue keys were written earlier; Windows client Queue Messages may still need UI toggle.

## Changes

- `04_script/apps/web/src/tm-fonts.css` (generated)
- `04_script/apps/web/src/styles.css` — import TM + font tokens
- `07_manual/02_tether_market_ops.md` — theme/font blurb
