# Epic B — Early-stage Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `prd`, `kanban` and `planning` resilient, idempotent and contract-conformant (stories H-04, H-05, H-06).

**Architecture:** No new runtime code. Each SKILL.md gains a step-1 `preflight.js` gate, replaces restated wire strings with citations of `references/contract.md`, and gains persistence (`*.draft.md` for interviews, `docs/kanban/<slug>.run.json` for the kanban run). Vendored `plugins/*/scripts/*.js` and `shared/` are read-only for this epic.

**Tech Stack:** Markdown prompts (SKILL.md), Node ≥18 shared scripts invoked as `node "${CLAUDE_PLUGIN_ROOT}/scripts/<name>.js"`, `gh` CLI, Atlassian MCP.

**Spec:** `docs/superpowers/specs/2026-09-08-hardening-program-design.md` (stories H-04, H-05, H-06; Decisions 1–5, 8).

## Global Constraints

- Work only in the worktree `/Users/jaxsonmansouri/Desktop/Projects/shipyard/.claude/worktrees/harden-early` on branch `feat/harden-early`. Never push. Never `git stash`.
- Do **not** edit `shared/` or `plugins/*/scripts/*.js` or any `references/contract.md` (generated copies).
- SKILL.md files are prompts: numbered short steps, one explicit script invocation per precondition, verbatim wire strings cited from `references/contract.md` §N rather than restated. **No skill may grow beyond ~130% of its current line count.** Current: `writing-prds` 88, `creating-tickets` 212, `speccing-tickets` 160, `planning-tickets` 151. Cut restated material to make room.
- `commands/*.md` stay thin — they point at the skill; do not move logic into them.
- Bump `version` `1.0.0` → `1.1.0` in the edited plugin's `.claude-plugin/plugin.json`.
- Stage `README.md` with every commit that stages `plugins/` (pre-commit hook enforces it, and H-05/Decision 8 require README changes anyway).
- Script invocation form inside skills is always `node "${CLAUDE_PLUGIN_ROOT}/scripts/<name>.js" …`, and every invocation is followed by a sentence stating how to interpret its exit code and JSON.
- `preflight.js` contract, verified: prints a JSON report on stdout and human-readable reasons on stderr; **exit 0** = all error-level checks passed; **exit 1** = one or more failed (the failures are in `.reasons[]`, and each check is `{id, ok, level, message, skipped}`); **exit 2** = usage error.
- `config.js` contract, verified: `bootstrap <kanban|ship> --backend <github|jira> --target <o/r|KEY>` creates the file if absent and never overwrites; `validate [kanban|ship]` exits 0 ok / 1 invalid or missing / 2 usage; `show [kanban|ship]` prints the normalized config as JSON.
- `validate-artifact.js spec|plan <path>` exits 0 valid / 1 missing sections (listed on stderr; `--json` for the full report) / 2 usage.
- `metrics.js now` prints ISO-8601 UTC; `metrics.js footer --stage <s> --started <iso> [--finished <iso>]` prints the contract §10 footer line. **GitHub only** — Jira comments never carry a footer (contract §2, §10).
- One commit per task, conventional subject.

---

### Task 1: H-04 — prd resilience

**Files:**
- Modify: `plugins/prd/skills/writing-prds/SKILL.md` (88 lines → ≤115)
- Modify: `plugins/prd/.claude-plugin/plugin.json` (version → `1.1.0`)
- Modify: `README.md` (prd usage paragraph, lines ~90–98)

**Interfaces:**
- Produces: the draft file convention `docs/prd/<slug>.draft.md`, reused by Task 3's spec interview (which uses `docs/ship/<id>/spec.draft.md`).

- [x] **Step 1: Add Step 0 preflight to the skill**

Insert as the first numbered step, before any interview question:

```markdown
## Step 1: Preflight

Run before asking anything:

    node "${CLAUDE_PLUGIN_ROOT}/scripts/preflight.js" --stage prd

Exit 0 → continue. Exit 1 → print the `reasons` array from the JSON verbatim,
tell the user how to fix them (usually `gh auth login`, or running inside a
git repository), and stop. Exit 2 → report the usage error and stop.
```

- [x] **Step 2: Add slug derivation + overwrite refusal**

