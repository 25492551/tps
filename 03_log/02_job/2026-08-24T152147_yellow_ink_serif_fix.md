# Yellow ink + fix English serif (TM)

**When**: 2026-08-24T152147 UTC

## Summary

All UI text uses yellow-family tokens (`--ink` / `--muted` / `--accent`). Regenerated `tm-fonts.css` and removed Inter from the font stack so Latin falls back to Noto Serif KR (English was appearing sans because Inter stole glyphs).

## Changes

- `04_script/apps/web/src/styles.css` — yellow ink; `color: #fff` → `var(--ink)`; font stack
- `04_script/apps/web/src/tm-fonts.css` — hangul then latin TM faces
- `07_manual/02_tether_market_ops.md`
