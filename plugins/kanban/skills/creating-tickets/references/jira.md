# Jira backend

Used when `config.backend` is `"jira"`. `config.target` is a Jira project
key (e.g. `PROJ`).

This plugin bundles its own Atlassian remote MCP server (see
`plugins/kanban/.mcp.json`), so no other plugin needs to be installed. Its
tools appear scoped as `mcp__plugin_kanban_atlassian__<toolName>`. The first
call in a session triggers a one-time OAuth prompt — if a tool call returns
an auth/consent error, tell the user to complete that prompt and retry.

## List tickets for duplicate detection (Step 4 of SKILL.md)

Call `mcp__plugin_kanban_atlassian__searchJiraIssuesUsingJql` with:

```json
{
  "jql": "project = \"<TARGET>\"",
  "maxResults": 100,
  "startAt": 0
}
```

fetching `key`, `summary` and `description` for each result. Repeat the call,
incrementing `startAt` by 100 each time, until a page returns fewer than 100
issues — scanning every page's `description` locally as it comes back.
Never report "no duplicates found" until every page has been scanned.

Filter **locally** for issues whose `description` contains a line exactly
`Source PRD: <slug>`. Do not put that string in the JQL as
`text ~ "Source PRD: <slug>"` — JQL tokenizes on the colon and the result is
wrong.

Report matches using each issue's key + a
`https://<their-site>.atlassian.net/browse/<key>` link, or whatever URL shape
the tool result returns — do not hardcode a site hostname, read it from the
tool's response.

## Create a ticket (Step 6 of SKILL.md)

Issue types are project-specific — team-managed, Kanban-template, and
non-software projects frequently lack a "Story" type. Before creating any
tickets in this run, resolve the issue type **once** by calling
`mcp__plugin_kanban_atlassian__getJiraProjectIssueTypesMetadata` with:

```json
{
  "projectKey": "<TARGET>"
}
```

From the returned issue types, pick one in this order of preference:

1. "Story", if present.
2. Otherwise "Task", if present.
3. Otherwise the first standard (non-subtask) issue type returned.

Reuse this resolved issue type for every `createJiraIssue` call in the run —
do not re-query per ticket.

Call `mcp__plugin_kanban_atlassian__createJiraIssue` with:

```json
{
  "projectKey": "<TARGET>",
  "issueType": "<resolved issue type>",
  "summary": "<title>",
  "description": "<body>"
}
```

`<body>` is the full ticket template from SKILL.md Step 3 (Description /
Acceptance Criteria / How to verify / Source PRD line).

On success, the tool result includes the created issue's key and/or URL —
record that for the Step 7 summary.

On failure, capture the tool's error message as the error reason for the
Step 7 summary and continue to the next ticket.

## List open tickets (Step 3 of SKILL.md)

Call `mcp__plugin_kanban_atlassian__searchJiraIssuesUsingJql` with:

```json
{
  "jql": "project = \"<TARGET>\" AND statusCategory != Done"
}
```

Each returned issue's key (e.g. `PROJ-12`) is the ref used in
`Depends on:` lines, and the summaries are what Step 3 scans when deciding
whether a new slice plausibly builds on existing work.

## Verify a ticket exists (Step 3 of SKILL.md)

Call `mcp__plugin_kanban_atlassian__searchJiraIssuesUsingJql` with:

```json
{
  "jql": "key = \"<KEY>\""
}
```

A non-empty result confirms the ref exists; any status counts — a
dependency on a Done ticket is already satisfied. An empty result means
the ref is wrong and must be fixed or removed at the gate.

Also used at the Step 5 gate, to verify any existing-board ref the user adds
there.
