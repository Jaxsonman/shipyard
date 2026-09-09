#!/usr/bin/env bash
set -euo pipefail

git init -q
git config user.email "eval@example.com"
git config user.name "Eval Runner"

mkdir -p docs/prd

cat > docs/prd/2026-08-01-dark-mode.md <<'EOF'
# PRD: Dark mode toggle

**Date:** 2026-08-01
**Status:** Draft
**Author:** (unknown)

## Problem

Users working at night find the current bright, white-only UI uncomfortable
and it drains OLED battery life on mobile.

## Target users

Primary persona: existing logged-in users who use the product in low-light
conditions.

## Success metrics

- 25% of active users enable dark mode within the first month of release.

## Scope — v1 (in)

- A user-facing toggle in account settings that switches the UI palette.
- The chosen preference persists across sessions.

## Scope — explicitly out

- Automatic OS-theme-following dark mode (v2 candidate).

## Functional requirements

1. Settings page exposes a "Dark mode" toggle.
2. Toggling updates the UI palette immediately without a reload.
3. The preference is stored per-user and applied on next login.

## Risks & open questions

- Some third-party embedded widgets may not support a dark palette.
EOF

git add -A
git commit -q -m "docs(prd): dark-mode"
