# GitHub backend — board operations

Used when `config.backend` is `"github"`. `config.target` is `owner/repo`.
The ticket id `<id>` is the issue number (e.g. `42`); accept `42`, `#42`,
or `https://github.com/<owner>/<repo>/issues/42` as input. If a URL names a
different repo than `config.target`, warn the user and get confirmation
before proceeding against the URL's repo.

## Auth check

Once per session, before the first call:

```bash
gh auth status
```

If this fails, tell the user to run `gh auth login` and stop — do not
attempt any board operation without valid auth.

## Fetch ticket

```bash
gh issue view <id> --repo <owner/repo> --json number,title,body,labels,url,comments
```

Non-zero exit (not found, no access) → report the stderr verbatim and stop.

## Edit ticket body

Write the new body to a temp file, then:

```bash
gh issue edit <id> --repo <owner/repo> --body-file <temp-file-path>
```

## Set status

Statuses map to labels: `Spec'd` → `ship:specced`; `Planned` → `ship:planned`.

1. Ensure the target label exists (idempotent — `--force` updates an
   existing label instead of erroring):

   ```bash
   gh label create "ship:specced" --repo <owner/repo> --color "1D76DB" --description "Spec approved — see docs/ship/<id>/spec.md" --force
   gh label create "ship:planned" --repo <owner/repo> --color "5319E7" --description "Plan approved — see docs/ship/<id>/plan.md" --force
   ```

   (Only create the one you are about to apply.)

2. Apply it, removing any *other* `ship:*` label that the fetched ticket
   actually carries (never pass `--remove-label` for a label the ticket
   doesn't have):

   ```bash
   gh issue edit <id> --repo <owner/repo> --add-label "ship:planned" --remove-label "ship:specced"
   ```

Non-zero exit → report stderr verbatim and stop; the skill's re-run
recovery handles the retry.

## Post comment

Write the comment markdown to a temp file, then:

```bash
gh issue comment <id> --repo <owner/repo> --body-file <temp-file-path>
```

