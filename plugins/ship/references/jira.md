# Jira backend — board operations (conductor: includes set-status)

Used when `config.backend` is `"jira"`. `config.target` is a Jira project
key (e.g. `PROJ`). The ticket id `<id>` is the issue key (e.g. `PROJ-12`);
accept a bare key or a `…atlassian.net/browse/PROJ-12` URL.

This plugin bundles its own Atlassian remote MCP server (see
`plugins/ship/.mcp.json`). Its tools appear scoped as
`mcp__plugin_ship_atlassian__<toolName>`. The first call in a session
triggers a one-time OAuth prompt — if a tool call returns an auth/consent
error, tell the user to complete that prompt and retry.

## Auth check

There is no separate auth probe; the first tool call doubles as the check
(see OAuth note above).

## Fetch ticket

Call `mcp__plugin_ship_atlassian__getJiraIssue` with:

```json
{ "issueIdOrKey": "<id>" }
```

The result includes summary, description, status, labels, and comments. A
tool error (not found, no access) → report the error message verbatim and
stop.

## Read status

Prefer the issue's real workflow status, matched case-insensitively with
close variants: "Spec'd"/"Specced" → Spec'd; "Planned" → Planned;
"In Dev"/"In Development"/"In Progress" → In Dev; "In QA"/"QA"/"Testing"
→ In QA; "Awaiting Review"/"In Review"/"Review" → Awaiting Review;
"Needs Human"/"Blocked" → Needs Human. If the workflow status is generic
(e.g. "To Do"/"In Progress" only), fall back to the `ship-*` labels:
`ship-specced`, `ship-planned`, `ship-in-dev`, `ship-in-qa`,
`ship-awaiting-review`, `ship-needs-human` — same map as GitHub,
hyphenated. Neither → Backlog.

A dependency ticket counts as **satisfied** when its status category is
Done, or it carries `ship-approved` / `ship-pr-open` (v2 labels —
accepted if present, never created by v1).

## List ready tickets

Call `mcp__plugin_ship_atlassian__searchJiraIssuesUsingJql` with:

```json
{ "jql": "project = <config.target> AND (status = \"Planned\" OR labels = ship-planned) AND statusCategory != Done ORDER BY created ASC" }
```

## Post comment

Call `mcp__plugin_ship_atlassian__addCommentToJiraIssue` with:

```json
{ "issueIdOrKey": "<id>", "commentBody": "<comment markdown>" }
```

## Set status

Prefer a real workflow transition:

1. Call `mcp__plugin_ship_atlassian__getTransitionsForJiraIssue`
   (`{"issueIdOrKey": "<id>"}`).
2. Look for a transition whose target status name matches the intended
   status, case-insensitively, accepting close variants (same variant
   sets as Read status above).
3. If found, call `mcp__plugin_ship_atlassian__transitionJiraIssue` with
   that transition's id.
4. **If no transition matches**, tell the user their workflow has no
   matching status and fall back to labels via
   `mcp__plugin_ship_atlassian__editJiraIssue`: add the hyphenated label
   (`ship-in-dev` / `ship-in-qa` / `ship-awaiting-review` /
   `ship-needs-human`) and remove any other `ship-*` label present.
   Never silently fail and never skip the user-facing explanation.

Ship never applies `ship-specced` or `ship-planned` — re-entry after an
escalation is the human's action, not ship's.
