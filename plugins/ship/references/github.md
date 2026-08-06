# GitHub backend — board operations (conductor: includes set-status)

Used when `config.backend` is `"github"`. `config.target` is `owner/repo`.
The ticket id `<id>` is the issue number (e.g. `42`); accept `42`, `#42`,
or `https://github.com/<owner>/<repo>/issues/42` as input. If a URL names a
different repo than `config.target`, warn the user and get confirmation
before proceeding against the URL's repo.

Ship is the conductor: alongside planning, it is the only stage whose
reference includes Set status. Only ship transitions tickets during the
dev ⇄ QA loop.

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

Status is derived from the fetched `labels`, mapped:

| Label | Status |
|-------|--------|
| `ship:specced` | Spec'd |
| `ship:planned` | Planned |
| `ship:in-dev` | In Dev |
| `ship:in-qa` | In QA |
| `ship:awaiting-review` | Awaiting Review |
| `ship:needs-human` | Needs Human |
| (no `ship:*` label) | Backlog |

If a ticket somehow carries more than one `ship:*` label, treat the state
as irreconcilable — the skill's resume rules handle it (Needs Human,
never guess).

A dependency ticket counts as **satisfied** when its issue `state` is
`CLOSED`, or it carries `ship:approved` or `ship:pr-open` (v2 labels —
accepted if present, never created by v1).

## List ready tickets

```bash
gh issue list --repo <owner/repo> --label "ship:planned" --state open --json number,title,url
```

## Post comment

Write the comment markdown to a temp file, then:

```bash
gh issue comment <id> --repo <owner/repo> --body-file <temp-file-path>
```

## Set status

Ship applies only its own four labels. Create the one you are about to
apply, idempotently (`--force` updates an existing label instead of
erroring):

```bash
gh label create "ship:in-dev" --repo <owner/repo> --color "0E8A16" --description "Dev round in progress — see ship:dev comments" --force
gh label create "ship:in-qa" --repo <owner/repo> --color "FBCA04" --description "QA verification in progress — see ship:qa comments" --force
gh label create "ship:awaiting-review" --repo <owner/repo> --color "D93F0B" --description "QA passed — review packet posted, human verdict needed" --force
gh label create "ship:needs-human" --repo <owner/repo> --color "B60205" --description "Escalated — see latest escalation comment" --force
```

(Only create the one you are about to apply.)

Then apply it, removing any *other* `ship:*` label that the fetched
ticket actually carries (never pass `--remove-label` for a label the
ticket doesn't have):

```bash
gh issue edit <id> --repo <owner/repo> --add-label "ship:in-qa" --remove-label "ship:in-dev"
```

Ship never applies `ship:specced` or `ship:planned` — moving a ticket
back to Planned after an escalation is the human's re-entry action, not
ship's.

Non-zero exit → report stderr verbatim and stop; the skill's resume path
handles the re-run.
