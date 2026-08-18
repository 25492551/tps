# Plan archive / worklog

Historical plan intent and open backlog live here (not in `01_plan/` once archived).

**Living plan** (kept as reference): [`01_plan/01_tether_market_site_build.md`](../01_plan/01_tether_market_site_build.md) — MVP P2P implemented 2026-08-11; **pivoted to Admin OTC 2026-08-11T103807 UTC** (boards removed).

## Delivered (MVP → OTC)

- Auth: public register → `pending_approval`; trade gated until admin approve
- Admin OTC: buy/sell vs platform, holds confirm→payout, users, rates, settings, transactions
- User: managed TRC-20 wallet (view/transfer), buy/sell OTC, internal transfer, ledger, WS chat with admin
- Docs: dictionary, as-built IA, Korean manuals
- Legacy: P2P listings API returns 410; historical listing rows ignored by new UI

## Open backlog (post-MVP)

- On-chain deposit verification / indexer
- Stronger TRC-20 address checksum validation
- Rate limiting / production hardening beyond MVP
- Automated payout from managed private keys
- Archive living plan file into this doc when product direction changes
