# Kanban — PRD to Vertical-Slice Tickets

**Date:** 2026-07-21
**Status:** Approved

## Purpose

`kanban` is the second Shipyard pipeline stage: it takes a PRD (any PRD-like
text or file path — not necessarily one produced by the `prd` plugin) and
breaks it down into small, independently valuable, human-testable vertical
slices, then creates those slices as tickets on a real board (GitHub Issues
or Jira). Tickets are written to be executable by AI developer agents in a
later pipeline stage (`dev-crew`).

Vertical slice, for this plugin's purposes: a ticket that delivers one
observable outcome a human can click through and verify end-to-end, even if
it touches multiple layers (DB, API, UI). This is explicitly the opposite of
horizontal slicing ("all backend," "all frontend"), which produces tickets
nothing can demo until every layer is finished.

## Command flow

Trigger: `/kanban <PRD text or file path>`.

1. **Config check.** Look for `.claude/kanban.config.json` in the current
   project.
   - **Missing:** ask once, in this order: (a) backend — GitHub or Jira; (b)
     target — `owner/repo` for GitHub, or project key for Jira. Write the
     config and commit it. No secrets are stored here — auth is handled
     separately (`gh auth` for GitHub, Atlassian MCP OAuth for Jira).
   - **Present:** skip straight to step 2, no re-prompt.
2. **Read the PRD.** Accept either a file path or raw pasted PRD text.
3. **Propose the slice breakdown.** Decompose into vertical-slice tickets
   (methodology below) and present the full list — titles + one-line
   summaries — in a single message.
4. **Duplicate check.** Derive a slug identifying this PRD (filename slug, or
   a short slug generated from the first heading/line if raw text was
   pasted). Search the configured backend for existing tickets whose body
   references that slug (`gh issue list --search "Source PRD: <slug>"` for
   GitHub; Jira JQL text search for the same marker). If matches are found,
   warn the user and ask them to confirm before proceeding.
5. **Single approval gate.** User reviews the full proposed list, requests
   edits if needed (add/remove/reword slices), then approves as a whole.
6. **Create tickets.** Best-effort: attempt every approved ticket against the
   backend even if one fails. At the end, summarize successes (with links)
   and failures (with error reason) so the user can retry just the failures.

The board is the single source of truth — no local ticket-tracking file is
written. Each created ticket's body includes a `Source PRD: <slug>` line,
which step 4 relies on for dedup and which lets a human trace a ticket back
to its originating PRD.

## Slicing methodology

No fixed rule (one PRD "Scope — in" bullet ≠ one ticket, and layer count is
irrelevant). Claude uses judgment per PRD, informed by INVEST-style criteria
pulled from published agile guidance: each slice should be

- **Independent** — deliverable and demoable without waiting on a sibling
  slice, where the PRD allows it,
- **Small** — scoped to what a single AI dev agent can implement and a human
  can verify in one sitting,
- **Testable** — has concrete, checkable acceptance criteria, not vague
  intent.

Every generated ticket contains:

- **Title** — concise, specific (not a vague symptom like "fix login").
- **Description** — what the slice does and why, derived from the relevant
  PRD section(s).
- **Acceptance criteria** — a testable, numbered list.
- **Human verification step** — one explicit sentence describing exactly how
  a human confirms this slice works end-to-end (the concrete manifestation
  of "vertical slice, human-testable").
- **Source PRD** — the slug used for dedup (see Command flow, step 4).

Sequencing/dependency links between slices and implementation-file hints are
explicitly out of scope for v1 (per the approved design conversation) — these
were considered and deferred to avoid over-specifying implementation for the
downstream dev agent stage.

## Backend architecture

Split for extensibility, matching how `prd` splits command (thin trigger)
from skill (methodology):

```
plugins/kanban/
├── .claude-plugin/
│   └── plugin.json           # declares mcpServers entry for Atlassian (Jira)
├── commands/
│   └── kanban.md              # thin trigger, passes $ARGUMENTS to the skill
└── skills/
    └── creating-tickets/
        ├── SKILL.md            # methodology, config/setup, approval gate,
        │                       # dedup, best-effort creation + summary —
        │                       # entirely backend-agnostic
        └── references/
            ├── github.md       # gh CLI commands: issue create/list/search
            └── jira.md         # Atlassian MCP tool calls for create/search
```

- `SKILL.md` never talks to a backend directly. At the point it needs to
  create or search tickets, it reads the reference file matching the
  configured backend and follows the commands/tool-calls documented there.
- Adding ClickUp or Trello later means adding one new reference file plus a
  new backend option in the config-setup step — `SKILL.md` itself does not
  change.

**GitHub:** `gh` CLI (`gh issue create`, `gh issue list --search`). Reuses
the user's existing `gh auth` session — no new auth flow.

**Jira:** the plugin bundles an `mcpServers` entry in `plugin.json` pointing
at Atlassian's official remote MCP server (self-contained — does not depend
on the third-party `atlassian-tools` plugin being installed). One-time OAuth
on first use, standard for remote MCP servers. The exact server URL/config
will be confirmed against Atlassian's current documentation during
implementation rather than assumed here.

## Config file

`.claude/kanban.config.json`, committed to git (team-shared, no secrets):

```json
{
  "backend": "github",
  "target": "owner/repo"
}
```

or for Jira:

```json
{
  "backend": "jira",
  "target": "PROJECTKEY"
}
```

## Non-goals (v1)

- Ticket sequencing/dependency metadata between generated slices.
- Implementation hints (suggested files/areas) per ticket.
- ClickUp, Trello, or any backend beyond GitHub and Jira.
- A local markdown record of generated tickets — the board is authoritative.
- Automatic duplicate *prevention* (only warn-and-confirm, not a hard block).

## Verification

1. `claude plugin validate ./plugins/kanban` passes.
2. Fresh project, no config: `/kanban <PRD>` prompts for backend/target
   exactly once, writes and commits `.claude/kanban.config.json`.
3. Re-running `/kanban` in the same project does not re-prompt for setup.
4. GitHub backend: proposed slice list appears, approval gate blocks
   creation until confirmed, approved tickets appear as real GitHub issues
   with `Source PRD:` in the body.
5. Jira backend: same flow, tickets appear as real Jira issues in the
   configured project.
6. Re-running `/kanban` against the same PRD triggers the duplicate warning.
7. Simulated partial failure (e.g. one bad title) still creates the other
   tickets and reports a clear success/failure summary at the end.
