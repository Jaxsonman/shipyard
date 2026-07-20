# Shipyard Marketplace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Launch `shipyard`, a public Claude Code plugin marketplace on GitHub, containing its first SDLC-stage plugin: `prd` (idea → PRD via guided interview).

**Architecture:** Monorepo marketplace — `.claude-plugin/marketplace.json` at repo root lists plugins by local relative path (`./plugins/<name>`). The `prd` plugin is a thin `/prd` command that delegates to a `writing-prds` skill holding the interview method and PRD template.

**Tech Stack:** Claude Code plugin system (marketplace.json / plugin.json / commands / skills), git, GitHub via `gh` CLI. No build step, no dependencies.

## Global Constraints

- Repo root: `/Users/jaxsonmansouri/Desktop/Projects/shipyard` (git repo already initialized on `main`, spec committed).
- All plugin and marketplace names kebab-case: marketplace `shipyard`, plugin `prd`.
- Do NOT set `version` in `plugin.json` or marketplace plugin entries — git-sourced plugins auto-update per commit only when version is omitted.
- Component dirs (`commands/`, `skills/`) live at plugin root, NEVER inside `.claude-plugin/` (only the json manifests go there).
- Relative plugin sources must start with `./` and are resolved against the repo root.
- Owner identity: name "Jaxson Mansouri", email `mansouricobusiness@gmail.com`, GitHub `Jaxsonman`.
- License: MIT.

---

### Task 1: Marketplace scaffold (manifest, README, LICENSE)

**Files:**
- Create: `.claude-plugin/marketplace.json`
- Create: `README.md`
- Create: `LICENSE`

**Interfaces:**
- Produces: marketplace named `shipyard` exposing plugin `prd` from `./plugins/prd` (Task 2 must create that exact directory).

- [ ] **Step 1: Write the marketplace manifest**

Create `.claude-plugin/marketplace.json`:

```json
{
  "name": "shipyard",
  "owner": {
    "name": "Jaxson Mansouri",
    "email": "mansouricobusiness@gmail.com"
  },
  "description": "SDLC pipeline plugins for Claude Code — from raw idea to shipped software.",
  "plugins": [
    {
      "name": "prd",
      "source": "./plugins/prd",
      "description": "Turn a raw idea into a structured PRD through a guided, one-question-at-a-time interview.",
      "category": "productivity",
      "keywords": ["prd", "requirements", "planning", "sdlc"]
    }
  ]
}
```

- [ ] **Step 2: Write README.md**

```markdown
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
```

- [ ] **Step 3: Write LICENSE**

Standard MIT license text:

```text
MIT License

Copyright (c) 2026 Jaxson Mansouri

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 4: Validate the marketplace manifest**

Run from repo root: `claude plugin validate .`
Expected: validation succeeds for marketplace `shipyard`. (A warning that `./plugins/prd` doesn't exist yet is acceptable at this point; a JSON/schema error is not. If the missing plugin dir is a hard error, defer this step to the end of Task 2.)

- [ ] **Step 5: Commit**

```bash
git add .claude-plugin/marketplace.json README.md LICENSE
git commit -m "feat: add shipyard marketplace manifest, README, license"
```

---

### Task 2: The `prd` plugin

**Files:**
- Create: `plugins/prd/.claude-plugin/plugin.json`
- Create: `plugins/prd/commands/prd.md`
- Create: `plugins/prd/skills/writing-prds/SKILL.md`

**Interfaces:**
- Consumes: marketplace entry `{"name": "prd", "source": "./plugins/prd"}` from Task 1.
- Produces: installable plugin `prd` exposing the `/prd` command (namespaced `/prd:prd`) and skill `prd:writing-prds`.

- [ ] **Step 1: Write the plugin manifest**

Create `plugins/prd/.claude-plugin/plugin.json` (no `version` field — see Global Constraints):

```json
{
  "name": "prd",
  "description": "Turn a raw idea into a structured PRD through a guided, one-question-at-a-time interview.",
  "author": {
    "name": "Jaxson Mansouri",
    "email": "mansouricobusiness@gmail.com"
  },
  "repository": "https://github.com/Jaxsonman/shipyard",
  "license": "MIT",
  "keywords": ["prd", "requirements", "planning", "sdlc"]
}
```

- [ ] **Step 2: Write the /prd command**

Create `plugins/prd/commands/prd.md`:

```markdown
---
description: Draft a PRD from an idea via a guided interview
argument-hint: [product or feature idea]
---

Read and follow `${CLAUDE_PLUGIN_ROOT}/skills/writing-prds/SKILL.md`.

Initial idea from the user (may be empty): $ARGUMENTS

If the idea is empty, your first interview question is to ask what they want
to build. Otherwise, restate the idea in one sentence to confirm you
understood it, then begin the interview.
```

- [ ] **Step 3: Write the writing-prds skill**

Create `plugins/prd/skills/writing-prds/SKILL.md`:

```markdown
---
name: writing-prds
description: Turns a raw product idea into a structured PRD through a one-question-at-a-time interview. Use when the user wants to write a PRD, define product requirements, or runs /prd.
---

# Writing PRDs

Turn an idea into a Product Requirements Document through a short guided
interview, then write the finished PRD into the user's project.

## Interview rules

- Ask exactly ONE question per message. Never batch questions.
- Prefer multiple-choice options (3-4 options) when the answer space is
  guessable; fall back to open-ended questions when it isn't.
- After each answer, briefly reflect what you heard before the next question.
- If an answer makes an earlier section wrong, go back and fix it.
- Keep the whole interview to 6-10 questions. Do not interrogate; when an
  answer is obvious from context, propose it and ask for confirmation instead
  of asking cold.

