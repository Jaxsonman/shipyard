#!/usr/bin/env bash
set -euo pipefail

git init -q
git config user.email "eval@example.com"
git config user.name "Eval Runner"

mkdir -p .forge/tank-alerts/context

# Problem, Desired outcome, and Done means are already hand-written by
# the human (real content, not the template's placeholder text).
# Constraints, Context, Out of scope, and How to run are still exactly
# the template's placeholder text. Per authoring-intent SKILL.md Step 2,
# the interview must ask about Constraints (the first still-placeholder
# section, in template order) and only Constraints, leaving the three
# already-answered sections untouched.
cat > .forge/tank-alerts/intent.md <<'EOF'
---
slug: tank-alerts
status: draft
baseBranch: main
created: 2026-09-15
---

# Intent: tank-alerts

## Problem

Reef hobbyists running automated dosing pumps have no warning when a
tank's pH drifts outside a safe range before it harms livestock.

## Desired outcome

Anyone viewing the tank dashboard sees an immediate, unmissable banner
the moment a reading drifts outside its configured safe range.

## Done means

- A banner appears within one page load when pH is outside the
  configured safe range.

## Constraints

_(Tech, style, performance constraints; things not to touch.)_

## Context

_(Paths under `context/` — mocks, docs, pasted conversations — and external links. One line per item on why it matters.)_

## Out of scope

_(Explicit non-goals — what this intent deliberately does not cover.)_

## How to run

_(Setup, seed, and launch commands. Environment variable *names* only, never values. Ports, if fixed.)_
EOF

git add -A
git commit -q -m "eval fixture: partially-answered draft intent for tank-alerts"
