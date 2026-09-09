#!/usr/bin/env bash
set -euo pipefail

git init -q
git config user.email "eval@example.com"
git config user.name "Eval Runner"

mkdir -p docs/prd

cat > docs/prd/2026-09-01-dark-mode.draft.md <<'EOF'
# PRD: Dark mode toggle

**Date:** 2026-09-01
**Status:** Draft
**Author:** (unknown)

## Problem

Users working at night find the current bright, white-only UI uncomfortable
and it drains OLED battery life on mobile. No accessible way exists to opt
into a darker color scheme.

## Target users

Primary persona: existing logged-in users who use the product in low-light
conditions (evenings, dark rooms). Secondary: accessibility-sensitive users
who are light-sensitive.

## Success metrics

- 25% of active users enable dark mode within the first month of release.
- No increase in session-abandonment rate after the toggle ships.

<!-- prd-draft: next=scope-in -->
EOF

git add -A
git commit -q -m "chore: scratch repo fixture"
