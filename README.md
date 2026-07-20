# Shipyard

An SDLC pipeline for Claude Code, delivered as plugins. Ideas go in one end;
shipped software comes out the other. Each pipeline stage is its own plugin —
adopt one stage or the whole line.

## Install

```
/plugin marketplace add Jaxsonman/shipyard
/plugin install prd@shipyard
```

## Pipeline stages

| Stage | Plugin | Status | Role |
|-------|--------|--------|------|
| 1 | `prd` | ✅ Available | Turn a raw idea into a structured PRD via guided interview |
| 2 | `kanban` | Planned | Turn a PRD into tickets on a board |
| 3 | `dev-crew` | Planned | Dev agents pick up tickets and implement them |
| 4 | `qa` | Planned | Testing and review |
| 5 | `pr-flow` | Planned | PR creation and merge |
| 6 | `cicd` | Planned | Pipeline monitoring and deploy help |

## Usage

After installing `prd`, run:

```
/prd a mobile app that tracks reef tank water parameters
```

Claude interviews you one question at a time (problem, users, success metrics,
scope, requirements, risks) and writes the finished PRD to
`docs/prd/YYYY-MM-DD-<slug>.md` in your project.

## License

MIT
