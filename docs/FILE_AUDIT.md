# Smart-Corp AI — File & Code Integrity Audit

**Date:** 26 August 2026
**Branch:** `arena/01a03cbc-identity`

Purpose: verify that every source file exists in the repository, and identify
anything the brief/docs reference that is actually missing.

---

## 1. Everything on disk is tracked — no dropped files

- **Tracked files:** 115 (`git ls-files`)
- **Untracked files:** 0
- **Files on disk (excl. `.git`, `node_modules`, `dist`):** 115 → matches tracked
  set exactly. Nothing exists on disk that is missing from Git, and vice-versa.
- **Imports resolve:** `npm run typecheck` passes, so every relative `.js`→`.ts`
  import across `server/`, `src/`, and `tests/` resolves (the `.js` extensions are
  the TypeScript ESM convention, not missing files).
- **Script entrypoints exist:** every `tsx` target in `package.json` scripts
  (`server/index.ts`, `migrate.ts`, `seed.ts`, `evaluate.ts`, `phase6-evaluate.ts`,
  `worker.ts`) is present.
- **Secrets:** none committed (audited); `.env*` and `reports/phase6-*.json` are
  correctly gitignored.

**Conclusion:** No source or configuration file has been lost. The repository is
internally consistent and builds/tests green.

---

## 2. Referenced-but-missing items

These are **not** files that were dropped — they are things the brief or docs cite
that do not exist as code/files in this repository.

| # | Missing item | Where it is claimed | Actual state |
|---|--------------|---------------------|--------------|
| 1 | `docs/COMPETITIVE_FEATURE_PARITY_GATE.md` | Brief "Open Item 18" names it as the baseline | **Does not exist.** Closest actual file is `docs/COMPETITIVE_PRODUCT_AUDIT.md`. |
| 2 | Transactional outbox (table + atomic DB/event emission + idempotent relay) | Brief "Authoritative Current State": "Platform outbox foundation", "Outbox idempotency" listed as *already implemented* | **Not implemented.** Zero `outbox` table in `database/migrations/`, zero outbox code in `server/`. Appears only as a planned P1 in `docs/PHASE7_STRATEGIC_PLATFORM_EVOLUTION.md`. |
| 3 | Production webhook dispatcher (signed payloads, replay protection, retry, DLQ) | Brief "Remaining Production Gates" (P1 #8) | **Not implemented.** No webhook code in `server/`; planning docs only. |
| 4 | Agent version rollback (deploy → detect → rollback → audit) | Brief: "Agent rollback artifacts" | **Partial.** `agent_versions` table is defined in `database/migrations/001_initial.sql` but is **never referenced** by any `server/*.ts` code (orphaned schema). No rollback/audit flow exists. |
| 5 | `reports/phase6-product-learning-latest.json` | `docs/PHASE6_PRODUCT_LEARNING_REPORT.md` (export command) | Gitignored generated artifact (by design); produced by `npm run phase6:evaluate`. |
| 6 | `docker-compose.staging.yml` | `docs/STAGING_DEPLOYMENT.md` "Staging Docker Compose Template" | Appears only as an illustrative code block inside the doc; the actual committed compose file is `docker-compose.yml`. The secrets-based staging compose (`POSTGRES_PASSWORD_FILE`, Docker `secrets:`) was never materialized as a real file. |

---

## 3. Implications

- Items 2, 3, and 4 are **genuine remaining engineering gaps**, not external
  dependencies. They can be built next in this repository with no external access
  (this is the "next tranche" already listed in `docs/FINAL_STATUS.md`).
- Item 1 is a documentation naming gap — the competitive baseline content lives in
  `docs/COMPETITIVE_PRODUCT_AUDIT.md`; the specific `_PARITY_GATE.md` filename the
  brief references was never created.
- Items 5 and 6 are cosmetic: a generated report and a compose-file template that
  was only ever illustrative.

**Overall:** the code base is complete and consistent for everything that was
actually implemented; the only "missing" code is the set of features that were
described in planning documents but never built.
