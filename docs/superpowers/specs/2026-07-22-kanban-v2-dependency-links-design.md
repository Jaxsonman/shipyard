# Kanban v2 — Dependency Links

**Date:** 2026-07-22
**Status:** Approved
**Parent:** [Feature Pipeline architecture](2026-07-22-feature-pipeline-architecture-design.md), Build Order #1.

## Purpose

Extend the `kanban` plugin so tickets carry machine-readable dependency
links from the moment they are created. This is what lets `/ship` later
compute waves: a ticket is eligible to run only when everything it depends
on has landed. The change is body-text only — no new backend mechanics.

## Dependency format (the contract)

A ticket declares a dependency with a body line, one line per dependency,
in the template footer above `Source PRD:`:

```
---
Depends on: #12
Depends on: #13
Source PRD: <slug>
```

- GitHub refs are `#<number>`; Jira refs are the issue key (`PROJ-12`).
- Lines are emitted only when the ticket has dependencies.
- **Parse contract:** any body line matching `Depends on: <ref>` declares
  one dependency. This is a stable interface — `/ship` and any future
  consumer parse exactly this, so its shape must not change casually.

Native link APIs (Jira issue links, GitHub GraphQL issue dependencies) are
deliberately not used: one uniform format, parsed identically on both
backends, greppable, and visible to humans reading the ticket.

## What can be depended on

Both are supported:

- **Same-run siblings** — tickets from the same `/kanban` breakdown.
  Referenced by list position during proposal; resolved to real
  numbers/keys at creation time (see Creation order).
- **Existing board tickets** — referenced by their real number/key.

## Breakdown changes (SKILL.md Step 3)

1. While decomposing the PRD into slices, assign dependencies between
   slices **only where genuinely required**. INVEST independence remains
   the goal; a dependency is the documented exception, not the norm.
2. Query the board once for open tickets (new per-backend command, see
   Reference file updates) and, where a slice plausibly builds on an
   existing ticket, propose that link too.
3. Reject cyclic dependencies at proposal time — re-slice until the graph
   is acyclic.
4. Show dependencies inline in the proposed list, e.g.:

   ```
   3. User can filter log history — depends on: 2, #45 (existing)
   ```

   Same-run deps use the list position; existing tickets use their real
   ref plus an `(existing)` marker.

## Approval gate changes (SKILL.md Step 5)

The existing gate is also where the user adds, removes, or edits
dependency links. Any existing ticket the user names by hand is verified
to exist on the board before creation proceeds. A ref that fails
verification is not a skip case — it is reported at the gate, and the user
fixes or removes the link before creation starts (the human is in the
room; nothing is guessed).

## Creation changes (SKILL.md Step 6)

1. Create tickets in dependency order (topological sort; ties keep list
   order).
2. As each ticket is created, record its real number/key and substitute it
   into dependents' bodies before those are created.
3. If a ticket fails to create, its transitive dependents are **not**
   created. Best-effort creation continues for unrelated tickets.

## Summary changes (SKILL.md Step 7)

The report gains a third list:

```
Skipped (<n>):
- <title> — dependency failed to create: <failed dep title>
```

Re-running `/kanban` after a partial failure is safe: the Step 4 duplicate
check finds already-created tickets, and the retry creates the remainder
with correct links.

## Reference file updates

Each backend reference gains one "list open tickets" command; create and
duplicate-search mechanics are unchanged.

- `references/github.md`:

  ```bash
  gh issue list --repo <owner/repo> --state open --json number,title
  ```

- `references/jira.md`: `searchJiraIssuesUsingJql` with
  `project = "<TARGET>" AND statusCategory != Done`.

## Out of scope

- Native link APIs (Jira issue links, GitHub GraphQL dependencies).
- Editing dependencies on tickets after creation.
- Cross-repo / cross-project dependencies.
- Wave computation itself — that is `/ship`'s job; this deliverable only
  guarantees the links exist and are parseable.

## Verification

Manual scenario against a scratch GitHub repo:

1. Run `/kanban` on a PRD that yields at least one dependent slice and one
   dep on a pre-existing board ticket; approve.
2. Confirm created tickets: dependents' bodies contain `Depends on:` lines
   with real refs; independent tickets have none.
3. Confirm creation order respected dependencies.
4. Name a nonexistent existing ticket as a dep at the gate; confirm the
   verification catches it before anything is created.
5. Force a creation failure — archive the scratch repo mid-run (archived
   repos reject new issues) — and confirm the failed ticket's dependents
   are skipped and listed in the summary.
6. Re-run `/kanban` with the same PRD; confirm duplicate check reports the
   survivors and the retry completes the graph.
