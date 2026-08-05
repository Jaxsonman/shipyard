# GitHub backend — board operations (comment-only)

Used when `config.backend` is `"github"`. `config.target` is `owner/repo`.
The ticket id `<id>` is the issue number (e.g. `42`); accept `42`, `#42`,
or `https://github.com/<owner>/<repo>/issues/42` as input. If a URL names a
different repo than `config.target`, warn the user and get confirmation
before proceeding against the URL's repo.

**This plugin never changes ticket status or labels.** Only ship
transitions tickets. These are the only board operations dev performs.

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
The `comments` array is where the skill reads `ship:*` structured headers
(round detection, fix-lists).

## Post comment

Write the comment markdown to a temp file, then:

```bash
gh issue comment <id> --repo <owner/repo> --body-file <temp-file-path>
```

Non-zero exit → report stderr verbatim; the skill's handoff fallback
(write the report to `docs/ship/<id>/`) handles preservation.
