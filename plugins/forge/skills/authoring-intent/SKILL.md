---
name: authoring-intent
description: Scaffolds and interviews an Intent.md — the single human-authored artifact that starts a forge run. Use when the user runs /intent, wants to draft or refine a forge intent, or asks to approve an intent before starting a forge run.
---

# Authoring an intent

`Intent.md` is the one human-in-the-loop step in forge. This skill only
ever does three things: scaffold a fresh one, interview the human over
an existing draft, or report that one is already approved. It never
starts a forge run itself — that is `/forge`'s job, and `/forge` refuses
to start on anything but `status: approved`.

## Step 0: Ensure the exclude rule exists

Before creating or touching anything under `.forge/`, ensure `.forge/`
is listed in the shared exclude file (idempotent — check before
appending, since this runs on every `/intent` invocation):

```bash
EXCLUDE="$(git rev-parse --path-format=absolute --git-common-dir)/info/exclude"
grep -qxF ".forge/" "$EXCLUDE" 2>/dev/null || echo ".forge/" >> "$EXCLUDE"
```

Never write to `.gitignore` — this is the same rule `qa` follows for
`.qa/`, and for the same reason: nothing forge produces before a
deliberate commit may show up as a dirty working tree.

## Step 1: Resolve the slug

The slug comes from the command's argument. Missing → ask: "What's a
short kebab-case name for this piece of work?" before doing anything
else — every forge artifact path is keyed by it.

## Step 2: Branch on whether `.forge/<slug>/intent.md` exists

**Does not exist:**

1. `mkdir -p .forge/<slug>/context`.
2. Read `.claude/forge.config.json`'s `baseBranch` if the file exists,
   else use `"main"`.
3. Write `.forge/<slug>/intent.md` from `references/intent-template.md`,
   substituting `<slug>`, `<baseBranch>`, and `<YYYY-MM-DD>` (today,
   ISO date) into the frontmatter and title.
4. Report the file's path and, one line each, what every section wants
   (Problem, Desired outcome, Done means, Constraints, Context, Out of
   scope, How to run). Tell the user to fill it in (by hand or by
   re-running `/intent <slug>`) and stop. **Do not commit anything** —
   this file is intentionally uncommitted until `/forge`'s preflight
   commits it onto the feature branch.

**Exists, `status: draft`:**

1. For each of the 7 sections, **in template order**, check whether its
   body (trimmed) is byte-identical to that section's placeholder text
   in `references/intent-template.md`. A section the human already
   wrote something into (not matching the placeholder) is left alone —
   never re-asked, never overwritten.
2. For each **still-placeholder** section, ask one question at a time,
   in order, and write the answer into that exact section, preserving
   the frontmatter and every other section byte-for-byte. Never batch
   two sections into one question.
3. Once every section holds real content (either already present or
   just answered), read the whole file back as a short synopsis — one
   line per section — and ask: "Approve this intent? (yes/no)"
   - **Yes:** set `status: approved` in the frontmatter, save, tell the
     user forge is ready: `/forge <slug>`.
   - **No:** leave `status: draft` (keep whatever sections were just
     filled in this session), stop.

**Exists, `status: approved`:**

Report: "Intent for `<slug>` is already approved. Edit the file
directly and set `status: draft` in its frontmatter to reopen it for
interview." Make no changes.

## Hard rules

- Never batch multiple sections into one question — one at a time,
  always.
- Never touch a section that already holds non-placeholder content,
  even if it looks incomplete to you — the human wrote it, it is not
  yours to improve.
- Never set `status: approved` without the explicit yes above.
- Never commit `.forge/<slug>/intent.md` or `context/` — that is
  `/forge`'s preflight, on the feature branch, not this skill's job.
