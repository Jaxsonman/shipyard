---
name: writing-prds
description: Turns a raw product idea into a structured PRD through a one-question-at-a-time interview. Use when the user wants to write a PRD, define product requirements, or runs /prd.
---

# Writing PRDs

Turn an idea into a Product Requirements Document through a short guided
interview, then write the finished PRD into the user's project.

## Step 1: Preflight

Run before asking anything:

    node "${CLAUDE_PLUGIN_ROOT}/scripts/preflight.js" --stage prd

Exit 2 → report the usage error and stop. Exit 0 → continue.

Exit 1 → read the JSON `checks[]` array (ids live there, not in `reasons[]`).
A failing check with id `gh-installed`, `gh-auth` or `repo-access` is only
**advisory** at this stage — writing a PRD is purely local and touches no
board. Mention it once ("the board stages will need `gh auth login`") and
continue the interview. If some other check failed, print those checks'
`message` values verbatim and stop.

## Step 2: Resume, slug and existing-PRD check

**First, look for an interrupted draft.** Glob `docs/prd/*.draft.md` (every
date, not just today's). If one or more exist, list each with its captured
idea/topic and offer: **resume** (adopt that draft's date and slug — do not
re-derive them — and continue from its `next=` area), **start over** (delete
the chosen draft), or **ignore and start a new PRD**. A draft is never
committed — this is the only way to recover one.

If the user starts fresh (no draft resumed), derive today's date and a short
kebab-case slug from the idea; the PRD path is
`docs/prd/<YYYY-MM-DD>-<slug>.md` (contract §13).

- Glob `docs/prd/*-<slug>.md` (any date). Any match is an existing PRD for
  this slug — **stop and ask**: **revise** it (read it in as the starting
  draft), **write a new slug** (they supply it), or **abort**. Never
  overwrite without an explicit answer — `kanban` derives its `Source PRD:`
  slug from the filename, so two dated files for one product would produce
  two unrelated slugs and a duplicate ticket set.

## Interview rules

- Ask exactly ONE question per message. Never batch questions.
- Prefer multiple-choice options (3-4 options) when the answer space is
  guessable; fall back to open-ended questions when it isn't.
- After each answer, briefly reflect what you heard, and fix earlier
  sections if the new answer contradicts them.
- Keep the whole interview to 6-10 questions; when an answer is obvious from
  context, propose it and ask for confirmation instead of asking cold.
- **After every answer**, before asking the next question, write the
  answers so far to `docs/prd/<YYYY-MM-DD>-<slug>.draft.md` — the PRD
  template with only the sections answered so far filled in, plus a final
  `<!-- prd-draft: next=<area> -->` line naming the next unanswered area.
  This file is the resume point; it is not committed.

## Interview sequence

Cover these areas, in order:

1. **Problem** — What problem does this solve, and for whom does it hurt most?
2. **Target users** — Who uses it first? (Distinguish buyer vs. user if relevant.)
3. **Success metrics** — Push for numbers (e.g. "30% of trials convert").
4. **Scope: in** — The 3-6 capabilities the first version MUST have.
5. **Scope: out** — What is explicitly NOT in v1. Propose likely cuts yourself.
6. **Risks & open questions** — Biggest technical or market unknowns.

## Writing the PRD

Derive the functional requirements from the scope-in capabilities; if any
capability is too vague to yield testable requirements, ask ONE follow-up
question about it before writing. When the interview is complete, write the
PRD to `docs/prd/YYYY-MM-DD-<slug>.md` (create the directory if needed), then
show the user the file path and a one-paragraph summary. Use exactly this
template:

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

When the PRD is written, delete the `.draft.md` file, then **offer to
commit** (do not commit unasked), committing only that path since the
user's tree may be dirty:

    git add docs/prd/<YYYY-MM-DD>-<slug>.md
    git commit docs/prd/<YYYY-MM-DD>-<slug>.md -m "docs(prd): <slug>"

Then tell the user the PRD is ready for the next pipeline stage (turning it
into tickets). Do not start implementation.
