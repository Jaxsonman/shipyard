# Forge artifact contracts (v1)

Every artifact below is JSON, `"version": 1`, written by exactly one
agent (or the orchestrator itself), and read by the orchestrator and
whichever downstream agent needs it next. Field names, lens strings,
verdict values, and finding-id formats here are load-bearing: every
file in this plugin that reads or writes one of these shapes uses the
exact names below, and so does the loop procedure in
`../skills/running-forge/SKILL.md`.

**Path roots.** `state.json` and `report.md` live at
`<main-root>/.forge/<slug>/run/...` (`<main-root>` =
`dirname "$(git rev-parse --path-format=absolute --git-common-dir)"`,
resolvable identically from the main checkout or any linked worktree —
the same definition `qa`'s contract uses for `<main-root>/.qa/...`) and
are owned solely by the orchestrator. Every other artifact below —
`round-N/dev-handoff.json`, `round-N/qa/*`, `review-R/review.json` —
lives inside the run's **worktree** at the same relative path, owned
solely by the agent that writes it, so every dispatched agent can honor
"never write outside your own worktree." The orchestrator resolves
these by prefixing `state.json`'s own `worktree` field. On a ready
terminal the loop copies the worktree's `run/` contents into the
main-root `run/` before removing the worktree, so main-root then holds
`round-*/` and `review-*/` too.

Finding ids: `qa-<round>-<n>` (QA) and `rv-<round>-<n>` (review). QA ids
are **stable across rounds for the same underlying defect** — see
`agents/qa-orchestrator.md`'s merge rule — so the loop's oscillation
guards can compare the *set* of ids across rounds meaningfully. Review
ids are fresh every round.

Lens strings (fixed, exactly these three): `acceptance`, `adversarial`,
`regression`.

Verdict strings: QA `PASS` | `FAIL`. Review `APPROVE` | `CHANGES`.

Severity strings: `blocking` | `major` | `minor` (QA findings); review
findings use `blocking: true | false` instead.

## `.claude/forge.config.json`

Committed, optional file. All fields optional; defaults shown are what
the loop uses when the file or a field is absent.

```json
{
  "version": 1,
  "baseBranch": "main",
  "verifiers": 3,
  "devQaCap": 3,
  "reviewCap": 2,
  "models": {
    "developer": "sonnet",
    "developerEscalated": "opus",
    "qaOrchestrator": "sonnet",
    "qaVerifier": "sonnet",
    "peerReviewer": "opus"
  }
}
```

Valid `models.*` values are the Agent tool's model-override names:
`sonnet`, `opus`, `haiku`, `fable`.

## `.forge/<slug>/intent.md`

Not JSON — Markdown with YAML frontmatter. Full shape and section list:
`references/intent-template.md`. Frontmatter fields every reader depends
on: `slug`, `status` (`draft` | `approved`), `baseBranch`, `created`
(ISO date, `YYYY-MM-DD`).

## `.forge/<slug>/run/state.json` (main-root)

Written by the orchestrator at every phase transition. Never held only
in the orchestrator's head — every branch decision in the loop re-reads
this file or the latest round artifact instead.

```json
{
  "version": 1,
  "slug": "reef-tank-alerts",
  "phase": "dev",
  "devRound": 1,
  "reviewRound": 0,
  "escalated": false,
  "pendingFix": null,
  "regressionPass": false,
  "reviewPending": false,
  "branch": "forge/reef-tank-alerts",
  "worktree": "/Users/jaxsonmansouri/Desktop/Projects/shipyard-forge/reef-tank-alerts",
  "baseAheadOfOrigin": 0,
  "noProgress": [],
  "stageErrors": [],
  "terminal": {
    "kind": null,
    "cause": null,
    "pr": null
  }
}
```

Field notes:
- `phase`: `dev` | `qa` | `review` | `terminal`. (Preflight, Step 0, is
  never itself a phase value — it runs before `state.json` exists at
  all, and writes `phase: "dev"` as the file's first-ever value.)
- `worktree`: always an **absolute** path, resolved once at Step 0 and
  never re-derived — every dispatched agent receives this value
  verbatim as its working directory.
- `devRound` / `reviewRound`: round counters. `devRound` also counts the
  one review-driven dev fix round each review round may cost.
- `baseAheadOfOrigin`: integer, default `0` — how many commits
  `baseBranch` was ahead of `origin/<baseBranch>` when Step 0's
  preflight ran; positive values are carried into `report.md`'s outcome
  section as a warning.
- `escalated`: set `true` by oscillation guard A; once true, every
  subsequent dev round uses `models.developerEscalated`.
- `pendingFix`: `"qa"` | `"review"` | `null` — which artifact the next
  developer round's fix-list comes from, set explicitly at the decision
  point rather than inferred from any round counter (Step 3's
  FAIL-below-cap branch sets `"qa"`; Step 5's CHANGES-below-cap branch
  sets `"review"`). Step 1 and Step 5.1 read it to build that round's
  fix-list, then clear it back to `null` once that round's handoff is
  read and state saved. `null` also means "round 1, no fix-list yet."
- `regressionPass`: boolean, default `false` — set `true` in Step 5.1's
  post-handoff write, together with `phase = "qa"` and `pendingFix =
  null`, and stays `true` through Step 5.2's regression-only QA dispatch
  until that report comes back; lets Resume tell a `"qa"` phase reached
  via the review-fix path apart from an ordinary QA round. Reset `false`
  on entering Step 4, and also on Step 3's FAIL-below-cap branch (a
  regression FAIL can route back into the ordinary dev↔QA loop before
  the next review round would otherwise reset it).
- `reviewPending`: boolean, default `false` — set `true` in Step 4's
  post-review write, together with `reviewRound = R`, and cleared back
  to `false` by whichever Step 5 write acts on that verdict (the
  `APPROVE` and `review-cap` terminal records, and the `CHANGES`
  increment write). It marks the window in which
  `review-<reviewRound>/review.json` has returned but nothing has acted
  on it yet, so a `"review"`-phase Resume can tell "finish Step 5 on the
  verdict already on disk" apart from "dispatch review round
  `reviewRound + 1`". File existence alone cannot make that
  distinction: while review round `R` is being dispatched,
  `reviewRound` still reads `R-1` and `review-<R-1>/review.json` is
  already on disk from the round before. Reset `false` on entering Step
  4 as well, alongside `regressionPass`.
- `noProgress`: appended by oscillation guard B — one entry
  `{"round": N, "reason": "byte-identical-report"}` per early stop.
- `stageErrors`: appended on a second malformed-JSON dispatch — one
  entry `{"agent": "qa-orchestrator", "round": N, "detail": "..."}`.
- `terminal.kind`: `null` until Terminal, then `"ready"` or `"draft"`.
  `terminal.cause`: `no-progress` | `qa-cap` | `review-cap` |
  `stage-error:<agent>` | `null` (when `kind` is `"ready"`).
  `terminal.pr`: the PR URL once `gh pr create` succeeds, else `null`.

## `.forge/<slug>/run/round-N/dev-handoff.json` (worktree)

Written by the `developer` agent at the end of a dev round.

```json
{
  "version": 1,
  "round": 1,
  "commit": "a1b2c3d",
  "summary": "Added a threshold-based alert when a tank parameter drifts outside its configured safe range, surfaced on the dashboard.",
  "filesChanged": [
    "src/alerts/threshold.js",
    "src/alerts/threshold.test.js",
    "src/dashboard/AlertBanner.jsx"
  ],
  "testsAdded": [
    "src/alerts/threshold.test.js: warns when pH drifts above the configured max",
    "src/alerts/threshold.test.js: stays silent inside the safe range"
  ],
  "howToRun": "npm install && npm run dev — open http://localhost:PORT and adjust a tank's pH in the seed data to see the banner.",
  "selfCheck": {
    "suite": "pass",
    "lint": "pass",
    "typecheck": "pass"
  },
  "deferred": [
    {
      "item": "Configurable alert thresholds per tank",
      "reason": "Not in Done means; the intent's Constraints section calls out per-tank config as a later pass."
    }
  ],
  "fixListAddressed": []
}
```

Field notes:
- `selfCheck.*` values: `pass` | `fail` | `absent` (`absent` when the
  project has no lint/typecheck command — never fabricated).
- `deferred[]`: things the developer chose not to do, with reasons.
- `fixListAddressed[]`: the finding ids (from this round's fix-list, `qa-*`
  or `rv-*`) the developer addressed — `[]` on round 1.

## `.forge/<slug>/run/round-N/qa/verifier-K.json` (worktree)

Written by one `qa-verifier` dispatch. `K` is the verifier's 1-based
index within the round.

```json
{
  "version": 1,
  "lens": "acceptance",
  "verdict": "FAIL",
  "findings": [
    {
      "id": "qa-1-1",
      "severity": "blocking",
      "criterion": "A logged-in user sees an alert banner when a tank's pH drifts above its configured max.",
      "repro": [
        "Open http://localhost:4173/tanks/1",
        "Edit the seed reading for tank 1 to pH 9.2 (max configured: 8.4)",
        "Reload the tank page"
      ],
      "evidence": [
        {"kind": "screenshot", "path": "round-1/qa/verifier-1/screenshots/f1.png"},
        {"kind": "command", "command": "curl -s http://localhost:4173/api/tanks/1/alerts", "exitCode": 0, "excerpt": "{\"alerts\":[]}"}
      ]
    }
  ],
  "observations": ["The banner's dismiss control has no aria-label."],
  "unverified": ["Email notification on alert — no email sink is reachable in this environment."]
}
```

Field notes:
- `findings[].evidence[]` entries: `kind` is `screenshot` | `command` |
  `test`. `screenshot` carries `path`; `command` carries `command`,
  `exitCode`, `excerpt`; `test` carries `test`, `excerpt`. Every finding
  carries at least one evidence entry — one with none is never written
  as a finding (it becomes an `unverified[]` string instead).
- `observations[]` / `unverified[]`: plain strings.

## qa-orchestrator bring-up handshake

Not a file on disk — the final-message JSON `qa-orchestrator` returns
from a `mode: bring-up` dispatch, and the sentinel string it returns
from a `mode: full` dispatch when nested Agent dispatch is unavailable.
Both are internal orchestrator-to-orchestrator handshakes (`running-forge`
↔ `qa-orchestrator`), never written to `.forge/<slug>/run/`.

**Success** (bring-up completed; the app is left running — or, in
CLI-only mode, there was nothing to launch):

```json
{"url": "http://localhost:4173/", "logPath": "round-1/qa/app.log", "pid": 48213, "mode": "browser", "error": null}
```

CLI-only mode: `url`, `logPath`, and `pid` are all `null`, `mode` is
`"cli"`, `error` is still `null`.

**Failure** (setup/seed failed, health never turned green, or a
required env var name had no reachable value — `qa-orchestrator` has
already written `round-N/qa/report.json` as the bring-up-failure
artifact per its own Bring-up rule before returning this):

```json
{"url": null, "logPath": null, "pid": null, "mode": null, "error": "bring-up failed — see round-N/qa/report.json"}
```

All five fields are always present in both cases — `error` is `null` on
success, a one-line cause string on failure, never omitted either way.

**Nested-dispatch-unavailable sentinel.** A `mode: full` dispatch that
successfully starts Bring-up, then finds the Agent tool unavailable or
its first verifier-dispatch call errors, tears the app down and ends
with the final message, exactly and only, the literal string
`nested-dispatch-unavailable` — no JSON, no surrounding text. This is
what tells `running-forge/SKILL.md` Step 2 to run the three-dispatch
fallback (`bring-up`, verify, `merge-only`) itself instead of treating
the response as a stage error.

**Verifier-artifacts-missing sentinel.** A `mode: full` or `mode:
merge-only` dispatch whose Merge step finds that no verifier produced a
valid `verifier-K.json` tears the app down and ends with the final
message, exactly and only, the literal string
`verifier-artifacts-missing` — no JSON, no surrounding text — which the
loop's stage-error rule handles.

## `.forge/<slug>/run/round-N/qa/report.json` (worktree)

Written by `qa-orchestrator`, merging every `verifier-K.json` this round
per the rule in `agents/qa-orchestrator.md`.

```json
{
  "version": 1,
  "round": 1,
  "verdict": "FAIL",
  "findings": [
    {
      "id": "qa-1-1",
      "severity": "blocking",
      "criterion": "A logged-in user sees an alert banner when a tank's pH drifts above its configured max.",
      "repro": ["Open http://localhost:4173/tanks/1", "Edit the seed reading for tank 1 to pH 9.2 (max configured: 8.4)", "Reload the tank page"],
      "evidence": [{"kind": "screenshot", "path": "round-1/qa/verifier-1/screenshots/f1.png"}]
    }
  ],
  "unverified": ["Email notification on alert — no email sink is reachable in this environment."],
  "observations": ["The banner's dismiss control has no aria-label."],
  "verifierFiles": [
    "round-1/qa/verifier-1.json",
    "round-1/qa/verifier-2.json",
    "round-1/qa/verifier-3.json"
  ]
}
```

`findings[]`/`unverified[]`/`observations[]` use the same shapes as
`verifier-K.json` after dedupe and the evidence-or-`unverified` rule.
`verdict` is `"FAIL"` iff at least one merged finding has `severity`
`"blocking"` or `"major"`; a report with only `"minor"` findings, or
none, is `"PASS"`.

## `.forge/<slug>/run/review-R/review.json` (worktree)

Written by `peer-reviewer`.

```json
{
  "version": 1,
  "round": 1,
  "verdict": "CHANGES",
  "findings": [
    {
      "id": "rv-1-1",
      "blocking": true,
      "file": "src/alerts/threshold.js",
      "line": 42,
      "principle": "error handling",
      "summary": "A malformed reading (non-numeric pH) is caught and silently ignored instead of surfacing as a data-quality alert.",
      "suggestion": "Treat a non-numeric reading as an error condition worth its own alert, not a value to skip."
    }
  ]
}
```

`verdict` is `"CHANGES"` iff at least one finding has `blocking: true`;
otherwise `"APPROVE"`. A non-blocking finding is a nit — it rides in
`report.md`'s "Suggested follow-ups" but never forces another round.

## `.forge/<slug>/run/report.md` (main-root)

Not JSON — the final in-chat report and the PR body (passed to
`gh pr create --body-file`). Its six required sections, in order, are
specified in `skills/running-forge/SKILL.md`'s "Writing report.md" step:
Outcome first; What was built; How it works; Verification; Suggested
follow-ups; PR link, branch, worktree state.
