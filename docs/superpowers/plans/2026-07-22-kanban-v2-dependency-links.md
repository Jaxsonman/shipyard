# Kanban v2 — Dependency Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tickets created by `/kanban` carry machine-readable `Depends on:` body lines so `/ship` can later compute execution waves.

**Architecture:** Body-text-only change to the `kanban` plugin's skill and backend reference files. Dependencies are proposed during PRD breakdown (same-run siblings by list position, existing board tickets by real ref), approved at the existing gate, and resolved to real issue numbers/keys by creating tickets in dependency order. No new backend mechanics.

**Tech Stack:** Markdown skill files only — no code. Backends: GitHub (`gh` CLI) and Jira (Atlassian MCP).

**Spec:** `docs/superpowers/specs/2026-07-22-kanban-v2-dependency-links-design.md`

## Global Constraints

- Skills never talk to GitHub/Jira directly; all backend commands live in `references/github.md` / `references/jira.md`.
- Parse contract (stable interface for `/ship`): any body line matching `Depends on: <ref>` declares exactly one dependency. One line per dependency — never comma-separated.
- Refs: `#<number>` on GitHub, issue key (e.g. `PROJ-12`) on Jira.
- `Depends on:` lines sit in the template footer above `Source PRD:`, and are emitted only when a ticket has dependencies.
- Repo hook: any commit staging files under `plugins/` is blocked unless `README.md` is staged with a real change in the same commit. Every task's commit therefore includes its stated README edit.
- Match the existing prose style of SKILL.md and the reference files (short imperative sections, fenced examples).

---

### Task 1: Backend reference files — "List open tickets" command

**Files:**
- Modify: `plugins/kanban/skills/creating-tickets/references/github.md` (append after the "Create a ticket" section)
- Modify: `plugins/kanban/skills/creating-tickets/references/jira.md` (append after the "Create a ticket" section)
- Modify: `README.md:70` (kanban row of the pipeline stage table)

**Interfaces:**
- Produces: a section titled exactly `## List open tickets (Step 3 of SKILL.md)` in each reference file. Task 2's SKILL.md text refers to sections by this exact title.

- [ ] **Step 1: Append the section to `references/github.md`**

Append to the end of the file:

```markdown

## List open tickets (Step 3 of SKILL.md)

```bash
gh issue list --repo <owner/repo> --state open --json number,title
```

Parse the JSON array; each entry's `number` is the ref (`#<number>`) used
in `Depends on:` lines, and the titles are what Step 3 scans when deciding
whether a new slice plausibly builds on existing work.
```

(The inner fence is bash inside the markdown file, matching the file's existing style.)

- [ ] **Step 2: Append the section to `references/jira.md`**

Append to the end of the file:

```markdown

## List open tickets (Step 3 of SKILL.md)

Call `mcp__plugin_kanban_atlassian__searchJiraIssuesUsingJql` with:

```json
{
  "jql": "project = \"<TARGET>\" AND statusCategory != Done"
}
```

Each returned issue's key (e.g. `PROJ-12`) is the ref used in
`Depends on:` lines, and the summaries are what Step 3 scans when deciding
whether a new slice plausibly builds on existing work.
```

- [ ] **Step 3: Update the README stage table row**

In `README.md`, change line 70:

```markdown
| 2 | `kanban` | ✅ Available | Turn a PRD into tickets on a board |
```

to:

```markdown
| 2 | `kanban` | ✅ Available | Turn a PRD into dependency-linked tickets on a board |
```

- [ ] **Step 4: Verify**

Run:

```bash
grep -c "^## List open tickets (Step 3 of SKILL.md)" \
  plugins/kanban/skills/creating-tickets/references/github.md \
  plugins/kanban/skills/creating-tickets/references/jira.md
grep -n "dependency-linked" README.md
```

Expected: `1` for each reference file; one README match on the stage-table line.

- [ ] **Step 5: Commit**

```bash
git add plugins/kanban/skills/creating-tickets/references/github.md \
        plugins/kanban/skills/creating-tickets/references/jira.md README.md
git commit -m "feat(kanban): add list-open-tickets command to backend refs"
```

---

### Task 2: SKILL.md — dependency links through the whole flow

**Files:**
- Modify: `plugins/kanban/skills/creating-tickets/SKILL.md` (Steps 3, 5, 6, 7 and the ticket template)
- Modify: `README.md:94-97` (kanban usage paragraph)

**Interfaces:**
- Consumes: the `## List open tickets (Step 3 of SKILL.md)` sections created in Task 1 — referred to by exactly that name.
- Produces: the `Depends on: <ref>` parse contract documented in SKILL.md (what the future `/ship` plugin will parse).

- [ ] **Step 1: Add dependency rules to Step 3's decomposition guidance**

In `SKILL.md`, directly after the INVEST bullet list (the `- **Testable** — …` line) and before "For each slice, write a ticket using this exact template:", insert:

```markdown
Slices may depend on each other, but only where genuinely required —
independence remains the goal, and a dependency is the documented
exception, not the norm. A ticket may depend on:

- **A same-run sibling** — refer to it by its number in the proposed
  list; it is resolved to the real ticket ref at creation time (Step 6).
- **An existing board ticket** — before proposing the list, query the
  board once for open tickets (read "List open tickets" in
  `references/github.md` or `references/jira.md`, whichever matches
  `config.backend`) and, where a slice plausibly builds on one, propose
  that link using its real ref.

Reject cyclic dependencies at proposal time — if two slices each depend
on the other, re-slice until the graph is acyclic.
```