## Interview sequence

Cover these areas, in order:

1. **Problem** — What problem does this solve, and for whom does it hurt most?
2. **Target users** — Who uses it first? (Distinguish buyer vs. user if relevant.)
3. **Success metrics** — What measurable outcome means this worked? Push for
   numbers (e.g. "30% of trials convert", not "users are happy").
4. **Scope: in** — The 3-6 capabilities the first version MUST have.
5. **Scope: out** — What is explicitly NOT in v1. Propose likely cuts yourself;
   users under-specify this.
6. **Risks & open questions** — Biggest technical or market unknowns.

## Writing the PRD

Derive the functional requirements from the scope-in capabilities; if any
capability is too vague to yield testable requirements, ask ONE follow-up
question about it before writing.

When the interview is complete, write the PRD to
`docs/prd/YYYY-MM-DD-<slug>.md` in the current project (create the directory
if needed; use today's date and a short kebab-case slug of the product name).
Then show the user the file path and a one-paragraph summary.

Use exactly this template:

    # PRD: <Product/Feature Name>

    **Date:** YYYY-MM-DD
    **Status:** Draft
    **Author:** <user's name if known, else omit line>

    ## Problem

    <2-4 sentences: the problem, who has it, why now.>

    ## Target users

    <Primary persona(s), one short paragraph each.>

    ## Success metrics

    - <Measurable outcome 1>
    - <Measurable outcome 2>

    ## Scope — v1 (in)

    - <Capability 1: one sentence, testable>
    - <Capability 2>

    ## Scope — explicitly out

    - <Non-goal 1, with one clause on why>

    ## Functional requirements

    <Numbered list. Each requirement is one testable sentence, grouped under
    the capability it serves.>

    ## Risks & open questions

    - <Risk or unknown, with its impact if it goes badly>

## Handoff

End by telling the user the PRD is ready for the next pipeline stage
(turning it into tickets). Do not start implementation.
```

- [ ] **Step 4: Validate the plugin and marketplace**

Run from repo root:
`claude plugin validate ./plugins/prd`
Expected: PASS (valid plugin.json, valid command and skill frontmatter).

Then: `claude plugin validate .`
Expected: PASS with no warnings about missing plugin paths.

- [ ] **Step 5: Commit**

```bash
git add plugins/
git commit -m "feat: add prd plugin — /prd guided PRD interview"
```

---

### Task 3: Local end-to-end verification

**Files:**
- No new files (fixes only, if verification fails).

**Interfaces:**
- Consumes: marketplace from Task 1, plugin from Task 2.
- Produces: verified-installable marketplace; this is the release gate for Task 4.

- [ ] **Step 1: Add the marketplace from the local path**

```bash
claude plugin marketplace add /Users/jaxsonmansouri/Desktop/Projects/shipyard
```
Expected: success message naming marketplace `shipyard`.

- [ ] **Step 2: Install the prd plugin**

```bash
claude plugin install prd@shipyard
```
Expected: install succeeds.

- [ ] **Step 3: Verify the command is exposed**

```bash
claude plugin list 2>/dev/null || claude plugin marketplace list
```
Expected: `prd@shipyard` present/enabled. Additionally verify the command file
landed in the plugin cache:

```bash
ls ~/.claude/plugins/cache/*/prd*/commands/prd.md 2>/dev/null || find ~/.claude/plugins/cache -name "prd.md" -path "*commands*"
```
Expected: one path printed.

- [ ] **Step 4: Clean up the local-path install**

Remove the local marketplace registration so the GitHub one (Task 4) can be
added cleanly later:

```bash
claude plugin uninstall prd@shipyard
claude plugin marketplace remove shipyard
```
Expected: both succeed.

If any step failed: fix the manifest/plugin files, re-run `claude plugin validate .`, commit the fix as `fix: <what>`, and repeat this task from Step 1.

---

### Task 4: Publish to GitHub

**Files:**
- No new files.

**Interfaces:**
- Consumes: clean, verified repo from Task 3.
- Produces: public repo `github.com/Jaxsonman/shipyard`, installable via `/plugin marketplace add Jaxsonman/shipyard`.

- [ ] **Step 1: Confirm working tree is clean**

```bash
git status
```
Expected: nothing to commit, working tree clean. (If not, commit remaining work first.)

- [ ] **Step 2: Create the public repo and push**

```bash
gh repo create Jaxsonman/shipyard --public --source . --push \
  --description "SDLC pipeline plugins for Claude Code — from raw idea to shipped software"
```
Expected: repo created, `main` pushed, remote `origin` set.

- [ ] **Step 3: Verify the repo is live and complete**

```bash
gh repo view Jaxsonman/shipyard --json name,visibility,defaultBranchRef
gh api repos/Jaxsonman/shipyard/contents/.claude-plugin/marketplace.json --jq '.name'
```
Expected: visibility `PUBLIC`, and the second command prints `marketplace.json`.

- [ ] **Step 4: Verify installability from GitHub**

```bash
claude plugin marketplace add Jaxsonman/shipyard
claude plugin install prd@shipyard
```
Expected: both succeed — this is the exact path public users will take. Leave
this installed (it's the real GitHub-backed install the user wants).

---

## Verification (end-to-end)

1. `claude plugin validate .` and `claude plugin validate ./plugins/prd` both pass from repo root.
2. `github.com/Jaxsonman/shipyard` is public and contains `.claude-plugin/marketplace.json`.
3. `claude plugin marketplace add Jaxsonman/shipyard` + `claude plugin install prd@shipyard` succeed.
4. In a fresh Claude Code session, `/prd test idea` starts a one-question-at-a-time interview (manual user check — cannot be scripted here).
