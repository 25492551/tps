# Redeploy GCE with rates table

**When**: 2026-08-24T140126 UTC

## Summary

Rebuilt `gce-tps-1` after site chrome + `/admin/rates` table changes; reloaded Caddy. Live: https://bgp-001.com

## Changes

- Runtime: `04_script/deploy/gce` `docker compose up -d --build`
