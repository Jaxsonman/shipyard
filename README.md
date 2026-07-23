# Shipyard

An SDLC pipeline for Claude Code, delivered as plugins. Ideas go in one end;
shipped software comes out the other. Each pipeline stage is its own plugin —
adopt one stage or the whole line.

## Adding Shipyard to Claude Code

Shipyard is a [Claude Code plugin marketplace](https://docs.claude.com/en/docs/claude-code/plugin-marketplaces).
Adding it makes its plugins installable; installing a plugin is what actually
gives you its slash commands and skills.

1. **Add the marketplace** — inside any Claude Code session, run:

   ```
   /plugin marketplace add Jaxsonman/shipyard
   ```

   This registers the marketplace by cloning its manifest. It does not install
   anything yet.

2. **Browse what's available** (optional):

   ```
   /plugin marketplace list
   ```

   or open the interactive picker with `/plugin`.

3. **Install stage plugins:**

   ```
   /plugin install prd@shipyard
   /plugin install kanban@shipyard
   ```

   Repeat for any other stages you want (see the table below). Installing adds
   that plugin's slash commands and skills to your session.

4. **Verify they're installed** — `/plugin` should list `prd@shipyard` and
   `kanban@shipyard` as installed, and `/prd` and `/kanban` should
   autocomplete as slash commands.

### Keeping it up to date

```
/plugin marketplace update shipyard
```

Refreshes the marketplace manifest from this repo, so newly shipped stages
become installable. It does not upgrade plugins you already have installed —
follow it with `/plugin update <name>@shipyard` to pick up a plugin's
latest version (Shipyard doesn't pin plugin versions, so every new commit
is an available update).

### Removing it

```
/plugin uninstall prd@shipyard
/plugin marketplace remove shipyard
```

Uninstall plugins before removing the marketplace they came from.

## Pipeline stages

| Stage | Plugin | Status | Role |
|-------|--------|--------|------|
| 1 | `prd` | ✅ Available | Turn a raw idea into a structured PRD via guided interview |
| 2 | `kanban` | ✅ Available | Turn a PRD into dependency-linked tickets on a board |
| 3 | `planning` | Planned | Per-ticket spec and implementation plan (/spec, /plan) |
| 4 | `dev` | Planned | Autonomous dev agent implements a planned ticket |
| 5 | `qa` | Planned | Autonomous verification of acceptance criteria |
| 6 | `pr` | Planned | Rebase and open the PR |
| — | `ship` | Planned | Conductor: dev ⇄ qa loop, review gates, PR handoff |
| 7 | `cicd` | Planned | Pipeline monitoring and deploy help |

## Usage

After installing `prd`, run:

```
/prd a mobile app that tracks reef tank water parameters
```

Claude interviews you one question at a time (problem, users, success metrics,
scope, requirements, risks) and writes the finished PRD to
`docs/prd/YYYY-MM-DD-<slug>.md` in your project.

After installing `kanban`, run:

```
/kanban docs/prd/2026-07-20-reef-tank.md
```

The first run in a project asks once which board to use (GitHub or Jira)
and where, then Claude proposes a full breakdown of small, vertical-slice
tickets — each one a single outcome a human can verify end-to-end, with
`Depends on:` links where one slice genuinely requires another. Approve
the list and Claude creates the tickets on your board in dependency
order.

## Contributing

Adding or changing a plugin? Update this README's install steps and pipeline
stage table in the same change — a merged plugin that isn't reflected here is
effectively undiscoverable. A Claude Code `PreToolUse` hook blocks
`git commit` in-session when files under `plugins/` or `.claude-plugin/` are
staged without `README.md`; see `.claude/settings.json`.

## License

MIT
