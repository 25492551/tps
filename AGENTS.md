# Agent guide (Cursor / maintainers)

**Purpose**: Route tasks to the **minimum** files to read. Reduces token waste and repeat bugs.

**Hierarchy**: `.cursorrules` = always-on mandatory behavior. **This file** = task → files. `dictionary.md` = terms.

---

## 30-second protocol

1. **Classify** the request → one row in **§ Task router** below.
2. **Read only** that row’s **Read first** list (use `grep` / targeted `read`, not whole-repo search).
3. **Skim** `03_log/02_job/logmap_job.md` — **latest ~5 entries only**.
4. **Do not** reopen deleted `01_plan/*` files — use `06_docs/01_plan_archive_worklog.md` for historical intent / backlog.
5. **Before implementing**: `Pending user decision.md` (skip for pure bugfixes in listed code).
6. **After a completed job**: § Job logging + Korean manual if user-visible UI changed.

---

## Task router

| Task type | Read first |
|-----------|------------|
| Vocabulary / domain terms | `dictionary.md` |
| Portal IA / menus / shell | `02_layout/03_as_built_ia.md`, `04_script/apps/web/src/portals/` |
| Local run / operator how-to | `07_manual/01_local_run.md` |
| Archived plan intent / open backlog | `06_docs/01_plan_archive_worklog.md` |
| API change | `04_script/apps/api/src/` |
| Web UI change | matching page under `04_script/apps/web/src/pages/` |
| Schema | `04_script/db/` (latest migrations) |

*(Add product-specific rows as the codebase grows.)*

---

## Job logging

- New file: `03_log/02_job/YYYY-MM-DDTHHMMSS_<slug>.md` (UTC via `TZ=UTC date +%Y-%m-%dT%H%M%S`).
- Prepend row to `03_log/02_job/logmap_job.md` Update Record.
- Content: Summary + Changes (paths). No future checklists (those → `Pending user decision.md` or `06_docs` backlog).
