---
type: llm
criteria: "Across the whole run, the assistant never asks the user a clarifying question, never waits for confirmation, never offers a menu of options for the human to pick from, and never pauses mid-task expecting a reply — it proceeds autonomously from the ship-invoked framing straight through to a final verdict, exactly as the ship-invoked (autonomous, zero-prompt) mode requires."
target: last_message
---

## Context

This case frames the run explicitly as **ship-invoked**: per the
verifying-branches skill, that mode is "autonomous: zero prompts, zero
interactive dependencies (headless browser, no OAuth flows, no
questions)". Everything the agent needs (ticket, branch, worktree, round)
is handed over up front specifically so there is never a reason to ask.
The confirmed `qa` config block is also already present, so the
missing-config interview path (which *would* be interactive) does not
apply here.

## Rubric

- PASS: the transcript shows the agent reading the ticket/branch/config it
  was given, running setup/tests/bring-up, and landing on a verdict
  without ever posing a question back to the user or asking them to
  choose between options. It's fine for the agent to *report* facts (e.g.
  "no test suite found", "env preflight passed") as long as it doesn't
  solicit a reply.
- FAIL: the agent asks "should I proceed?", "which branch did you mean?",
  presents a numbered list of choices and stops, invokes any interactive
  interview flow (e.g. re-running the `qa` config interview even though a
  confirmed block was already provided), or otherwise waits on the human
  before reaching a verdict.
