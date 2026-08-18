# Job: Bind Postgres 5432 to localhost only

**When**: 2026-08-11T051644 UTC

## Summary

Recreated `tps-pg` with `-p 127.0.0.1:5432:5432` (was `0.0.0.0:5432`). Same data volume; reattached to `gce_s01`. TPS API health and DB query OK.

## Changes

- Runtime Docker: `tps-pg` port publish localhost-only
