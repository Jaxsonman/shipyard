'use strict';

// Shipyard dashboard frontend. No build step, no dependencies — plain DOM
// rendering against the Task 4 HTTP API. Task 6 adds renderDrawer() and
// renderAddDialog() to this same file; state fields/render fn names below
// match the contract in task-5-brief.md so that work slots in cleanly.

const PAGE_SIZE = 5;
const POLL_MS = 30000;

const state = {
  projects: [],
  tickets: [],
  // Always the unfiltered (project=all) ticket list — used only to compute
  // sidebar counts, so they stay correct regardless of which project is
  // active (state.tickets is server-filtered by activeProjectId and is not
  // a safe source for "All projects"/sibling counts — see fix report).
  allTickets: [],
  activeProjectId: 'all',
  page: 0,
  selectedTicket: null,
  activeDrawerTab: 'Overview',
  ghOk: true,
  boardWarning: null,
  search: '',
};

// Last-fetched raw payloads, kept for stringify-compare polling.
let lastTicketsJson = null;
let lastAllTicketsJson = null;
let lastHealthJson = null;

// ---- helpers --------------------------------------------------------

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function priorityClass(p) {
  if (p === 'High') return 'tag-accent';
  if (p === 'Medium') return 'tag-outline';
  if (p === 'Low') return 'tag-neutral';
  return null;
}

