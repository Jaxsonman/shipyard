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