After preflight, before the interview: derive the slug as `YYYY-MM-DD-<kebab-slug>` early enough to name the draft. Add:

```markdown
## Step 2: Slug and existing-PRD check

Derive today's date and a short kebab-case slug from the idea; the PRD path
is `docs/prd/<YYYY-MM-DD>-<slug>.md` (contract §13).

- If that file already exists, **stop and ask** which the user wants:
  **revise** it (read it in as the starting draft), **write a new slug**
  (they supply it), or **abort**. Never overwrite an existing PRD without an
  explicit answer.
- If `docs/prd/<YYYY-MM-DD>-<slug>.draft.md` exists, an earlier interview was
  interrupted: show the answers captured so far and ask whether to **resume**
  from the next unanswered area or **start over** (deleting the draft).
```

- [x] **Step 3: Add per-turn draft persistence**

Add to the interview rules section, replacing nothing:

```markdown
- **After every answer**, before asking the next question, write the
  answers so far to `docs/prd/<YYYY-MM-DD>-<slug>.draft.md` — the PRD
  template with only the sections answered so far filled in, plus a final
  `<!-- prd-draft: next=<area> -->` line naming the next unanswered area.
  This file is the resume point; it is not committed.
```

- [x] **Step 4: Add commit offer and draft cleanup to the handoff**

In the "Writing the PRD" / "Handoff" sections:

```markdown
When the PRD is written, delete the `.draft.md` file, then **offer to
commit** (do not commit unasked):

    git add docs/prd/<YYYY-MM-DD>-<slug>.md
    git commit docs/prd/<YYYY-MM-DD>-<slug>.md -m "docs(prd): <slug>"

Commit only that path — the user's tree may be dirty.
```

- [x] **Step 5: Cut to fit the budget**

Trim the skill so it stays ≤115 lines: the PRD template block stays verbatim (it is the output shape), but collapse prose in "Interview rules" and "Interview sequence" that restates itself. Verify with `wc -l plugins/prd/skills/writing-prds/SKILL.md`.

- [x] **Step 6: README + version**

Add to README's `/prd` paragraph: draft persistence to `docs/prd/<slug>.draft.md` with resume on the next run, refusal to overwrite an existing PRD, and the commit offer. Bump `plugins/prd/.claude-plugin/plugin.json` version to `1.1.0`.

- [x] **Step 7: Verify**

Run: `claude plugin validate .`
Expected: passes, 0 warnings.

- [x] **Step 8: Commit**

```bash
git add plugins/prd README.md
git commit -m "feat(prd): draft persistence, overwrite refusal, preflight gate"
```

---

### Task 2: H-05 — kanban idempotency and preflight

**Files:**
- Modify: `plugins/kanban/skills/creating-tickets/SKILL.md` (212 → ≤275)
- Create: `plugins/kanban/skills/creating-tickets/references/run-manifest.md`
- Modify: `plugins/kanban/skills/creating-tickets/references/github.md`
- Modify: `plugins/kanban/skills/creating-tickets/references/jira.md`
- Modify: `plugins/kanban/.claude-plugin/plugin.json` (version → `1.1.0`)
- Modify: `README.md` (kanban usage paragraph, lines ~100–111)

**Interfaces:**
- Produces: `docs/kanban/<slug>.run.json`, schema below. No other plugin reads it in this epic.

- [x] **Step 1: Replace Step 1 (config check) with preflight + config.js**

Replace the whole hand-rolled config-writing section with:

```markdown
## Step 1: Preflight

    node "${CLAUDE_PLUGIN_ROOT}/scripts/preflight.js" --stage kanban

Exit 0 → continue to Step 2. Exit 2 → usage error, stop.

Exit 1 → read the JSON `reasons` array. If the only failure is the `config`
check (id `config`), bootstrap the config: ask the user, one question at a
time, which backend (`github` or `jira`) and the target (`owner/repo`, or the
Jira project key), then run

    node "${CLAUDE_PLUGIN_ROOT}/scripts/config.js" bootstrap kanban --backend <github|jira> --target <o/r|KEY>

(it normalizes `target` and stamps `"version": 1`; it never overwrites an
existing file), and re-run preflight. Any other failure → print the reasons
verbatim and stop.

Read the resulting config with

    node "${CLAUDE_PLUGIN_ROOT}/scripts/config.js" show kanban

`backend` and `target` from that JSON drive every later step. The config
schema is contract §12.1 — do not invent keys.
```

