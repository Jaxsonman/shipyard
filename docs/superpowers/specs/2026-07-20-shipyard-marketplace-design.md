# Shipyard — SDLC Pipeline Plugin Marketplace

**Date:** 2026-07-20
**Status:** Approved

## Purpose

Shipyard is a public Claude Code plugin marketplace hosting a suite of SDLC-pipeline
plugins. The long-term flow: an idea goes in → `/prd` produces a PRD → a kanban plugin
turns it into tickets → dev agents pick tickets up, implement, and test → a PR/merge
plugin lands the work → a CI/CD plugin watches the pipeline. Each stage ships as its
own plugin so users can adopt one stage or the whole line.

This spec covers the initial launch: the marketplace scaffold plus the first real
stage plugin (`prd`).

## Architecture

Monorepo marketplace: all plugins live inside the shipyard repo and
`marketplace.json` references them by local path. Alternatives considered and
rejected for now:

- **One repo per plugin, marketplace as index** — better once plugins version
  independently; premature at one plugin. Splitting later doesn't break users.
- **Single mega-plugin with all stages** — simpler install, but users can't pick
  stages and versioning gets muddy.

### Repo layout

```
shipyard/
├── .claude-plugin/
│   └── marketplace.json      # marketplace manifest; lists plugins from ./plugins/*
├── plugins/
│   └── prd/                  # first stage plugin — template for later stages
│       ├── .claude-plugin/
│       │   └── plugin.json   # name, description, version, author
│       ├── commands/
│       │   └── prd.md        # /prd slash command (thin trigger)
│       └── skills/
│           └── writing-prds/
│               └── SKILL.md  # interview methodology + PRD template
├── docs/superpowers/specs/   # design docs (this file)
├── README.md                 # what it is, install instructions, stage roadmap
└── LICENSE                   # MIT
```

## The `prd` plugin

- **Trigger:** `/prd [optional idea]`.
- **Behavior:** guided interview, one question at a time, covering: problem
  statement, target users, success metrics, scope (in/out), functional
  requirements, risks and open questions.
- **Output:** writes `docs/prd/YYYY-MM-DD-<slug>.md` into the user's current
  project, following a consistent PRD template defined in the skill.
- **Split of responsibilities:** `commands/prd.md` only invokes the skill and
  passes arguments; `skills/writing-prds/SKILL.md` owns the interview method and
  the PRD template.
- The plugin's folder layout is the copy-paste template for future stage plugins.

## Roadmap (README only, not built now)

| Stage | Plugin | Role |
|-------|--------|------|
| 1 | `prd` | Idea → PRD (this launch) |
| 2 | `kanban` | PRD → tickets on a board |
| 3 | `dev-crew` | Agents pick up tickets, implement |
| 4 | `qa` | Testing and review |
| 5 | `pr-flow` | PR creation and merge |
| 6 | `cicd` | Pipeline monitoring and deploy help |

## Publishing

Public GitHub repo under the owner's account so
`/plugin marketplace add <username>/shipyard` works from day one.

## Verification

1. `marketplace.json` and `plugin.json` are valid JSON and follow the documented
   Claude Code schemas.
2. `claude plugin validate .` (or local `/plugin marketplace add ./shipyard`)
   succeeds.
3. Install the `prd` plugin from the local marketplace; `/prd` appears and starts
   the interview.
4. Repo is public on GitHub and installable by the public path.
