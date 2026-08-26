# HTML Report Implementation Plan

> Goal: when agent-readiness runs on a repo (first time or update), generate a polished, self-contained visual HTML report inspired by Factory Droid's readiness dashboard.
>
> Decisions already made: **(a)** HTML is always generated on every run (no opt-in flag). **(b)** Light-first theme with automatic dark mode via `prefers-color-scheme`.

## Context (read this first)

- The engine is `src/engine.ts`. `runReadiness(root, opts)` returns a `ReadinessReport` with: `level`, `overall`, `droidPassRate`, `pillars` (per-pillar `{passed, total, pct, perApp?}`), `findings[]` (each: `id`, `pillar`, `pass`, `skipped`, `severity`, `difficulty`, `evidence`, `app?`), `punchlist` (top 10, severity→difficulty sorted), `apps`, `run` (date, model, commitHash, branch, hasLocalChanges, hasNonRemoteCommits), `rubric_version`, `config_hash`.
- `writeReport(root, report, targetDir?)` in `engine.ts` writes `.agent-readiness/report.json` + `report.md` and appends to history (best-effort). It returns the output dir.
- `src/history.ts`: `readHistory(root, dir?)` returns `HistoryEntry[]` (`{date, rubric_version, config_hash, level, overall, perPillar}`); `trend(last, {report})` computes deltas.
- `src/criteria-registry.ts`: `CRITERIA_REGISTRY: CriterionDef[]` with `droidId`, `piId`, `name`, `level` (1–5), `scope` ('repo'|'app'), `skippable`, `description`. Use `getCriterionByPiId(piId)` to enrich findings with human-readable names and Droid level.
- `LEVEL_GATES` and `MANDATORY` (P2, P6) and `GATE_PCT = 0.8` are exported from `engine.ts` — use them for the level-ladder lock math; do not re-implement.
- Surfaces that call the engine: `src/cli.ts` (flags), `.pi/extensions/agent-readiness/index.ts` (`/readiness-report` pi command), `skills/agent-readiness/SKILL.md` Phase 5.
- Droid UI reference (Factory docs, Readiness Dashboard + Readiness Report Command pages):
  - Repo detail: header (repo, level, last eval), **level accordions** Functional→Autonomous each showing % complete and **lock status** (locked until previous level ≥80%).
  - Criterion rows: name, score `X/Y`, green/red pass dot, **click-to-expand rationale**.
  - Difficulty axis Basic/Intermediate/Advanced separate from level; remediation ordered Basic-first.
  - 2–3 action items focused on reaching the next level.

## Deliverable 1: `src/html-report.ts` (new module — the core)

Export:

```ts
export function renderHtml(report: ReadinessReport, opts: { history?: HistoryEntry[] } = {}): string
```

Single, fully self-contained `report.html`:
- No external requests, no CDN scripts, no web fonts, no images — must open correctly from `file://` and print nicely.
- All data embedded as one `<script>window.__DATA__ = {...}</script>` JSON blob; all interactivity is ~100 lines of vanilla JS (`<script>` at end of body).
- CSS in a single `<style>` block, light theme variables on `:root`, dark overrides under `@media (prefers-color-scheme: dark)`. System font stack.
- **Escape all interpolated strings** (findings `evidence` comes from repo files → XSS-safe by construction). Write a small `esc()` helper; use it everywhere.

### Page structure (top to bottom)

1. **Sticky nav** — small brand "agent-readiness", level chip, section links (Overview / Levels / Fix Next / Pillars / Criteria).
2. **Hero** — repo name, level badge `L{n} · {name}` (names: L0 Unknown, L1 Functional, L2 Documented, L3 Standardized, L4 Optimized, L5 Autonomous), overall score **donut chart in inline SVG** (`overall`/100, color: red <40, amber <70, green ≥70), secondary stats: droid-compatible pass rate, checks passed x/y, provenance strip (language, commit short hash + branch, run date, model, rubric version, config hash; warn icon when `hasLocalChanges` or `hasNonRemoteCommits`).
3. **What changed** — only when `history` has ≥1 prior entry *before* this run: overall delta (+/−), level change string, per-pillar delta table, and a **sparkline of `overall` over history** (inline SVG). On first run (no history): a "Baseline established" card instead. Compute deltas from the *previous* entry vs current report (appendHistory runs after render order matters — see wiring below).
4. **Level ladder** — five rows L1→L5: name, description, progress bar = pct of that level's gate pillars passing, and a lock indicator computed from `LEVEL_GATES` (a level is unlocked only if all previous-level gates ≥80% and `MANDATORY` P2/P6 ≥80%). Highlight current level; show "% toward next level". Math must mirror `resolveLevel()` semantics exactly (reuse `LEVEL_GATES`/`MANDATORY`/`GATE_PCT`).
5. **Fix next** — punchlist as cards: severity chip (high=red/med=amber/low=grey), difficulty chip (Basic/Intermediate/Advanced), pillar + check id, remediation action text, evidence in muted mono. Basic-first ordering note. (Punchlist is already severity→difficulty sorted by the engine.)
6. **Pillar grid** — 10 cards (P0–P9): name, progress bar with pct, passed/total, per-app mini-rows when `perApp` present (monorepo). Card links/scrolls to the criteria table filtered by that pillar.
7. **Criteria table** — one row per finding joined with `CRITERIA_REGISTRY` via piId (fallback: use the finding id and pillar when no registry match): status dot (pass=green / fail=red / skipped=grey), name + check id, Droid level badge, scope chip, difficulty chip, and an expandable rationale row (evidence). Controls: filter chips (All / Failed / Passed / Skipped), search input (client-side filter), pillar filter from pillar-card clicks.
8. **Footer** — apps discovered (path — name (type): description), scoring model note (weighted N-1 gated vs droid flat pass-rate depending on `droidScoring`), strict flag, "generated by agent-readiness vX".

