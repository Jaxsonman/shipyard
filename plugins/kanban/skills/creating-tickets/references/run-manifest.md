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
    { "index": 16, "title": "…", "body": "## Description\n…" }
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
| `tickets[].state` | `pending` \| `created` \| `failed` \| `skipped`. |
| `tickets[].ref` | `#<number>` (GitHub) or issue key (Jira) once created, else `null`. |
| `tickets[].url` | Absolute URL once created, else `null`. |
| `tickets[].error` | Verbatim failure reason for `failed`; the blocking dependency's title for `skipped`; else `null`. |
| `deferred[]` | Slices beyond the 15-per-run cap, carrying the same `index`, `title` and `body` as `tickets[]` entries so a later run does not re-derive them with different titles. |

**Timestamps** come from `node "${CLAUDE_PLUGIN_ROOT}/scripts/metrics.js" now`.

**Deferred lifecycle.** A run never proposes or re-derives a `deferred[]`
entry a second time. When the user approves the deferred batch (SKILL.md
Step 3), each entry **moves** into `tickets[]` with `state: "pending"` and is
**removed** from `deferred[]`. There is no `deferred` value in
`tickets[].state` — once an entry is in `tickets[]` it follows the normal
`pending` → `created`/`failed`/`skipped` lifecycle above.

## Reconciling on a re-run

This runs at Step 4 of SKILL.md, after the board scan has been fetched, and
runs **exactly once per run**.

1. If `docs/kanban/<slug>.run.json` exists, load it before proposing anything.
2. Every ticket with `state: "created"` and a non-null `ref`: confirm it still
   exists on the board ("Verify a ticket exists" in the backend reference).
   Confirmed → report it under **Already exists** and never re-create it.
   Gone (deleted on the board) → set `state` back to `pending` and say so.
3. Tickets in `pending`, `failed` or `skipped` are the remaining work; they
   keep their `index`, `title` and `body`. **Before re-creating any of them,
   match each one against the Step 4 board scan by body**, not title: a
   board issue carrying the `Source PRD: <slug>` line whose
   Description/Acceptance Criteria match the manifest entry's stored `body`
   is that ticket, even if a human renamed it — title is only a tiebreaker
   when body matching is ambiguous. A rename must never cause a duplicate. A
   run killed mid-create leaves a ticket on the board with its manifest
   entry still `pending` — the board scan is the only thing that catches
   it. A match → adopt its `ref` and `url`, set `state: "created"`, and
   report it under **Already exists**; never create a second copy.
4. `deferred[]` entries are offered as the next batch once nothing is pending
   (see "Deferred lifecycle" above for how they move into `tickets[]`).
5. The manifest is the authority for *what was approved*; the `Source PRD:`
   body scan (Step 4) is the authority for *what is actually on the board*.
   Run both every time. The scan also covers tickets created before the
   manifest existed, or created by someone else.