- [ ] **Step 2: Extend the ticket template footer**

In the Step 3 ticket template, change:

```markdown
---
Source PRD: <slug from Step 2>
```

to:

```markdown
---
Depends on: <ref>
Source PRD: <slug from Step 2>
```

and directly after the template's closing fence, insert:

```markdown
`Depends on:` lines appear only when the ticket has dependencies — one
line per dependency, never comma-separated. `<ref>` is `#<number>` on
GitHub or the issue key (e.g. `PROJ-12`) on Jira.

**Parse contract:** any body line matching `Depends on: <ref>` declares
exactly one dependency. Downstream tooling (`/ship`) parses precisely
this shape — do not vary it.
```

- [ ] **Step 3: Show dependencies in the proposed-list example**

In the Step 3 example block, change:

```markdown
2. User can view their log history
   ...
```

to:

```markdown
2. User can view their log history
   ...
3. User can filter log history — depends on: 2, #45 (existing)
   ...
```

and directly after the example's closing fence, insert:

```markdown
Annotate each dependent ticket's line with `depends on:` — same-run
siblings by their list number, existing board tickets by their real ref
plus an `(existing)` marker.
```

- [ ] **Step 4: Extend the Step 5 approval gate**

Append to the end of the Step 5 paragraph (after "Do not create anything before this gate."):

```markdown
This gate is also where the user adds, removes, or edits dependency
links. Verify that any existing board ticket named as a dependency
actually exists (fetch it from the board); a ref that fails verification
is reported here and must be fixed or removed by the user before
creation starts — never guessed at or silently dropped.
```

- [ ] **Step 5: Rewrite Step 6 for dependency-ordered creation**

In Step 6, after the sentence ending "— do not stop the whole run on one failure.", insert:

```markdown
Create tickets in dependency order — every ticket after the tickets it
depends on; ties keep the proposed-list order. As each ticket is
created, record its real number/key and substitute it into the
`Depends on:` lines of its dependents before creating them.

If a ticket fails to create, do **not** create its dependents (or their
dependents, transitively) — a dependent created without its
`Depends on:` line would let downstream tooling start it too early.
Record each one as skipped and continue best-effort with unrelated
tickets.
```

- [ ] **Step 6: Add the Skipped list to Step 7**

In the Step 7 report template, change:

```markdown
Failed (<n>):
- <title> — <error reason>
```

to:

```markdown
Failed (<n>):
- <title> — <error reason>

Skipped (<n>):
- <title> — dependency failed to create: <failed dep title>
```

and in the closing paragraph, change "re-running is safe because Step 4's duplicate check will catch tickets that already succeeded." to:

```markdown
re-running is safe because Step 4's duplicate check will catch tickets
that already succeeded, and the retry creates the failed and skipped
remainder with correct `Depends on:` refs.
```

- [ ] **Step 7: Update the README usage paragraph**

In `README.md`, change the kanban usage paragraph (lines 94–97):

```markdown
The first run in a project asks once which board to use (GitHub or Jira)
and where, then Claude proposes a full breakdown of small, vertical-slice
tickets — each one a single outcome a human can verify end-to-end. Approve
the list and Claude creates the tickets on your board.
```

to:

```markdown
The first run in a project asks once which board to use (GitHub or Jira)
and where, then Claude proposes a full breakdown of small, vertical-slice
tickets — each one a single outcome a human can verify end-to-end, with
`Depends on:` links where one slice genuinely requires another. Approve
the list and Claude creates the tickets on your board in dependency
order.
```

- [ ] **Step 8: Verify — coherence read-through and grep checks**

Run:

```bash
grep -n "Depends on:" plugins/kanban/skills/creating-tickets/SKILL.md
grep -n "List open tickets" plugins/kanban/skills/creating-tickets/SKILL.md
grep -n "Skipped" plugins/kanban/skills/creating-tickets/SKILL.md
```

Expected: template footer + parse-contract + Step 6 substitution mentions; one Step 3 pointer at the reference sections; the Step 7 Skipped list. Then read the full modified SKILL.md top to bottom and confirm every spec requirement maps to a step (format, sibling + existing deps, board query, cycle rejection, gate verification, topological creation with substitution, transitive skip, Skipped report) and no section contradicts another.

- [ ] **Step 9: Commit**

```bash
git add plugins/kanban/skills/creating-tickets/SKILL.md README.md
git commit -m "feat(kanban): emit Depends on links at ticket creation"
```

---

## Final verification (manual, from the spec)

Scenario against a scratch GitHub repo — run after both tasks land:

1. `/kanban` on a PRD yielding at least one dependent slice and one dep on a pre-existing board ticket; approve.
2. Created dependents' bodies contain `Depends on:` lines with real refs; independent tickets have none.
3. Creation order respected dependencies.
4. A nonexistent existing-ticket ref named at the gate is caught before anything is created.
5. A forced creation failure (archive the scratch repo mid-run) skips the failed ticket's dependents and lists them in the summary.
6. Re-running `/kanban` with the same PRD reports survivors via the duplicate check and completes the graph.