### Size guard

Embed only what the page uses: findings (id, pillar, pass, skipped, severity, difficulty, evidence, app), pillars, punchlist, apps, run, level/overall/droidPassRate, and a trimmed history array (date, level, overall, perPillar). Do NOT embed full criterion descriptions in `__DATA__`; instead bake the joined display fields (name, droid level, scope) into each row at render time. Target <500KB HTML.

## Deliverable 2: wiring

### `src/engine.ts`
- Import `renderHtml` from `./html-report.ts` and `readHistory` (already imported? no — history append is imported; add `readHistory`).
- In `writeReport()`: read history **before** `appendHistory` runs, render `report.html` with that history (so the delta section compares against the previous run), then write `report.json`, `report.md`, `report.html` into the target dir. Keep the existing return value (dir). Ensure write failures of the HTML never break the other artifacts (try/catch, best-effort — report.json is the contract).

### `src/cli.ts`
- Add `--no-html` (skip HTML emission — honored by calling a new engine option or by rendering in CLI; prefer engine-side `writeReport(root, report, undefined, { html: false })`-style option) and `--open` (best-effort `xdg-open`/`open`/`start` via spawnSync, ignore failures). Print the HTML path in the default (non-json) summary line.

### `.pi/extensions/agent-readiness/index.ts`
- `/readiness-report` already calls `writeReport`; update the notify message to mention `report.html` (e.g. `Readiness L2 (79.3/100) → .agent-readiness/report.html`).

## Deliverable 3: tests — `test/html-report.test.ts`

Follow the existing test style in `test/` (node:test or whatever `test/engine.test.ts` uses — check and match). Cases:
1. **Contains core content**: render a report (can hand-build a minimal `ReadinessReport` object or run `runReadiness` on a fixture) → HTML contains level, overall, every pillar id, punchlist action text.
2. **Escaping**: finding with `evidence: '<script>alert(1)</script>'` → escaped form present, raw form absent.
3. **No external resources**: assert no `http://` / `https://` in `src=`/`href=` attributes (links to sections `#...` are fine; shields.io badge URLs must NOT appear in the HTML — this report is offline).
4. **First run vs update**: with `history: []` → contains "Baseline"; with one prior entry at lower overall → contains a delta marker (e.g. `+` delta or level-change string) and sparkline path element.
5. **Level lock math**: for a pillars map where P2 <80%, levels ≥L2 (which require P2) render locked; P2/P6 ≥80% unlocks L1/L2 per `LEVEL_GATES`. Assert lock/unlock class names.
6. **Self-contained**: single `<!doctype html>`, exactly one `<style>` block, no `<link` tags.

