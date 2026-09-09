# GitHub backend — board and pull-request operations (pipeline exit)

Used when `config.backend` is `"github"`. `config.target` is `owner/repo`.
The ticket id `<id>` is the issue number (e.g. `42`); accept `42`, `#42`,
or `https://github.com/<owner>/<repo>/issues/42` as input. If a URL names a
different repo than `config.target`, warn the user and get confirmation
before proceeding against the URL's repo.

`pr` is the pipeline's exit. It owns exactly two label transitions —
`ship:approved` → `ship:pr-open` on success, and `ship:approved` →
`ship:needs-human` on an unmergeable branch — and it is **the only stage in
the pipeline that pushes**.

## Auth check

Once per session, before the first call:

```bash
gh auth status
```

If this fails, tell the user to run `gh auth login` and stop — do not
attempt any board operation without valid auth.

## Fetch ticket

```bash
gh issue view <id> --repo <owner/repo> --json number,title,body,labels,state,url,comments
```

Non-zero exit (not found, no access) → report the stderr verbatim and stop.

## Read status

Status is derived from the fetched `labels` using the label ladder in
`${CLAUDE_PLUGIN_ROOT}/references/contract.md` §4. More than one `ship:*`
label is irreconcilable — never guess.

`pr` runs only on `ship:approved`. Any other status is a refusal, with the
remedy named (see the skill's Step 1).

## List approved tickets

```bash
gh issue list --repo <owner/repo> --label "ship:approved" --state open --json number,title,url
```

## Post comment

Write the comment markdown to a temp file, then:

```bash
gh issue comment <id> --repo <owner/repo> --body-file <temp-file-path>
```

## Set status

Create the label you are about to apply, idempotently (`--force` updates an
existing label instead of erroring). Colours and descriptions are the ones
in contract §4 — do not improvise them:

```bash
gh label create "ship:pr-open" --repo <owner/repo> --color "8250DF" --description "PR opened — see the ship:pr comment" --force
gh label create "ship:needs-human" --repo <owner/repo> --color "B60205" --description "Escalated — see latest escalation comment" --force
```

(Only create the one you are about to apply.)

Then apply it, removing `ship:approved`:

```bash
gh issue edit <id> --repo <owner/repo> --add-label "ship:pr-open" --remove-label "ship:approved"
```

Never pass `--remove-label` for a label the fetched ticket does not carry.
`pr` never applies any other `ship:*` label, and never closes the issue —
the `Closes #<id>` line in the PR body closes it when the PR merges.

Non-zero exit → report stderr verbatim and stop.

## Push the branch

This is the one place in the whole Shipyard pipeline that pushes:

```bash
git -C <checkout> push -u origin <branch>
```

Never `--force`, never `--force-with-lease`, never push any other ref. If
the push is rejected (non-fast-forward, protected branch, no write access),
report stderr verbatim and stop — do not retry with force.

## Find an existing PR

```bash
gh pr list --repo <owner/repo> --head <branch> --state open --json url,number,title
```

A non-empty result means the PR already exists: reconcile, never duplicate.

## Open the PR

Write the body to a temp file, then:

```bash
gh pr create --repo <owner/repo> --base <baseBranch> --head <branch> --title <ticket title> --body-file <temp-file-path>
```

`<baseBranch>` is `baseBranch` from `.claude/ship.config.json`. Print the URL
the command returns — it is the `<url>` in the `ship:pr opened <url>` header.
