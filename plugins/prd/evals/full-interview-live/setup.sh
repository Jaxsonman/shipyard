#!/usr/bin/env bash
set -euo pipefail

git init -q
git config user.email "eval@example.com"
git config user.name "Eval Runner"

git commit -q --allow-empty -m "chore: scratch repo fixture"