Run the full suite (`node --experimental-strip-types --test test/` or the project's runner — check how existing tests are invoked) and confirm all pass, including pre-existing tests (writeReport signature change must stay backward-compatible).

## Deliverable 4: browser validation + screenshots (MANDATORY — visual bugs are failures)

The `agent-browser` MCP server is available in this environment. Call it from `fabric_exec` inside a `pi` session as `mcp.agent-browser.<tool>` (e.g. `mcp.agent-browser.agent_browser_open({ url })`). Do NOT declare done from unit tests alone — the report must be visually verified in a real browser.

### Procedure (via fabric_exec)

1. **Generate reports first**: run the CLI on this repo **twice** (first-run + update variants for the "What changed" section) and once on `validation/corpus/high`.
2. **Open**: `await mcp.agent-browser.agent_browser_open({ url: 'file:///abs/path/to/.agent-readiness/report.html' })` — absolute `file://` URLs.
3. **Screenshots** via `mcp.agent-browser.agent_browser_screenshot`:
   - `{ path: '<repo>/.agent-readiness/validate/overview-light.png', fullPage: true }` — full-page light mode.
   - Per-section shots via `selector` (e.g. `'#levels'`, `'#criteria'`) when the full page is too tall to judge.
4. **Dark mode**: force it programmatically — the page must support `html[data-theme="dark"]` (see requirement below), then:
   `await mcp.agent-browser.agent_browser_eval({ script: 'document.documentElement.dataset.theme="dark"' })` → screenshot `overview-dark.png`.
5. **Network hygiene**: `await mcp.agent-browser.agent_browser_eval({ script: 'JSON.stringify(performance.getEntriesByType("resource").map(r => r.name))' })` → assert the result contains only file-internal entries (zero `http`/`https` requests). This is the runtime proof of "self-contained".
6. **Interactions** (verify each; screenshot the interesting ones):
   - Criteria filter chip "Failed" → only failing rows shown.
   - Search box: type a pillar name (e.g. `Security`) → rows filtered.
   - Criterion row click → rationale/evidence expands.
   - Pillar card click → scrolls to criteria table filtered by that pillar.
   - Fix-next copy button (if implemented) → clipboard contains the action text.
7. **Evidence**: save all screenshots under `<repo>/.agent-readiness/validate/` (git-ignored, same family as the report). List them in the final summary / commit message.

### Dark-mode implementation requirement (feeds back into Deliverable 1)

`prefers-color-scheme` cannot be forced reliably from browser automation, so the CSS must support BOTH:
- `@media (prefers-color-scheme: dark)` — OS auto-switch (decision (b): light-first with dark autoswitch), and
- `html[data-theme="dark"]` / `html[data-theme="light"]` overrides — deterministic forcing for validation (and a manual toggle later).

Implement as: light vars on `:root`; dark vars in a ruleset selected by BOTH `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` and `:root[data-theme="dark"]`. Media query wins for autoswitch; attribute wins when set explicitly.

## Deliverable 5: docs

- `skills/agent-readiness/SKILL.md` Phase 5: add `agent-readiness/report.html` to the emitted artifacts list ("markdown + JSON + visual HTML").
- `docs/IMPLEMENTATION_PLAN.md`: append a short section noting the HTML report feature (status done + pointer to `src/html-report.ts`).
- `.pi/extensions/agent-readiness/index.ts` command description (optional small update).
- `README.md`: one line under usage that every run emits a visual HTML report.

## Acceptance ledger (verify all before declaring done)

- [ ] `node --experimental-strip-types src/cli.ts <repo>` writes `.agent-readiness/report.html` alongside report.json/report.md (always, no flag needed).
- [ ] Running it twice produces the "What changed" delta section on the second run; first run shows "Baseline established".
- [ ] HTML opens from `file://` with zero network requests (spot-check: no http(s) sources, no CDN).
- [ ] Level ladder lock states agree with `resolveLevel(pillars)` for the same report.
- [ ] Dark mode renders correctly (flip OS/browser preference; CSS vars only, no JS needed).
- [ ] Hostile evidence strings are escaped.
- [ ] All existing tests pass + new html-report tests pass.
- [ ] `/readiness-report` pi command notify points to the HTML file.
- [ ] Try on this repo AND `validation/corpus/high` (monorepo-ish fixture with rich config).
- [ ] Browser validation complete: report.html opened via `file://`, zero external network requests, screenshots captured (light + dark, full-page + interactions) under `.agent-readiness/validate/`, filter/search/expand interactions verified in-browser.

## Sequence

1. `src/html-report.ts` + `test/html-report.test.ts` (red → green).
2. Wire `engine.ts` `writeReport()`; add CLI flags `--no-html` / `--open`.
3. Update extension notify + docs.
4. Full test suite + **browser validation with screenshots** (Deliverable 4) on this repo and `validation/corpus/high`.
5. Update docs (Deliverable 5, after visual sign-off).

## Non-goals / guardrails

- No new runtime dependencies (keep the zero-dep engine).
- No org-level multi-repo dashboard (single-report page only, history sparkline covers trend).
- No Fix button that executes remediation from the browser — copy-to-clipboard of the action text at most.
- Never write outside `.agent-readiness/` (git-ignored) without user opt-in; default write-safety rules from SKILL.md still apply.
- Keep `report.json` as the stable machine contract; HTML is a rendering of it, nothing reads HTML back.