- [x] **Step 2: Write the run-manifest reference**

Create `references/run-manifest.md` containing exactly this schema and reconciliation rules:

````markdown
# Run manifest — `docs/kanban/<slug>.run.json`

One file per PRD slug. Written after the proposal is approved and **re-written
after every single create attempt**, so a run killed mid-flight is resumable.

```json
{
  "version": 1,
  "slug": "2026-07-20-reef-tank",
  "prdPath": "docs/prd/2026-07-20-reef-tank.md",
  "backend": "github",
  "target": "owner/repo",
  "startedAt": "2026-09-08T12:00:00Z",
  "updatedAt": "2026-09-08T12:04:11Z",
  "tickets": [
    {
      "index": 1,
      "title": "User can create a water-parameter log entry",
      "body": "## Description\n…\nSource PRD: 2026-07-20-reef-tank",
      "dependsOn": [2, "#45"],
      "state": "created",
      "ref": "#12",
      "url": "https://github.com/owner/repo/issues/12",
      "error": null,
      "createdAt": "2026-09-08T12:03:02Z"
    }
  ],
  "deferred": [
    { "index": 16, "title": "…", "summary": "one line" }
  ]
}
```

| Field | Meaning |
|---|---|
| `version` | Manifest schema version, integer `1`. |
| `slug` | The `Source PRD:` slug (contract §13). Matches the filename. |
| `prdPath` | Path read, or `null` when the PRD was pasted as raw text. |
| `backend`, `target` | Copied from `.claude/kanban.config.json` at run start. A re-run whose config disagrees stops and asks. |
| `tickets[].index` | 1-based position in the approved proposal; stable across re-runs. |
| `tickets[].body` | The full ticket body as approved, with `Depends on:` refs unresolved (same-run refs left as `Depends on: <index>`). Lets a re-run recreate without re-interviewing. |
| `tickets[].dependsOn` | Integers = same-run proposal indexes; strings = real board refs. |
| `tickets[].state` | `pending` \| `created` \| `failed` \| `skipped` \| `deferred`. |
| `tickets[].ref` | `#<number>` (GitHub) or issue key (Jira) once created, else `null`. |
| `tickets[].url` | Absolute URL once created, else `null`. |
| `tickets[].error` | Verbatim failure reason for `failed`; the blocking dependency's title for `skipped`; else `null`. |
| `deferred[]` | Slices beyond the 15-per-run cap, kept as title + one-line summary only. |

**Timestamps** come from `node "${CLAUDE_PLUGIN_ROOT}/scripts/metrics.js" now`.

## Reconciling on a re-run

1. If `docs/kanban/<slug>.run.json` exists, load it before proposing anything.
2. Every ticket with `state: "created"` and a non-null `ref`: confirm it still
   exists on the board ("Verify a ticket exists" in the backend reference).
   Confirmed → report it under **Already exists** and never re-create it.
   Gone (deleted on the board) → set `state` back to `pending` and say so.
3. Tickets in `pending`, `failed` or `skipped` are the remaining work; they
   keep their `index`, `title` and `body`.
4. `deferred[]` entries are offered as the next batch once nothing is pending.
5. The manifest is the authority. The `Source PRD:` body scan (Step 4) is the
   backstop for tickets created before the manifest existed, or created by
   someone else.
````

- [x] **Step 3: Rewrite Step 3's cap and dependency verification**

In the proposal step, add:

```markdown
**Cap: at most 15 slices per run.** If the PRD yields more, propose the first
15 (earliest phases first, respecting dependencies) and list the remainder as
a **deferred batch** — title plus one line each — recorded in the manifest's
`deferred[]`. Tell the user they get a second `/kanban <same PRD>` run for
them once the first batch exists.

**Verify each existing-ticket dependency as you propose it** — not at the
gate. Before putting `Depends on: <ref>` on a slice, run the backend
reference's "Verify a ticket exists" for that ref. A ref that fails
verification is never proposed: say so in the proposal line and either drop
the link or ask the user for the right ref.
```

