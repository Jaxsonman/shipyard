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
