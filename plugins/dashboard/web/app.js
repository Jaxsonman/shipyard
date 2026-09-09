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
  // Timeline view (Task 8).
  view: 'tickets',
  zoom: 'week',
  panMs: 0,
  stageFilter: new Set(),
  hideBacklog: false,
};

// Last-fetched raw payloads, kept for stringify-compare polling.
let lastTicketsJson = null;
let lastAllTicketsJson = null;
let lastHealthJson = null;
let lastTimelineJson = null;

// Latest /api/timeline payload ({ now, domain, groups, rows, warnings }).
let timelineData = null;
// Scale in effect for the last timeline render — reused by wheel/drag/keyboard
// pan handlers so they don't have to recompute domain+width themselves.
let tlScale = null;
let tlDragState = null;
let tlResizeTimer = null;

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
  renderMain();
}

async function loadAllTicketsForCounts() {
  const data = await fetchJson('/api/tickets?project=all');
  const json = JSON.stringify(data);
  if (json === lastAllTicketsJson) return;
  lastAllTicketsJson = json;
  state.allTickets = data.tickets || [];
  renderSidebar();
}

async function loadTimeline() {
  const url = '/api/timeline?project=' + encodeURIComponent(state.activeProjectId);
  const data = await fetchJson(url);
  const json = JSON.stringify(data);
  if (json === lastTimelineJson) return;
  lastTimelineJson = json;
  timelineData = data;
  renderMain();
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
      <div class="banner-warn">
        gh not authenticated — run: <code>gh auth login</code>
      </div>
    `;
  }
  if (state.boardWarning) {
    html += `
      <div class="banner-warn">
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
    <div class="sidebar-head">
      <h6>Projects</h6>
      <button class="btn btn-ghost sidebar-add-btn" id="add-project-btn">+ Add</button>
    </div>
  `;

  const rowsHtml = rows
    .map((r) => {
      const isActive = state.activeProjectId === r.id;
      const rowCls = isActive ? 'proj-row is-active focusable' : 'proj-row focusable';
      return `
        <div class="${rowCls}" data-project-id="${esc(r.id)}">
          <div class="proj-row-text">
            <div class="proj-name">${esc(r.name)}</div>
            <div class="proj-repo">${esc(r.repo)}</div>
          </div>
          <span class="tag tag-neutral proj-count">${esc(r.count)}</span>
        </div>
      `;
    })
    .join('');

  el.innerHTML = header + rowsHtml;

  el.querySelectorAll('.proj-row').forEach((rowEl) => {
    rowEl.addEventListener('click', () => {
      state.activeProjectId = rowEl.getAttribute('data-project-id');
      state.page = 0;
      renderSidebar();
      loadTickets({ preserve: true });
      loadTimeline().catch((err) => console.error('load timeline failed', err));
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

// ---- render: main (dispatch) --------------------------------------------

function renderMain() {
  if (state.view === 'timeline') {
    renderTimeline();
  } else {
    renderTable();
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
        <tr class="ticket-row row-click focusable" data-project="${esc(t.project)}" data-number="${esc(t.number)}">
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
    <div class="page-head">
      <h2 class="page-title">${esc(headerTitle)}</h2>
      <p class="text-muted page-sub">${esc(headerSubtitle)}</p>
    </div>
    <div class="page-body">
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
      <div class="pager">
        <span class="text-muted pager-summary">${esc(pageSummary)}</span>
        <div class="pager-actions">
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
      renderMain();
    });
  }
  const nextBtn = document.getElementById('next-page');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      state.page = Math.min(state.page + 1, pageCount - 1);
      renderMain();
    });
  }
}

// ---- render: timeline -----------------------------------------------------

// Rank of a past segment by recency within its row: newest past = 1, capped
// at 5 (matches the .tl-bar-past-1..5 neutral ramp in app.css).
function pastRecencyRanks(segments) {
  const pastIdx = [];
  segments.forEach((seg, i) => {
    if (seg.state === 'past') pastIdx.push(i);
  });
  const ranks = new Map();
  let rank = 1;
  for (let i = pastIdx.length - 1; i >= 0; i--) {
    ranks.set(pastIdx[i], Math.min(rank, 5));
    rank++;
  }
  return ranks;
}

function segmentBarClass(seg, rank, running) {
  const cls = ['tl-bar'];
  if (seg.state === 'current') {
    cls.push('tl-bar-current');
    if (running) cls.push('tl-bar-running');
  } else {
    cls.push(`tl-bar-past-${rank || 5}`);
  }
  if (seg.estimated) cls.push('tl-bar-est');
  return cls.join(' ');
}

function segmentTooltipText(seg) {
  const parts = [seg.stage];
  if (seg.round) parts.push(`round ${seg.round}`);
  if (seg.durationLabel) parts.push(seg.durationLabel);
  if (seg.tokensLabel) parts.push(seg.tokensLabel);
  if (seg.estimated) parts.push('estimated');
  return parts.join(' · ');
}

function timelineRowsForProject() {
  if (!timelineData) return { groups: [], rowsByProject: new Map() };
  const groups = timelineData.groups || [];
  const rows = timelineData.rows || [];
  const rowsByProject = new Map();
  rows.forEach((r) => {
    if (state.hideBacklog && r.backlog) return;
    if (!rowsByProject.has(r.project)) rowsByProject.set(r.project, []);
    rowsByProject.get(r.project).push(r);
  });
  return { groups, rowsByProject };
}

function tlPanBySpan(fraction) {
  if (!tlScale) return;
  const spanMs = tlScale.end - tlScale.start;
  applyTlPan(state.panMs + spanMs * fraction);
}

function applyTlPan(panMs) {
  if (!timelineData) return;
  const preset = TimelineScale.ZOOM_PRESETS.find((p) => p.id === state.zoom) || TimelineScale.ZOOM_PRESETS[1];
  const spanMs = preset.spanMs === null ? (tlScale ? tlScale.end - tlScale.start : 0) : preset.spanMs;
  state.panMs = TimelineScale.clampPan(panMs, spanMs, {
    now: timelineData.now,
    dataStart: timelineData.domain.start,
    dataEnd: timelineData.domain.end,
  });
  renderTimeline();
}

function hideTlTip() {
  const tip = document.getElementById('tl-tip');
  if (tip) tip.hidden = true;
}

function showTlTip(barEl, text) {
  const tip = document.getElementById('tl-tip');
  if (!tip) return;
  tip.textContent = text;
  tip.hidden = false;
  const barRect = barEl.getBoundingClientRect();
  tip.style.left = `${barRect.left + barRect.width / 2}px`;
  tip.style.top = `${barRect.top}px`;
}

// Whether a row has at least one segment matching the active stage filter.
// Stage-name based only (no geometry needed), so this can run before the
// track width is known — it decides which rows even get a <div> at all.
function rowMatchesStageFilter(row) {
  if (state.stageFilter.size === 0) return true;
  return (row.segments || []).some((s) => state.stageFilter.has(s.stage));
}

function renderTimeline() {
  const el = document.getElementById('main');
  if (!el) return;

  if (!timelineData) {
    el.innerHTML = '<div class="page-head"><h2 class="page-title">Timeline</h2></div><div class="page-body"><p class="text-muted">Loading…</p></div>';
    return;
  }

  const zoomHtml = TimelineScale.ZOOM_PRESETS.map((p) => {
    const cls = state.zoom === p.id ? 'btn btn-secondary' : 'btn btn-ghost';
    return `<button class="${cls}" data-zoom="${esc(p.id)}">${esc(p.label)}</button>`;
  }).join('');

  const chipsHtml = TimelineScale.STAGE_ROWS.map((stage) => {
    const pressed = state.stageFilter.has(stage);
    return `<button class="chip" data-stage="${esc(stage)}" aria-pressed="${pressed ? 'true' : 'false'}">${esc(stage)}</button>`;
  }).join('');

  const { groups, rowsByProject } = timelineRowsForProject();

  // Phase 1: pick which rows render (stage-name filter only — no geometry
  // needed yet) and build a skeleton with empty track layers so we can
  // measure the real column width the CSS grid gives us.
  const renderedRows = [];
  const groupsHtml = groups
    .map((g) => {
      const rows = (rowsByProject.get(g.projectId) || []).filter(rowMatchesStageFilter);
      if (!rows.length) return '';
      const rowsHtml = rows
        .map((row) => {
          const rowIdx = renderedRows.length;
          renderedRows.push(row);
          const label = `${row.title}, stage ${row.stage}`;
          return `
            <div class="tl-row" tabindex="0" role="button" data-project="${esc(row.project)}" data-number="${esc(row.number)}" aria-label="${esc(label)}">
              <div class="tl-row-label"><span class="tl-num">#${esc(row.number)}</span> ${esc(row.title)}</div>
              <div class="tl-track">
                <div class="tl-track-layer" data-row-idx="${rowIdx}"></div>
              </div>
            </div>
          `;
        })
        .join('');
      return `
        <div class="tl-group">
          <div class="tl-group-head">${esc(g.projectName)} · ${esc(g.count)}</div>
          ${rowsHtml}
        </div>
      `;
    })
    .join('');

  el.innerHTML = `
    <div class="page-head">
      <h2 class="page-title">Timeline</h2>
      <p class="text-muted page-sub">Board-wide stage progress across every ticket.</p>
    </div>
    <div class="page-body">
      <div class="tl-controls">
        <div class="zoom-group">${zoomHtml}</div>
        <div class="chip-group">${chipsHtml}</div>
        <label class="hide-backlog-field" for="hide-backlog">
          <input type="checkbox" id="hide-backlog" ${state.hideBacklog ? 'checked' : ''}>
          Hide backlog
        </label>
      </div>
      <div class="tl" id="tl" tabindex="0">
        <div class="tl-axis-row">
          <div class="tl-axis-label"></div>
          <div class="tl-axis" id="tl-axis"></div>
        </div>
        <div class="tl-body" id="tl-body">
          ${groupsHtml || '<p class="text-muted tl-empty">No tickets match the current filters.</p>'}
        </div>
      </div>
    </div>
  `;

  // Phase 2: now that the grid has laid out, measure the real track column
  // width and compute the scale, ticks and bar rects against it.
  const firstLayer = el.querySelector('.tl-track-layer');
  const trackWidth = firstLayer ? firstLayer.clientWidth : Math.max((el.clientWidth || 900) - 272, 200);

  const domain = TimelineScale.resolveDomain(state.zoom, {
    dataStart: timelineData.domain.start,
    dataEnd: timelineData.domain.end,
    now: timelineData.now,
    panMs: state.panMs,
  });
  const scale = TimelineScale.createScale({ start: domain.start, end: domain.end, width: trackWidth });
  tlScale = scale;

  const tickList = TimelineScale.ticks(domain.start, domain.end, trackWidth);
  const gridlinesHtml = tickList
    .map((tk) => {
      const x = scale.toX(tk.t);
      const cls = tk.major ? 'tl-grid-line tl-grid-line-major' : 'tl-grid-line tl-grid-line-minor';
      return `<div class="${cls}" style="--tick-x:${x}px"></div>`;
    })
    .join('');
  const nowInDomain = timelineData.now >= domain.start && timelineData.now <= domain.end;
  const nowLineHtml = nowInDomain
    ? `<div class="tl-now" style="--now-x:${scale.toX(timelineData.now)}px"></div>`
    : '';

  const axisEl = document.getElementById('tl-axis');
  if (axisEl) {
    axisEl.innerHTML = tickList
      .map((tk) => {
        const x = scale.toX(tk.t);
        const cls = tk.major ? 'tl-tick tl-tick-major' : 'tl-tick tl-tick-minor';
        return `<div class="${cls}" style="--tick-x:${x}px">${esc(tk.label)}</div>`;
      })
      .join('');
  }

  el.querySelectorAll('.tl-track-layer').forEach((layerEl) => {
    const row = renderedRows[Number(layerEl.getAttribute('data-row-idx'))];
    if (!row) return;
    const segments = row.segments || [];
    const rects = TimelineScale.segmentRects(segments, scale, { now: timelineData.now, running: row.running });
    // segmentRects drops segments outside the visible window, so its indices do
    // NOT line up with `segments` — rank and label off the rects themselves.
    const ranks = pastRecencyRanks(rects);
    const barsHtml = rects
      .map((r, i) => {
        if (state.stageFilter.size > 0 && !state.stageFilter.has(r.stage)) return '';
        const cls = segmentBarClass(r, ranks.get(i), row.running);
        const tip = segmentTooltipText(r);
        return `<div class="${cls}" tabindex="-1" style="--x:${r.x}px;--w:${r.w}px" title="${esc(tip)}" data-tip="${esc(tip)}"></div>`;
      })
      .join('');
    layerEl.innerHTML = gridlinesHtml + nowLineHtml + barsHtml;
  });

  wireTimelineControls();
}

function wireTimelineControls() {
  document.querySelectorAll('[data-zoom]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.zoom = btn.getAttribute('data-zoom');
      state.panMs = 0;
      renderTimeline();
    });
  });

  document.querySelectorAll('[data-stage]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const stage = btn.getAttribute('data-stage');
      if (state.stageFilter.has(stage)) {
        state.stageFilter.delete(stage);
      } else {
        state.stageFilter.add(stage);
      }
      renderTimeline();
    });
  });

  const hideBacklogEl = document.getElementById('hide-backlog');
  if (hideBacklogEl) {
    hideBacklogEl.addEventListener('change', () => {
      state.hideBacklog = hideBacklogEl.checked;
      renderTimeline();
    });
  }

  document.querySelectorAll('.tl-bar').forEach((barEl) => {
    const tip = barEl.getAttribute('data-tip') || '';
    barEl.addEventListener('mouseenter', () => showTlTip(barEl, tip));
    barEl.addEventListener('mouseleave', hideTlTip);
    barEl.addEventListener('focus', () => showTlTip(barEl, tip));
    barEl.addEventListener('blur', hideTlTip);
  });

  document.querySelectorAll('.tl-row').forEach((rowEl) => {
    const openThisRow = () => {
      const project = rowEl.getAttribute('data-project');
      const number = Number(rowEl.getAttribute('data-number'));
      const ticket = (state.tickets.length ? state.tickets : state.allTickets).find(
        (t) => t.project === project && t.number === number
      ) || null;
      state.selectedTicket = ticket || { project, number };
      openDrawer(project, number);
    };
    rowEl.addEventListener('click', openThisRow);
    rowEl.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        openThisRow();
      } else if (ev.key === ' ') {
        ev.preventDefault();
        openThisRow();
      }
    });
  });

  const tlEl = document.getElementById('tl');
  if (tlEl) {
    tlEl.addEventListener('keydown', (ev) => {
      if (ev.target !== tlEl) return;
      if (ev.key === 'ArrowLeft') {
        tlPanBySpan(-0.1);
      } else if (ev.key === 'ArrowRight') {
        tlPanBySpan(0.1);
      } else if (ev.key === 'Home') {
        applyTlPan(0);
      }
    });

    tlEl.addEventListener('wheel', (ev) => {
      const delta = ev.deltaX !== 0 ? ev.deltaX : (ev.shiftKey ? ev.deltaY : 0);
      if (delta === 0 || !tlScale || !tlScale.pxPerMs) return;
      ev.preventDefault();
      applyTlPan(state.panMs + delta / tlScale.pxPerMs);
    }, { passive: false });
  }

  document.querySelectorAll('.tl-track-layer').forEach((layerEl) => {
    layerEl.addEventListener('pointerdown', (ev) => {
      tlDragState = { startX: ev.clientX, startPanMs: state.panMs };
      layerEl.setPointerCapture(ev.pointerId);
    });
    layerEl.addEventListener('pointermove', (ev) => {
      if (!tlDragState || !tlScale || !tlScale.pxPerMs) return;
      const dx = ev.clientX - tlDragState.startX;
      applyTlPan(tlDragState.startPanMs - dx / tlScale.pxPerMs);
    });
    const endDrag = () => {
      tlDragState = null;
    };
    layerEl.addEventListener('pointerup', endDrag);
    layerEl.addEventListener('pointercancel', endDrag);
  });
}

window.addEventListener('resize', () => {
  clearTimeout(tlResizeTimer);
  tlResizeTimer = setTimeout(() => {
    if (state.view === 'timeline') renderTimeline();
  }, 100);
});

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
            <div class="drawer-head">
              <h4 class="drawer-title">Failed to load ticket</h4>
              <button class="btn btn-icon btn-ghost" id="drawer-close">×</button>
            </div>
            <div class="drawer-err">${esc(drawerError)}</div>
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
      const activeCls = isCurrent ? ' is-active' : '';
      const barStateCls = isCurrent ? 'gantt-bar-current' : isPast ? 'gantt-bar-past' : 'gantt-bar-future';
      return `
        <div class="gantt-grid">
          <div class="gantt-label${activeCls}">${esc(row.label)}</div>
          <div class="gantt-track">
            <div class="gantt-bar ${barStateCls}" style="--bar-left:${row.startPct}%; --bar-width:${row.widthPct}%"></div>
          </div>
          <div class="gantt-stat${activeCls}">${esc(row.stat)}</div>
        </div>
      `;
    })
    .join('');

  let tabContent = '';
  if (state.activeDrawerTab === 'Overview') {
    tabContent = `<p class="tab-copy">${esc(t.body)}</p>`;
  } else if (state.activeDrawerTab === 'Spec') {
    tabContent = `<p class="tab-copy">${esc(t.spec || "Not spec'd yet")}</p>`;
  } else if (state.activeDrawerTab === 'Plan') {
    tabContent = `<p class="tab-copy">${esc(t.plan || 'Not planned yet')}</p>`;
  } else if (state.activeDrawerTab === 'Logs') {
    const logsText = (t.logs || [])
      .map((l) => `[${l.createdAt}] ${l.header}${l.body ? `\n${l.body}` : ''}`)
      .join('\n\n');
    tabContent = `<pre class="logs">${esc(logsText || 'No pipeline runs yet.')}</pre>`;
  }

  const { enabled: approveEnabled, label: approveLabel } = approveEligibility(t.stage);
  const pCls = priorityClass(t.priority);
  const priorityTag = pCls
    ? `<span class="tag ${pCls}">${esc(t.priority)}</span>`
    : '<span class="text-muted">—</span>';

  const errorHtml = drawerError
    ? `<div class="drawer-err">${esc(drawerError)}</div>`
    : '';

  el.innerHTML = `
    <div class="drawer-backdrop" id="drawer-backdrop">
      <div class="drawer-panel" id="drawer-panel">
        <div class="drawer-head">
          <div>
            <div class="card-kicker">#${esc(t.number)} · ${esc(t.projectName)}</div>
            <h4 class="drawer-title">${esc(t.title)}</h4>
          </div>
          <button class="btn btn-icon btn-ghost" id="drawer-close">×</button>
        </div>

        <div class="card-meta drawer-meta">
          <span>${esc(t.assignee || '—')}</span>
          <span>·</span>
          <span>updated ${esc(relativeTime(t.updatedAt))}</span>
          <span>·</span>
          ${priorityTag}
        </div>

        <div class="drawer-section">
          <h6 class="drawer-section-title">Pipeline timeline</h6>
          <div class="gantt-list">
            ${ganttHtml}
          </div>
        </div>

        <div class="hr hr-tight"></div>

        <div class="tabs">
          ${tabsHtml}
        </div>

        ${tabContent}

        <div class="drawer-spacer"></div>
        <div class="hr hr-loose"></div>
        <div class="drawer-actions">
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
    ? `<div class="dialog-err">${esc(addDialogError)}</div>`
    : '';

  el.innerHTML = `
    <div class="dialog-backdrop" id="add-dialog-backdrop">
      <div class="dialog" id="add-dialog">
        <div class="dialog-title">Link a local codebase</div>
        <div class="dialog-body">
          <div class="field dialog-field">
            <label>Folder</label>
            <input class="input" type="file" id="add-dialog-folder" webkitdirectory directory>
            <div class="text-muted dialog-hint">${esc(pickedFolderName || 'Used only to prefill the project name below.')}</div>
          </div>
          <div class="field dialog-field">
            <label>Path</label>
            <input class="input" id="add-dialog-path" value="${esc(newProjectPath)}" placeholder="/absolute/path/to/repo">
            <div class="text-muted dialog-hint">The server validates this folder has a GitHub remote.</div>
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

function setView(view) {
  state.view = view;
  const ticketsTab = document.getElementById('view-tickets');
  const timelineTab = document.getElementById('view-timeline');
  if (ticketsTab) ticketsTab.setAttribute('aria-selected', String(view === 'tickets'));
  if (timelineTab) timelineTab.setAttribute('aria-selected', String(view === 'timeline'));
  renderMain();
}

function wireStaticControls() {
  const search = document.getElementById('search');
  if (search) {
    search.addEventListener('input', () => {
      state.search = search.value;
      state.page = 0;
      renderMain();
    });
  }
  const ticketsTab = document.getElementById('view-tickets');
  if (ticketsTab) ticketsTab.addEventListener('click', () => setView('tickets'));
  const timelineTab = document.getElementById('view-timeline');
  if (timelineTab) timelineTab.addEventListener('click', () => setView('timeline'));
  // "New PRD" is inert in v1 — tooltip only, per brief.
}

// ---- polling -----------------------------------------------------

function startPolling() {
  setInterval(() => {
    loadTickets({ preserve: true }).catch((err) => console.error('poll tickets failed', err));
    loadAllTicketsForCounts().catch((err) => console.error('poll ticket counts failed', err));
    loadTimeline().catch((err) => console.error('poll timeline failed', err));
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
    await Promise.all([loadProjects(), loadTickets(), loadAllTicketsForCounts(), loadTimeline(), loadHealth()]);
  } catch (err) {
    console.error('Failed to load dashboard data', err);
  }
  startPolling();
}

boot();
