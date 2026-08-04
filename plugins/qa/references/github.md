# GitHub backend — board operations (comment-only)

QA is a pure worker: it reads tickets and posts comments. There is
deliberately **no set-status operation** in this file — only ship
transitions tickets (design decision 6). Do not add one.

Used when `config.backend` is `"github"`. `config.target` is `owner/repo`
(from `.claude/kanban.config.json`). The ticket id `<id>` is the issue
number (e.g. `42`); accept `42`, `#42`, or
`https://github.com/<owner>/<repo>/issues/42` as input. If a URL names a
different repo than `config.target`, warn the user and get confirmation
before proceeding against the URL's repo (standalone only — ship-invoked
runs fail fast on the mismatch instead).

## Auth check

Once per session, before the first call:

```bash
gh auth status
```

If this fails: standalone → tell the user to run `gh auth login` and stop;
ship-invoked → this is a board-unavailable error (see the skill's error
handling). Never attempt board operations without valid auth.

## Fetch ticket

```bash
gh issue view <id> --repo <owner/repo> --json number,title,body,labels,url,comments
```

Non-zero exit (not found, no access) → report the stderr verbatim and fail
fast.

## Post comment

Write the comment markdown to a temp file, then:

```bash
gh issue comment <id> --repo <owner/repo> --body-file <temp-file-path>
```

Non-zero exit → the skill's verdict-preservation rule applies (retry once,
then save the comment to the artifacts dir and set `commentPosted: false`).