Remove the now-duplicated verification sentence from Step 5 (approval gate), leaving the gate to cover only refs the *user* adds at the gate.

- [x] **Step 4: Rewrite Step 4 as client-side duplicate detection**

```markdown
## Step 4: Duplicate check (client-side)

Two sources, in order:

1. **The run manifest** — `docs/kanban/<slug>.run.json`. If it exists, follow
   `references/run-manifest.md` "Reconciling on a re-run".
2. **The board** — list tickets from the backend reference ("List tickets for
   duplicate detection") and filter **locally in the fetched JSON** for a body
   line exactly equal to `Source PRD: <slug>` (contract §13).

   Never push this string into a search qualifier. `in:body` on GitHub and
   JQL `text ~` on Jira both tokenize on the colon and return wrong results —
   fetch, then match the literal line yourself.

Report matches as an **Already exists** list (title + link) and ask the user
to confirm before creating anything else. Never silently skip and never
silently duplicate.
```

- [x] **Step 5: Rewrite Step 6 (create) for manifest writes and rate limiting**

```markdown
## Step 6: Create tickets

Write the manifest (`references/run-manifest.md`) with every approved slice as
`state: "pending"` **before the first create**.

Create **sequentially**, one ticket at a time, in dependency order — never in
parallel; concurrent creates trip GitHub's secondary rate limit. After each
attempt, update that ticket's entry (`state`, `ref`, `url`, `error`,
`createdAt`) and `updatedAt`, and **rewrite the manifest file** before the
next create. A run killed at any point is resumable from what is on disk.

- Skip any ticket already `state: "created"` — it exists.
- Success → record `ref` and `url`, and substitute the real ref into the
  `Depends on:` lines of its dependents before creating them.
- Failure whose error names a **secondary rate limit** or asks you to retry →
  wait 60 seconds and retry **once**. A second failure is a real failure.
- Any other failure → `state: "failed"`, record the verbatim error, continue
  with unrelated tickets.
- A ticket whose dependency failed → `state: "skipped"` with the blocking
  title in `error`; do not create it or its transitive dependents.
```

- [x] **Step 6: Update Step 7 (summary)**

Add an `Already exists (<n>)` list to the three existing lists, and replace the closing paragraph:

```markdown
Re-running `/kanban` with the same PRD is safe: the run manifest is the
resume point — already-created tickets are reported under **Already exists**
and never re-created, and only `pending`, `failed` and `skipped` tickets are
attempted.
```

- [x] **Step 7: Update the backend references**

In `references/github.md`, replace the "Search for duplicates" section with:

````markdown
## List tickets for duplicate detection (Step 4 of SKILL.md)

```bash
gh issue list --repo <owner/repo> --state all --limit 500 --json number,title,url,body
```

Filter the returned JSON **locally** for issues whose body contains a line
exactly `Source PRD: <slug>`. Do not put that string in `--search` with
`in:body` — GitHub's search tokenizes on the colon and the result is wrong.
````

In `references/jira.md`, replace the JQL `text ~ "Source PRD: …"` search with a project-scoped fetch plus a local scan of each `description` for the literal line, with the same warning. Leave both files' create / list-open / verify sections otherwise unchanged.

- [x] **Step 8: Cut to fit and check line budget**

Run: `wc -l plugins/kanban/skills/creating-tickets/SKILL.md`
Expected: ≤ 275. Cut restated ticket-template prose and the long INVEST explanation to fit.

- [x] **Step 9: README + version**

In README's kanban paragraph, state the **config side effect** explicitly: the first run in a project writes `.claude/kanban.config.json` (bootstrapped by the shared `config.js`) and offers to commit it. Also state the 15-slice cap, the run manifest at `docs/kanban/<slug>.run.json`, and that re-running is idempotent. Bump `plugins/kanban/.claude-plugin/plugin.json` to `1.1.0`.

- [ ] **Step 10: Verify**

Run: `claude plugin validate .`
Expected: passes.

Then the **narration check**: dispatch a fresh sonnet subagent given ONLY `plugins/kanban/skills/creating-tickets/SKILL.md`, `references/run-manifest.md`, and `docs/contract.md`, asked to narrate a re-run of `/kanban` after a failure at ticket 7 of 12. It must describe loading the manifest, verifying and skipping tickets 1–6 as **Already exists**, and resuming at 7.