function relativeTime(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

// ---- data loading -----------------------------------------------------

function ticketsForProject(projectId) {
  const list = projectId === 'all'
    ? state.tickets
    : state.tickets.filter((t) => t.project === projectId);
  const q = state.search.trim().toLowerCase();
  if (!q) return list;
  return list.filter((t) => {
    const num = String(t.number).toLowerCase();
    const title = (t.title || '').toLowerCase();
    return num.includes(q) || title.includes(q);
  });
}

async function loadProjects() {
  const data = await fetchJson('/api/projects');
  state.projects = data.projects || [];
  state.boardWarning = data.warning || null;
  renderSidebar();
  renderBanner();
}

async function loadTickets({ preserve = false } = {}) {
  const url = '/api/tickets?project=' + encodeURIComponent(state.activeProjectId);
  const data = await fetchJson(url);
  const json = JSON.stringify(data);
  if (json === lastTicketsJson) return;
  lastTicketsJson = json;
  state.tickets = data.tickets || [];
  if (!preserve) state.page = 0;
  renderSidebar();
  renderTable();
}

async function loadAllTicketsForCounts() {
  const data = await fetchJson('/api/tickets?project=all');
  const json = JSON.stringify(data);
  if (json === lastAllTicketsJson) return;
  lastAllTicketsJson = json;
  state.allTickets = data.tickets || [];
  renderSidebar();
}

async function loadHealth() {
  const data = await fetchJson('/api/health');
  const json = JSON.stringify(data);
  if (json === lastHealthJson) return;
  lastHealthJson = json;
  state.ghOk = !!data.gh;
  renderBanner();
}

// ---- render: banner -----------------------------------------------------

function renderBanner() {
  const el = document.getElementById('banner');
  if (!el) return;

  let html = '';
  if (!state.ghOk) {
    html += `
      <div style="width:100%; padding:var(--space-2) var(--space-4); background:var(--color-accent-100); color:var(--color-accent-800); font-size:13px; border-bottom:2px solid var(--color-divider);">
        gh not authenticated — run: <code>gh auth login</code>
      </div>
    `;
  }
  if (state.boardWarning) {
    html += `
      <div style="width:100%; padding:var(--space-2) var(--space-4); background:var(--color-accent-100); color:var(--color-accent-800); font-size:13px; border-bottom:2px solid var(--color-divider);">
        ${esc(state.boardWarning)}
      </div>
    `;
  }
  el.innerHTML = html;
}

// ---- render: sidebar -----------------------------------------------------

function renderSidebar() {
  const el = document.getElementById('sidebar');
  if (!el) return;

  const allCount = state.allTickets.length;
  const rows = [{ id: 'all', name: 'All projects', repo: `${state.projects.length} repos`, count: allCount }].concat(
    state.projects.map((p) => ({
      id: p.id,
      name: p.name,
      repo: p.repo,
      count: p.openCount === null || p.openCount === undefined
        ? state.allTickets.filter((t) => t.project === p.id).length
        : p.openCount,
    }))
  );

  const header = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:var(--space-2);">
      <h6 style="margin:0;">Projects</h6>
      <button class="btn btn-ghost" id="add-project-btn" style="padding:2px 6px; font-size:12px;">+ Add</button>
    </div>
  `;

  const rowsHtml = rows
    .map((r) => {
      const isActive = state.activeProjectId === r.id;
      const bg = isActive ? 'var(--color-accent-100)' : 'transparent';
      const textColor = isActive ? 'var(--color-accent-700)' : 'var(--color-text)';
      return `
        <div class="sidebar-row" data-project-id="${esc(r.id)}" style="display:flex; align-items:center; justify-content:space-between; gap:var(--space-2); padding:var(--space-2); background:${bg}; cursor:pointer;">
          <div style="min-width:0;">
            <div style="font-size:13px; font-weight:600; color:${textColor}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(r.name)}</div>
            <div style="font-size:11px; font-family:monospace; color:var(--color-neutral-600); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(r.repo)}</div>
          </div>
          <span class="tag tag-neutral" style="flex:none;">${esc(r.count)}</span>
        </div>
      `;
    })
    .join('');

  el.innerHTML = header + rowsHtml;

  el.querySelectorAll('.sidebar-row').forEach((rowEl) => {
    rowEl.addEventListener('click', () => {
      state.activeProjectId = rowEl.getAttribute('data-project-id');
      state.page = 0;
      renderSidebar();
      loadTickets({ preserve: true });
    });
  });

  const addBtn = document.getElementById('add-project-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      if (typeof window.openAddDialog === 'function') {
        window.openAddDialog();
      } else {
        console.log('Add project dialog not yet implemented (Task 6).');
      }
    });
  }
}

// ---- render: table -----------------------------------------------------

function renderTable() {
  const el = document.getElementById('main');
  if (!el) return;

  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);
  const headerTitle = activeProject ? activeProject.name : 'All tickets';
  const headerSubtitle = activeProject
    ? `${activeProject.repo} — Backlog → Spec'd → Planned → Dev → QA → Awaiting Review.`
    : 'Every ticket across every project, wherever it sits in the pipeline.';

  const rows = ticketsForProject(state.activeProjectId);
  const pageCount = Math.max(Math.ceil(rows.length / PAGE_SIZE), 1);
  const page = Math.min(Math.max(state.page, 0), pageCount - 1);
  state.page = page;
  const pageRows = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const rangeStart = rows.length ? page * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min(page * PAGE_SIZE + PAGE_SIZE, rows.length);
  const pageSummary = `${rangeStart}–${rangeEnd} of ${rows.length}`;
  const isFirstPage = page === 0;
  const isLastPage = page >= pageCount - 1;

  const bodyRows = pageRows
    .map((t) => {
      const stageTitle = t.conflict ? ' title="multiple ship:* labels"' : '';
      const dot = t.running ? '<span class="dot-running"></span>' : '';
      const pCls = priorityClass(t.priority);
      const priorityCell = pCls
        ? `<span class="tag ${pCls}">${esc(t.priority)}</span>`
        : '<span class="text-muted">—</span>';
      return `
        <tr class="ticket-row" style="cursor:pointer;" data-project="${esc(t.project)}" data-number="${esc(t.number)}">
          <td>#${esc(t.number)}</td>
          <td>${esc(t.title)}</td>
          <td><span class="tag tag-neutral"${stageTitle}>${esc(t.stage)}</span>${dot}</td>
          <td>${priorityCell}</td>
          <td>${esc(t.assignee || '—')}</td>
          <td>${esc(relativeTime(t.updatedAt))}</td>
        </tr>
      `;
    })
    .join('');

  el.innerHTML = `
    <div style="padding:var(--space-6) var(--space-6) 0;">
      <h2 style="margin-bottom:2px;">${esc(headerTitle)}</h2>
      <p class="text-muted" style="font-size:13px; margin-bottom:var(--space-4);">${esc(headerSubtitle)}</p>
    </div>
    <div style="padding:0 var(--space-6) var(--space-6);">
      <table class="table">
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Title</th>
            <th>Stage</th>
            <th>Priority</th>
            <th>Owner</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          ${bodyRows || '<tr><td colspan="6" class="text-muted">No tickets.</td></tr>'}
        </tbody>
      </table>
      <div style="display:flex; align-items:center; justify-content:space-between; padding-top:var(--space-3);">
        <span class="text-muted" style="font-size:12px;">${esc(pageSummary)}</span>
        <div style="display:flex; gap:var(--space-2);">
          <button class="btn btn-secondary" id="prev-page" ${isFirstPage ? 'disabled' : ''}>Prev</button>
          <button class="btn btn-secondary" id="next-page" ${isLastPage ? 'disabled' : ''}>Next</button>
        </div>
      </div>
    </div>
  `;

  el.querySelectorAll('.ticket-row').forEach((rowEl) => {
    rowEl.addEventListener('click', () => {
      const project = rowEl.getAttribute('data-project');
      const number = Number(rowEl.getAttribute('data-number'));
      const ticket = state.tickets.find((t) => t.project === project && t.number === number) || null;
      state.selectedTicket = ticket;
      if (ticket && typeof window.openDrawer === 'function') {
        window.openDrawer(project, number);
      } else if (typeof window.renderDrawer === 'function') {
        state.activeDrawerTab = 'Overview';
        window.renderDrawer();
      }
    });
  });

  const prevBtn = document.getElementById('prev-page');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      state.page = Math.max(state.page - 1, 0);
      renderTable();
    });
  }
  const nextBtn = document.getElementById('next-page');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      state.page = Math.min(state.page + 1, pageCount - 1);
      renderTable();
    });
  }
}

