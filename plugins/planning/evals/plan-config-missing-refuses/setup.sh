#!/usr/bin/env bash
set -euo pipefail

# A git repo with no .claude/kanban.config.json and no ship artifacts at
# all. planning-tickets Step 1 runs preflight.js --stage plan first; with
# no config file, the only failing check should have id "config" — the
# skill's job is to bootstrap it by asking backend and target one
# question at a time, never to invent a plan or touch ticket #42's real
# content before config exists (there is deliberately no gh shim here:
# any `gh issue view` call this case makes would be a real network call,
# which the grader below catches).

git init -q
git config user.email "eval@example.com"
git config user.name "Eval Runner"
git commit -q --allow-empty -m "chore: init empty repo"
