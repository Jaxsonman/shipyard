# Jira backend — board operations

Used when `config.backend` is `"jira"`. `config.target` is a Jira project
key (e.g. `PROJ`). The ticket id `<id>` is the issue key (e.g. `PROJ-12`);
accept a bare key or a `…atlassian.net/browse/PROJ-12` URL.

This plugin bundles its own Atlassian remote MCP server (see
`plugins/planning/.mcp.json`). Its tools appear scoped as
`mcp__plugin_planning_atlassian__<toolName>`. The first call in a session
triggers a one-time OAuth prompt — if a tool call returns an auth/consent
error, tell the user to complete that prompt and retry.

## Auth check

There is no separate auth probe; the first tool call doubles as the check
(see OAuth note above).

## Fetch ticket

Call `mcp__plugin_planning_atlassian__getJiraIssue` with:

```json
{ "issueIdOrKey": "<id>" }
```

The result includes summary, description, status, labels, and comments. A
tool error (not found, no access) → report the error message verbatim and
stop.

## Edit ticket body

Call `mcp__plugin_planning_atlassian__editJiraIssue` with:

```json
{ "issueIdOrKey": "<id>", "fields": { "description": "<new body>" } }
```

## Set status

Prefer a real workflow transition:

1. Call `mcp__plugin_planning_atlassian__getTransitionsForJiraIssue`
   (`{"issueIdOrKey": "<id>"}`).
2. Look for a transition whose target status name matches the intended
   status, case-insensitively, accepting close variants: for `Spec'd`
   match "Spec'd" / "Specced" / "Spec"; for `Planned` match "Planned" /
   "Planning done".
3. If found, call `mcp__plugin_planning_atlassian__transitionJiraIssue`
   with that transition's id.
4. **If no transition matches**, tell the user their workflow has no
   matching status and fall back to labels via `editJiraIssue`: add
   `ship-specced` or `ship-planned` to the issue's labels and remove the
   other `ship-*` label if present. Never silently fail and never skip the
   user-facing explanation.

## Post comment

Call `mcp__plugin_planning_atlassian__addCommentToJiraIssue` with:

```json
{ "issueIdOrKey": "<id>", "commentBody": "<comment markdown>" }
```

