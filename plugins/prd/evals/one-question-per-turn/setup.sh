#!/usr/bin/env bash
set -euo pipefail

# No PRD/board fixtures needed for this case, but the preflight git-repo
# check must pass, so this must still be a git repo.
git init -q
git config user.email "eval@example.com"
git config user.name "Eval Runner"

# Empty initial commit so the repo has a HEAD.
git commit -q --allow-empty -m "chore: scratch repo fixture"
