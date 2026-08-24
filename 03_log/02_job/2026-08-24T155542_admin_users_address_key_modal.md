# Admin users: click address to reveal private key modal

**When**: 2026-08-24T155542 UTC

## Summary

On `/admin/users`, removed the separate “키 보기” button. Clicking the managed wallet address (public key) opens a modal with the private key.

## Changes

- `04_script/apps/web/src/portals/admin/pages.tsx`
- `07_manual/02_tether_market_ops.md`