// ---- render: drawer -----------------------------------------------------

// Full detail payload for the currently-open drawer ticket (body, spec,
// plan, logs, timeline) — fetched fresh on open/refetch; state.selectedTicket
// (the list-row shape) drives *which* ticket is open.
let drawerDetail = null;
let drawerError = '';

async function openDrawer(project, number, { preserveTab = false } = {}) {
  if (!preserveTab) state.activeDrawerTab = 'Overview';
  drawerError = '';
  try {
    const data = await fetchJson(`/api/tickets/${encodeURIComponent(project)}/${encodeURIComponent(number)}`);
    drawerDetail = data.ticket;
  } catch (err) {
    console.error('Failed to load ticket detail', err);
    drawerDetail = null;
    drawerError = (err && err.message) || String(err);
  }
  renderDrawer();
}

function closeDrawer() {
  state.selectedTicket = null;
  drawerDetail = null;
  drawerError = '';
  renderDrawer();
}

function approveEligibility(stage) {
  if (stage === 'Awaiting Review') return { enabled: true, label: 'Approve — close ticket' };
  if (stage === 'Needs Human') return { enabled: true, label: 'Approve → Planned' };
  return { enabled: false, label: 'Approve' };
}

function renderDrawer() {
  const el = document.getElementById('drawer-root');
  if (!el) return;

  if (!state.selectedTicket) {
    el.innerHTML = '';
    return;
  }

  if (!drawerDetail) {
    el.innerHTML = drawerError
      ? `
        <div class="drawer-backdrop" id="drawer-backdrop">
          <div class="drawer-panel" id="drawer-panel">
            <div style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:var(--space-2);">
              <h4 style="margin:0;">Failed to load ticket</h4>
              <button class="btn btn-icon btn-ghost" id="drawer-close">×</button>
            </div>
            <div style="color:var(--color-accent); font-size:13px;">${esc(drawerError)}</div>
          </div>
        </div>
      `
      : '';
    const backdropEl = document.getElementById('drawer-backdrop');
    if (backdropEl) backdropEl.addEventListener('click', () => closeDrawer());
    const panelEl = document.getElementById('drawer-panel');
    if (panelEl) panelEl.addEventListener('click', (ev) => ev.stopPropagation());
    const closeBtnEl = document.getElementById('drawer-close');
    if (closeBtnEl) closeBtnEl.addEventListener('click', () => closeDrawer());
    return;
  }

  const t = drawerDetail;
  const tabs = ['Overview', 'Spec', 'Plan', 'Logs'];
  const tabsHtml = tabs
    .map((tab) => {
      const active = state.activeDrawerTab === tab;
      const cls = active ? 'btn btn-secondary' : 'btn btn-ghost';
      return `<button class="${cls}" data-tab="${esc(tab)}">${esc(tab)}</button>`;
    })
    .join('');

  const ganttHtml = (t.timeline || [])
    .map((row) => {
      const isCurrent = row.state === 'current';
      const isPast = row.state === 'past';
      const labelColor = isCurrent ? 'var(--color-accent)' : 'var(--color-neutral-600)';
      const barColor = isCurrent ? 'var(--color-accent)' : isPast ? 'var(--color-neutral-400)' : 'transparent';
      return `
        <div style="display:grid; grid-template-columns:76px 1fr 130px; align-items:center; gap:var(--space-2);">
          <div style="font-size:10px; letter-spacing:0.04em; text-transform:uppercase; color:${labelColor};">${esc(row.label)}</div>
          <div class="gantt-track">
            <div class="gantt-bar" style="left:${row.startPct}%; width:${row.widthPct}%; background:${barColor};"></div>
          </div>
          <div style="font-size:11px; font-family:monospace; color:${labelColor}; text-align:right;">${esc(row.stat)}</div>
        </div>
      `;
    })
    .join('');

  let tabContent = '';
  if (state.activeDrawerTab === 'Overview') {
    tabContent = `<p style="font-size:14px; opacity:0.85; white-space:pre-wrap;">${esc(t.body)}</p>`;
  } else if (state.activeDrawerTab === 'Spec') {
    tabContent = `<p style="font-size:14px; opacity:0.85; white-space:pre-wrap;">${esc(t.spec || "Not spec'd yet")}</p>`;
  } else if (state.activeDrawerTab === 'Plan') {
    tabContent = `<p style="font-size:14px; opacity:0.85; white-space:pre-wrap;">${esc(t.plan || 'Not planned yet')}</p>`;
  } else if (state.activeDrawerTab === 'Logs') {
    const logsText = (t.logs || [])
      .map((l) => `[${l.createdAt}] ${l.header}${l.body ? `\n${l.body}` : ''}`)
      .join('\n\n');
    tabContent = `<pre style="background:var(--color-neutral-900); color:var(--color-neutral-100); font-size:12px; padding:var(--space-3); overflow-x:auto; white-space:pre-wrap; line-height:1.5;">${esc(logsText || 'No pipeline runs yet.')}</pre>`;
  }

  const { enabled: approveEnabled, label: approveLabel } = approveEligibility(t.stage);
  const pCls = priorityClass(t.priority);
  const priorityTag = pCls
    ? `<span class="tag ${pCls}">${esc(t.priority)}</span>`
    : '<span class="text-muted">—</span>';

  const errorHtml = drawerError
    ? `<div style="color:var(--color-accent); font-size:12px; width:100%;">${esc(drawerError)}</div>`
    : '';

  el.innerHTML = `
    <div class="drawer-backdrop" id="drawer-backdrop">
      <div class="drawer-panel" id="drawer-panel">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:var(--space-2);">
          <div>
            <div class="card-kicker">#${esc(t.number)} · ${esc(t.projectName)}</div>
            <h4 style="margin:2px 0 0;">${esc(t.title)}</h4>
          </div>
          <button class="btn btn-icon btn-ghost" id="drawer-close">×</button>
        </div>

        <div class="card-meta" style="margin-bottom:var(--space-4);">
          <span>${esc(t.assignee || '—')}</span>
          <span>·</span>
          <span>updated ${esc(relativeTime(t.updatedAt))}</span>
          <span>·</span>
          ${priorityTag}
        </div>

        <div style="margin-bottom:var(--space-4);">
          <h6 style="margin-bottom:var(--space-2);">Pipeline timeline</h6>
          <div style="display:flex; flex-direction:column; gap:6px;">
            ${ganttHtml}
          </div>
        </div>

        <div class="hr" style="margin:0 0 var(--space-4);"></div>

        <div style="display:flex; gap:var(--space-1); margin-bottom:var(--space-4);">
          ${tabsHtml}
        </div>

        ${tabContent}

        <div style="flex:1;"></div>
        <div class="hr" style="margin:var(--space-4) 0;"></div>
        <div style="display:flex; gap:var(--space-2); flex-wrap:wrap; align-items:center;">
          <button class="btn btn-primary" id="drawer-approve" ${approveEnabled ? '' : 'disabled'} ${approveEnabled ? '' : 'title="Pipeline-owned stage"'}>${esc(approveLabel)}</button>
          <button class="btn btn-secondary" id="drawer-reassign">Reassign</button>
          ${errorHtml}
        </div>
      </div>
    </div>
  `;

  const backdrop = document.getElementById('drawer-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', () => closeDrawer());
  }
  const panel = document.getElementById('drawer-panel');
  if (panel) {
    panel.addEventListener('click', (ev) => ev.stopPropagation());
  }
  const closeBtn = document.getElementById('drawer-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeDrawer());
  }
  el.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeDrawerTab = btn.getAttribute('data-tab');
      renderDrawer();
    });
  });
  const approveBtn = document.getElementById('drawer-approve');
  if (approveBtn && approveEnabled) {
    approveBtn.addEventListener('click', async () => {
      drawerError = '';
      try {
        const res = await fetch(`/api/tickets/${encodeURIComponent(t.project)}/${encodeURIComponent(t.number)}/approve`, {
          method: 'POST',
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `approve failed: ${res.status}`);
        }
        await openDrawer(t.project, t.number, { preserveTab: true });
        await Promise.all([loadTickets({ preserve: true }), loadAllTicketsForCounts()]);
      } catch (err) {
        drawerError = err.message || String(err);
        renderDrawer();
      }
    });
  }
  const reassignBtn = document.getElementById('drawer-reassign');
  if (reassignBtn) {
    reassignBtn.addEventListener('click', async () => {
      const login = window.prompt('GitHub login to assign:');
      if (!login) return;
      drawerError = '';
      try {
        const res = await fetch(`/api/tickets/${encodeURIComponent(t.project)}/${encodeURIComponent(t.number)}/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ login }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `assign failed: ${res.status}`);
        }
        await openDrawer(t.project, t.number, { preserveTab: true });
        await Promise.all([loadTickets({ preserve: true }), loadAllTicketsForCounts()]);
      } catch (err) {
        drawerError = err.message || String(err);
        renderDrawer();
      }
    });
  }
}

window.renderDrawer = renderDrawer;
window.openDrawer = openDrawer;

// ---- render: add-project dialog -----------------------------------------

let addDialogOpen = false;
let pickedFolderName = '';
let newProjectName = '';
let newProjectPath = '';
let addDialogError = '';

function openAddDialog() {
  addDialogOpen = true;
  pickedFolderName = '';
  newProjectName = '';
  newProjectPath = '';
  addDialogError = '';
  renderAddDialog();
}

function closeAddDialog() {
  addDialogOpen = false;
  renderAddDialog();
}

function renderAddDialog() {
  const el = document.getElementById('dialog-root');
  if (!el) return;

  if (!addDialogOpen) {
    el.innerHTML = '';
    return;
  }

  const linkDisabled = newProjectPath.trim().length === 0;
  const errorHtml = addDialogError
    ? `<div style="color:var(--color-accent); font-size:12px; margin-top:var(--space-2);">${esc(addDialogError)}</div>`
    : '';

  el.innerHTML = `
    <div class="dialog-backdrop" id="add-dialog-backdrop">
      <div class="dialog" id="add-dialog">
        <div class="dialog-title">Link a local codebase</div>
        <div class="dialog-body">
          <div class="field" style="margin-bottom:var(--space-3);">
            <label>Folder</label>
            <input class="input" type="file" id="add-dialog-folder" webkitdirectory directory>
            <div class="text-muted" style="font-size:12px; margin-top:6px;">${esc(pickedFolderName || 'Used only to prefill the project name below.')}</div>
          </div>
          <div class="field" style="margin-bottom:var(--space-3);">
            <label>Path</label>
            <input class="input" id="add-dialog-path" value="${esc(newProjectPath)}" placeholder="/absolute/path/to/repo">
            <div class="text-muted" style="font-size:12px; margin-top:6px;">The server validates this folder has a GitHub remote.</div>
          </div>
          <div class="field">
            <label>Project name</label>
            <input class="input" id="add-dialog-name" value="${esc(newProjectName)}" placeholder="e.g. Payments Service">
          </div>
          ${errorHtml}
        </div>
        <div class="dialog-actions">
          <button class="btn btn-secondary" id="add-dialog-cancel">Cancel</button>
          <button class="btn btn-primary" id="add-dialog-confirm" ${linkDisabled ? 'disabled' : ''}>Link project</button>
        </div>
      </div>
    </div>
  `;

  const backdrop = document.getElementById('add-dialog-backdrop');
  if (backdrop) backdrop.addEventListener('click', () => closeAddDialog());
  const dialog = document.getElementById('add-dialog');
  if (dialog) dialog.addEventListener('click', (ev) => ev.stopPropagation());
  const cancelBtn = document.getElementById('add-dialog-cancel');
  if (cancelBtn) cancelBtn.addEventListener('click', () => closeAddDialog());

  const folderInput = document.getElementById('add-dialog-folder');
  if (folderInput) {
    folderInput.addEventListener('change', () => {
      const file = folderInput.files && folderInput.files[0];
      if (!file) return;
      const rel = file.webkitRelativePath || '';
      const folderName = rel.split('/')[0] || '';
      pickedFolderName = folderName;
      if (!newProjectName) newProjectName = folderName;
      renderAddDialog();
    });
  }

  const pathInput = document.getElementById('add-dialog-path');
  if (pathInput) {
    pathInput.addEventListener('input', () => {
      newProjectPath = pathInput.value;
      const confirmBtn = document.getElementById('add-dialog-confirm');
      if (confirmBtn) confirmBtn.disabled = newProjectPath.trim().length === 0;
    });
  }

  const nameInput = document.getElementById('add-dialog-name');
  if (nameInput) {
    nameInput.addEventListener('input', () => {
      newProjectName = nameInput.value;
    });
  }

  const confirmBtn = document.getElementById('add-dialog-confirm');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      addDialogError = '';
      try {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: newProjectPath, name: newProjectName }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body.error || `link failed: ${res.status}`);
        }
        addDialogOpen = false;
        renderAddDialog();
        await loadProjects();
        if (body.project && body.project.id) {
          state.activeProjectId = body.project.id;
          state.page = 0;
          renderSidebar();
          await loadTickets();
        }
      } catch (err) {
        addDialogError = err.message || String(err);
        renderAddDialog();
      }
    });
  }
}

window.openAddDialog = openAddDialog;

// ---- search / nav wiring -----------------------------------------------

function wireStaticControls() {
  const search = document.getElementById('search');
  if (search) {
    search.addEventListener('input', () => {
      state.search = search.value;
      state.page = 0;
      renderTable();
    });
  }
  // "New PRD" is inert in v1 — tooltip only, per brief.
}

// ---- polling -----------------------------------------------------

function startPolling() {
  setInterval(() => {
    loadTickets({ preserve: true }).catch((err) => console.error('poll tickets failed', err));
    loadAllTicketsForCounts().catch((err) => console.error('poll ticket counts failed', err));
    loadHealth().catch((err) => console.error('poll health failed', err));
  }, POLL_MS);
}

// ---- boot -----------------------------------------------------

async function boot() {
  wireStaticControls();
  renderBanner();
  renderSidebar();
  renderTable();
  try {
    await Promise.all([loadProjects(), loadTickets(), loadAllTicketsForCounts(), loadHealth()]);
  } catch (err) {
    console.error('Failed to load dashboard data', err);
  }
  startPolling();
}

boot();