- [x] **Step 11: Commit**

```bash
git add plugins/kanban README.md
git commit -m "feat(kanban): run manifest, client-side dedupe, preflight and rate-limit handling"
```

---

### Task 3: H-06 — planning consistency

**Files:**
- Modify: `plugins/planning/skills/speccing-tickets/SKILL.md` (160 → ≤208)
- Modify: `plugins/planning/skills/planning-tickets/SKILL.md` (151 → ≤196)
- Modify: `plugins/planning/references/github.md`
- Modify: `plugins/planning/references/jira.md`
- Modify: `plugins/planning/.claude-plugin/plugin.json` (version → `1.1.0`)
- Modify: `README.md` (planning usage paragraphs, lines ~113–131)

**Interfaces:**
- Consumes: the draft-file convention from Task 1.
- Produces: comments matching contract §5.1 and §5.2 exactly; both are read by `board-trail.js`.

- [ ] **Step 1: Replace Step 1 of both skills with preflight + config.js**

Both skills get the same Step 1, `--stage spec` in speccing and `--stage plan` in planning:

```markdown
## Step 1: Preflight and ticket

    node "${CLAUDE_PLUGIN_ROOT}/scripts/preflight.js" --stage spec

Exit 0 → continue. Exit 2 → usage error, stop.

Exit 1 → if the only failing check is `config`, bootstrap it (ask backend and
target, one question at a time, then
`node "${CLAUDE_PLUGIN_ROOT}/scripts/config.js" bootstrap kanban --backend <b> --target <t>`)
and re-run preflight; otherwise print the `reasons` verbatim and stop.

Read the config with `node "${CLAUDE_PLUGIN_ROOT}/scripts/config.js" show kanban`
(schema: contract §12.1). Then resolve the user's ticket reference to the
canonical `<id>` per the backend reference, and fetch the ticket. Fetch
failure → report the exact error and stop.
```

Also record the stage start for the footer:

```markdown
Capture the stage start now — it goes in the comment's metrics footer:

    node "${CLAUDE_PLUGIN_ROOT}/scripts/metrics.js" now
```

- [ ] **Step 2: Delete the self-model-detection step from planning-tickets**

Replace the whole of `## Step 3: Model check` with an unconditional recommendation (no attempt to detect the running model — a session cannot reliably read its own model):

```markdown
## Step 3: Model recommendation

This session is judgment-heavy: architecture trade-offs and security scrutiny
are where a frontier model earns its cost. Recommend, once and without
checking anything, that the user run `/plan <id>` on Fable or Opus (`/model`).
This is a recommendation, not a gate — continue if they say to.
```

- [ ] **Step 3: PRD glob behavior in speccing Step 3**

Replace the one-line PRD lookup with:

