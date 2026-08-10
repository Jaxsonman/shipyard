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
  activeProjectId: 'all',
  page: 0,
  selectedTicket: null,
  activeDrawerTab: 'Overview',
  ghOk: true,
  search: '',
};

// Last-fetched raw payloads, kept for stringify-compare polling.
let lastTicketsJson = null;
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
  renderSidebar();
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
  if (state.ghOk) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `
    <div style="width:100%; padding:var(--space-2) var(--space-4); background:var(--color-accent-100); color:var(--color-accent-800); font-size:13px; border-bottom:2px solid var(--color-divider);">
      gh not authenticated — run: <code>gh auth login</code>
    </div>
  `;
}

// ---- render: sidebar -----------------------------------------------------

function renderSidebar() {
  const el = document.getElementById('sidebar');
  if (!el) return;

  const allCount = state.tickets.length;
  const rows = [{ id: 'all', name: 'All projects', repo: `${state.projects.length} repos`, count: allCount }].concat(
    state.projects.map((p) => ({
      id: p.id,
      name: p.name,
      repo: p.repo,
      count: p.openCount === null || p.openCount === undefined
        ? state.tickets.filter((t) => t.project === p.id).length
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
      state.activeDrawerTab = 'Overview';
      if (typeof window.renderDrawer === 'function') {
        window.renderDrawer();
      } else {
        console.log('Selected ticket (drawer not yet implemented, Task 6):', ticket);
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
    await Promise.all([loadProjects(), loadTickets(), loadHealth()]);
  } catch (err) {
    console.error('Failed to load dashboard data', err);
  }
  startPolling();
}

boot();
