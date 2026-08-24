# Agent nav accordion (one open group)

## Summary

Agent sidebar opens only one nav group at a time: opening 개인 거래 closes 솔루션 관리 and vice versa. Route changes also switch exclusively.

## Changes

- `04_script/apps/web/src/portals/agent/AgentShell.tsx` — single `openGroup` state
