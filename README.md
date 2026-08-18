# Tether Market (TPS)

User-to-user **USDT ↔ KRW** trading site. After matching, both parties deposit to **admin custody** (buyer → admin KRW bank, seller → admin USDT wallet); admin confirms both deposits and executes the **USDT↔KRW exchange**. The platform is escrow/custody, not a market-maker.

| Doc | Purpose |
|-----|---------|
| [`dictionary.md`](dictionary.md) | Domain vocabulary |
| [`07_manual/01_local_run.md`](07_manual/01_local_run.md) | Operator / local run (Korean) |
| [`02_layout/03_as_built_ia.md`](02_layout/03_as_built_ia.md) | As-built IA (routes, shells) |
| [`01_plan/01_tether_market_site_build.md`](01_plan/01_tether_market_site_build.md) | Living build plan (Phase 0–7) |
| [`06_docs/01_plan_archive_worklog.md`](06_docs/01_plan_archive_worklog.md) | Archived plan summary + backlog |
| [`03_log/02_job/logmap_job.md`](03_log/02_job/logmap_job.md) | Job log index |
| [`AGENTS.md`](AGENTS.md) | Task → files router for Cursor |
| [`.cursorrules`](.cursorrules) | Always-on project rules |

## Stack

- **API**: Node.js + TypeScript, Express (`04_script/apps/api`)
- **Web**: React + Vite (`04_script/apps/web`) — user shell `/app/*`, admin shell `/admin/*`
- **DB**: PostgreSQL migrations (`04_script/db/`)
- **Realtime**: WebSocket for trade-scoped buyer↔seller chat
- **npm workspace**: `05_data/` (root `package.json` forwards `dev:*`, `seed*`, `build`)

## Setup

1. Create a PostgreSQL database (see `07_manual/01_local_run.md` for Docker example).
2. Copy `.env.example` → `.env` at repo root and set `DATABASE_URL` / `JWT_SECRET`.
3. `cd 05_data && npm install` (creates `apps` → `04_script/apps` symlink via `ensure-apps-link.mjs`).
4. From repo root: `npm run seed` (applies `04_script/db/*.sql` + demo accounts).
5. `npm run build`, `npm run dev:api` (`:3001`), `npm run dev:web` (`:5173`, proxies `/api`).

Operator details: [`07_manual/01_local_run.md`](07_manual/01_local_run.md).

## Folder layout

| Folder | Role |
|--------|------|
| `01_plan/` | Optional future plans only (archive history → `06_docs/`) |
| `02_layout/` | Layout / IA / brand refs |
| `03_log/` | Chat exports + completed job logs |
| `04_script/` | Product code (`apps/`, `db/`, `deploy/`) |
| `05_data/` | npm workspace root + generated data (do not commit outputs) |
| `06_docs/` | Engineering notes (English) |
| `07_manual/` | Operator manuals (Korean) |

Root also keeps: `.cursorrules`, `AGENTS.md`, `dictionary.md`, `Pending user decision.md`, `git/` (local keys — not committed).