```markdown
- If the ticket body has a `Source PRD: <slug>` line (contract §13), glob
  `docs/prd/*<slug>*.md`:
  - **exactly 1 match** → read it;
  - **0 matches** → say the PRD named by the ticket is missing, and continue
    the interview without it (the ticket body is then the only source);
  - **>1 match** → list the matches and ask the user which one; never guess.
```

- [ ] **Step 4: Spec draft persistence**

Add to speccing's interview step:

```markdown
- **After every answer**, write the spec sections filled so far to
  `docs/ship/<id>/spec.draft.md`, ending with `<!-- spec-draft: next=<section> -->`.
  On entry (Step 2), if that file exists, offer to **resume** from the named
  section or **start over**. Delete it when `spec.md` is written. It is never
  committed.
```

Add `spec.draft.md` handling to Step 2's existing-artifact branch so the two cases do not collide: `spec.md` exists → revise / finish board updates / abort (unchanged); only `spec.draft.md` exists → resume / start over.

- [ ] **Step 5: `validate-artifact.js` gate before the commit in both skills**

In each skill's Step 7 "Land", before `git add`:

```markdown
1. Write the artifact, then validate it against contract §13 before committing:

       node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-artifact.js" spec docs/ship/<id>/spec.md

   Exit 0 → commit. Exit 1 → the missing or renamed sections are printed on
   stderr; fix the file and re-run. Never commit an artifact that fails this
   gate — downstream fix-list and progress parsing depend on the exact
   headings.
```

(`plan docs/ship/<id>/plan.md` in the planning skill.)

- [ ] **Step 6: Contract-shaped approval comments with footers**

Replace the comment block in speccing's Step 7 with:

````markdown
3. Build the comment. Its **first line is the header** `ship:spec approved`
   and the emoji title moves to line two — the exact shape is contract §5.1;
   copy it from there rather than from memory.

   On the **GitHub backend only**, append the metrics footer as the last line
   (contract §10; Jira comments carry none):

       node "${CLAUDE_PLUGIN_ROOT}/scripts/metrics.js" footer --stage spec --started <the ISO time from Step 1> --finished "$(node "${CLAUDE_PLUGIN_ROOT}/scripts/metrics.js" now)"

   Nothing hand-writes that line. Post the file via the backend reference.
````

The planning skill gets the same block with `ship:plan approved` / contract §5.2 / `--stage plan`.

- [ ] **Step 7: Status ladder cited, not restated**

In both skills, replace every hardcoded status/label name in prose with a citation: "Set status → `Spec'd` via the backend reference; the ladder, its labels, colours and descriptions are contract §4." Step 2's "already past this stage" check cites §4's ordering instead of listing `Planned`/`ship:planned`/`ship-planned` variants.

- [ ] **Step 8: Static label descriptions and contract alignment in `references/github.md`**

Replace the two `gh label create` lines whose `--description` interpolates `<id>` with the **static** descriptions from contract §4 (they must be byte-identical to the table, and a label description is repo-global — it cannot name one ticket):

```bash
gh label create "ship:specced" --repo <owner/repo> --color "1D76DB" --description "Spec approved — see docs/ship/<id>/spec.md" --force
```

becomes the contract §4 row's description verbatim, with no per-ticket substitution. Add one line above the block: "Colours and descriptions are contract §4 — copy them from `references/contract.md`, never retype them." Remove the status→label mapping sentence in favour of the same citation; keep only the GitHub-specific commands (auth check, fetch, edit body, add/remove label, post comment).

- [ ] **Step 9: Align `references/jira.md` with the contract**

Delete the restated status-name variant list ("Spec'd"/"Specced"/"Spec", "Planned"/"Planning done") and the hyphenated fallback label names; replace with: "Match the workflow status and, when nothing matches, fall back to the hyphenated labels — both maps are contract §4 (Jira equivalent). Never silently fail and never skip the user-facing explanation." Add: "Jira comments carry no metrics footer (contract §2, §10)." Keep only the MCP tool calls.

- [ ] **Step 10: Line budgets**

Run: `wc -l plugins/planning/skills/*/SKILL.md`
Expected: speccing ≤ 208, planning ≤ 196. Cut restated backend prose to fit.

- [ ] **Step 11: README + version**

Update the `/spec` and `/plan` paragraphs: spec-interview draft persistence and resume, the `validate-artifact.js` gate before commit, and that both post a contract-shaped `ship:spec approved` / `ship:plan approved` comment with a metrics footer on GitHub. Bump `plugins/planning/.claude-plugin/plugin.json` to `1.1.0`.

- [ ] **Step 12: Verify**

Run: `claude plugin validate .`
Expected: passes.

- [ ] **Step 13: Commit**

```bash
git add plugins/planning README.md
git commit -m "feat(planning): preflight, contract-shaped approvals, artifact gate, draft resume"
```

---

### Task 4: Adversarial review

- [ ] **Step 1: Dispatch the refuter**

Give an opus `refuter` subagent `git diff main...feat/harden-early` and the H-04/H-05/H-06 acceptance criteria from the spec. Ask it to find the input that breaks the change — a re-run path that duplicates tickets, a wire string that drifted from the contract, a skill that grew past budget, a citation pointing at the wrong section.

- [ ] **Step 2: Fix what is real**

Fix genuine findings; record dismissed ones with a reason. Re-run `claude plugin validate .` and the H-05 narration check if the kanban skill changed.

- [ ] **Step 3: Commit fixes**

```bash
git add -A
git commit -m "fix: refuter findings on early-stage hardening"
```
