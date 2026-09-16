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

## Path convention — the standard preamble

Every `.forge/<slug>/...` path in this skill is relative to **main-root**
— this checkout's root, resolved from the shared git common dir, never
assumed to be the cwd. `/intent` and `/forge` resolve the same root by
the same mechanism, so an intent authored from a worktree, a subdirectory,
or the main checkout always lands in one place and `/forge <slug>` always
finds it. Every fenced block below that touches a `.forge/` path — and
every step that writes one through an editing tool — runs after this
preamble, which is the same one `skills/running-forge/SKILL.md` uses:

```bash
MAIN_ROOT="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
cd "$MAIN_ROOT"
```

Shell state does not survive from one fenced block to the next, so each
block below repeats it at its own top rather than relying on an earlier
one having run.

## Step 0: Validate the slug, then ensure the exclude rule exists

**Before anything else**, validate the slug the command passed in (Step 1
covers the case where it is missing entirely):

```bash
if printf '%s\n' "<slug>" | grep -Eq '^[a-z0-9][a-z0-9-]{0,63}$'; then
  echo "slug-ok"
else
  echo "slug-invalid"
  exit 1
fi
```

Anything other than a printed `slug-ok` — `slug-invalid`, no output, or
a non-zero exit for any reason — → stop: "slug must be lowercase
letters, digits and dashes, starting with a letter or digit". The `else`
branch is what makes this fail closed: an unvalidated slug is never
interpolated into a path.

Then, before creating or touching anything under `.forge/`, ensure
`.forge/` is listed in the shared exclude file (idempotent — check
before appending, since this runs on every `/intent` invocation):

```bash
MAIN_ROOT="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
cd "$MAIN_ROOT"
EXCLUDE="$(git rev-parse --path-format=absolute --git-common-dir)/info/exclude"
grep -qxF ".forge/" "$EXCLUDE" 2>/dev/null || echo ".forge/" >> "$EXCLUDE"
```

Never write to `.gitignore` — this is the same rule `qa` follows for
`.qa/`, and for the same reason: nothing forge produces before a
deliberate commit may show up as a dirty working tree.

## Step 1: Resolve the slug

The slug comes from the command's argument. Missing → ask: "What's a
short kebab-case name for this piece of work?" before doing anything
else — every forge artifact path is keyed by it. An answer given here
goes through Step 0's validation fence before it is used, exactly as an
argument would.

## Step 2: Branch on whether `.forge/<slug>/intent.md` exists

Probe at main-root, never at the cwd:

```bash
MAIN_ROOT="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
cd "$MAIN_ROOT"
test -f .forge/<slug>/intent.md && echo "intent=present" || echo "intent=absent"
echo "MAIN_ROOT=$MAIN_ROOT"
```

Branch on the printed lines. The printed `MAIN_ROOT` is the absolute
root every path below is relative to — the same root `/forge <slug>`
will resolve when it looks for this intent.

**Does not exist:**

1. Create the directory at main-root:

   ```bash
   MAIN_ROOT="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
   cd "$MAIN_ROOT"
   mkdir -p .forge/<slug>/context
   ```
2. Read `.claude/forge.config.json`'s `baseBranch` if the file exists,
   else use `"main"` — that path, too, is relative to the printed
   `MAIN_ROOT`, not the cwd.
3. Write `<MAIN_ROOT>/.forge/<slug>/intent.md` from
   `references/intent-template.md`,
   substituting `<slug>`, `<baseBranch>`, and `<YYYY-MM-DD>` (today,
   ISO date) into the frontmatter and title.
4. Report the file's path and, one line each, what every section wants
   (Problem, Desired outcome, Done means, Constraints, Context, Out of
   scope, How to run). Tell the user to fill it in (by hand or by
   re-running `/intent <slug>`) and stop. **Do not commit anything** —
   this file is intentionally uncommitted until `/forge`'s preflight
   commits it onto the feature branch.

**Exists, `status: draft`:** every read and write below is against
`<MAIN_ROOT>/.forge/<slug>/intent.md`, the file the probe fence above
found — never a same-named path resolved against some other cwd.

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
- Never resolve a `.forge/` path against the cwd. Every step that
  touches one runs after the standard preamble above, so `/intent` and
  `/forge` always agree on which checkout the intent belongs to.
