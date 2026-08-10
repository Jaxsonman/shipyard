# Handoff: Shipyard Pipeline Dashboard

## Overview
A dashboard for the Shipyard SDLC pipeline (PRD → Kanban → Spec'd → Planned → Dev → QA → PR). Lets a team see every ticket, which stage it's in, per-stage time/token cost, and manage multiple linked project repos from one screen.

## About the Design Files
The files in this bundle are **design references built as an HTML prototype** — they show the intended look, layout, and interaction behavior, not production code to copy directly. Recreate this design in your codebase's existing stack (React, Vue, etc. — or pick the best fit if none exists yet), using its own component/data patterns. `Shipyard Dashboard.dc.html` is a single-file prototype (inline styles, a small templating syntax `{{ }}` for bindings, `sc-for`/`sc-if` for loops/conditionals) — read it as a spec, not as importable code.

## Fidelity
**High-fidelity.** Colors, type, spacing, and component styling are final (from the attached "Modernist" design system, see `styles.css`). Copy/labels are illustrative — ticket data is mocked. Recreate pixel-accurately using the codebase's own component library, applying the same design tokens.

## Screens / Views
Single-page app, three states layered on one screen: **Ticket table** (default), **Ticket drawer** (slide-over), **Add-project dialog** (modal).

### 1. Ticket table (main view)
- **Purpose**: Browse/filter tickets across all linked projects; see current pipeline stage at a glance.
- **Layout**: Top nav bar (full width, 2px bottom rule) → below it, a two-column layout: left sidebar (240px fixed, right border 2px) + main content (flex:1).
  - Nav: brand wordmark "Shipyard" left; "Tickets" link; search input (220px) + primary "New PRD" button, right-aligned, gap 16px (`--space-4`), padding 12px/16px (`--space-3`/`--space-4`).
  - Sidebar: "PROJECTS" kicker (uppercase, 11px, letter-spacing 0.08em) + ghost "+ Add" button, header row. Below: list of project rows — "All projects" (aggregate) then each linked repo. Each row: name (13px, weight 600) + repo path (11px, monospace, muted) stacked left, ticket-count tag right. Active row gets a tinted background (`--color-accent-100`) and accent-colored text; inactive rows transparent bg / default text. Click selects and filters.
  - Main content: page heading (project name or "All tickets", 32px bold) + one-line muted subtitle (repo path + pipeline stage list, or aggregate description). Below: a `.table`-styled data table — columns Ticket / Title / Stage / Priority / Owner / Updated. Stage cell shows a neutral tag + (if `simulateLive` and ticket is actively running) a small pulsing accent dot. Priority cell shows a tag colored by level (High = accent fill, Medium = accent outline, Low = neutral fill). Rows are clickable (cursor:pointer) → opens the drawer.
  - Pagination: below the table, flex row — left: muted "`{start}–{end} of {total}`" summary (12px); right: Prev/Next secondary buttons, disabled at the ends. Page size = 5.

### 2. Ticket drawer (slide-over, right)
- Opens on row click. Full-height, 480px max width, right-anchored, `--shadow-lg`, over a translucent dark backdrop (click backdrop or × to close).
- Header: ticket ID + repo name (kicker style, accent color, 10px uppercase) / ticket title (20px bold) / × close button (top right, ghost icon button).
- Meta row: owner · "updated {time}" · priority tag (12px, `.card-meta` spacing).
- **Pipeline timeline (Gantt)**: one row per pipeline stage (PRD, Kanban, Spec'd, Planned, Dev, QA, PR). Each row: 76px stage label (10px uppercase) — accent-colored if it's the ticket's current stage, muted neutral if past/future — then a 14px-tall track (`--color-surface` background) with a colored bar positioned by `left%`/`width%` (scaled against a 14-"day" timeline window); current-stage bar is accent-colored, past stages neutral-400. Right of the track: a 130px right-aligned monospace stat label, e.g. `"1h 40m · 420K/38K"` (time · input/output tokens used in that stage), same color as the stage label. Stages not yet reached show an empty track and no stat.
- Tab row below the timeline (Overview / Spec / Plan / Logs) — active tab styled as `.btn-secondary` (bordered), inactive as `.btn-ghost` (accent text, no border). Below: tab content — Overview shows the ticket description; Spec/Plan show their text (or a placeholder like "Not spec'd yet"); Logs shows a dark (`--color-neutral-900` bg / `--color-neutral-100` text) monospace `<pre>` block of pipeline run log lines.
- Footer (pinned to drawer bottom, above a divider): primary button "Approve → {next stage}" (or just "Approve" on the last stage), plus secondary "Reassign" and "Retry stage" (both currently stubbed — no handler).

### 3. Add-project dialog (modal)
- Triggered by sidebar "+ Add". Standard `.dialog-backdrop` + `.dialog` (440px-ish, centered, `--shadow-lg`).
- Title: "Link a local codebase".
- Body: a "Folder" field with a native file input using `webkitdirectory` (opens the OS folder picker; derives the folder name from the picked path) + helper text showing the picked folder name or a prompt; a "Project name" text field (prefilled from the folder name, editable).
- Actions: "Cancel" (secondary, closes) / "Link project" (primary, disabled until a folder or name is present). Confirming adds a new entry to the sidebar project list (repo label `"local: {folder}"`) and switches the table to it.

## Interactions & Behavior
- Clicking a project row filters the ticket table + resets to page 1; clicking a table row opens the drawer with that ticket's data and resets its tab to "Overview" (or the configured default tab).
- Drawer closes via × button or clicking the backdrop (not the drawer panel itself — event propagation stopped there).
- Pulsing "running" dot: `opacity` keyframe animation, 1.6s ease-in-out infinite, only shown on tickets flagged as actively running a stage (Dev/QA in the mock).
- Pagination: Prev/Next clamp at the first/last page; disabled state (button `disabled` + reduced opacity per design system) at bounds.
- Add-project flow is currently client-side only (no real filesystem read) — it captures the picked folder's name via `webkitRelativePath` and adds a mock project entry.

## State Management
Suggested state shape (mirrors the prototype's local state):
- `selectedTicketId` (nullable) — drives drawer open/closed + which ticket is shown.
- `activeDrawerTab` — `"Overview" | "Spec" | "Plan" | "Logs"`.
- `page` — current table page (0-indexed).
- `activeProjectId` — `"all"` or a project id; filters the ticket list.
- `projects` — array of linked repos (seed data + any added via the dialog).
- `addDialogOpen`, `pickedFolderName`, `newProjectName` — add-project dialog local state.
- Real implementation should replace the mock `RAW_TICKETS` array with actual pipeline/ticket data (e.g. from the board integration Shipyard's `kanban` plugin uses) and wire Approve/Reassign/Retry to real pipeline actions instead of stubs.

## Design Tokens
All from the attached "Modernist" design system (`styles.css` — token source of truth, copied into this folder):
- **Colors**: bg `#f3f2f2`, surface `#eae9e9`, text `#201e1d`, accent `#ec3013` (single-accent/mono scheme). Full 100–900 tonal ramps for neutral/accent in the CSS `:root`.
- **Type**: Archivo (heading weight 800) for headings and body, loaded via Google Fonts.
- **Spacing scale**: `--space-1` 4px … `--space-8` 32px.
- **Radius**: 0px everywhere (`--radius-sm/md/lg` all 0) — no rounded corners anywhere.
- **Shadows**: `--shadow-sm/md/lg`, ink-tinted, tuned to the light ground.
- **Components used**: `.nav`/`.nav-brand`, `.btn` + `.btn-primary/-secondary/-ghost/-icon`, `.tag` + `.tag-accent/-outline/-neutral`, `.table`, `.card-meta`/`.card-kicker` (reused for meta rows), `.field`/`.input`, `.dialog-backdrop`/`.dialog`/`.dialog-title`/`.dialog-body`/`.dialog-actions`, `.hr`.

## Assets
No images/icons in this design — text, tags, and CSS-drawn bars/dots only. If icons are wanted later, the attached design system specifies Lucide icons.

## Files
- `Shipyard Dashboard.dc.html` — the full prototype (single file: markup + inline logic).
- `styles.css` — the Modernist design-system stylesheet the prototype links to (tokens + component classes).
