const state = {
  skills: [],
  activeId: null,
};

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Request failed (${res.status})`);
  }
  return res.json();
}

async function checkHealth() {
  const dot = document.getElementById('db-dot');
  const text = document.getElementById('db-status-text');
  try {
    const { ok } = await api('/api/health');
    dot.className = 'dot ' + (ok ? 'ok' : 'down');
    text.textContent = ok ? 'CognoDB connected' : 'CognoDB unreachable';
  } catch {
    dot.className = 'dot down';
    text.textContent = 'CognoDB unreachable';
  }
}

function groupByCategory(skills) {
  const groups = new Map();
  for (const s of skills) {
    if (!groups.has(s.category)) groups.set(s.category, []);
    groups.get(s.category).push(s);
  }
  return groups;
}

function renderSkillList(filterText = '') {
  const container = document.getElementById('skill-list');
  const filtered = state.skills.filter(s =>
    s.name.toLowerCase().includes(filterText.toLowerCase())
  );

  if (filtered.length === 0) {
    container.innerHTML = `<div class="recommend-empty">No skills match "${escapeHtml(filterText)}".</div>`;
    return;
  }

  const groups = groupByCategory(filtered);
  let html = '';
  for (const [category, items] of groups) {
    html += `<div class="category-heading">${escapeHtml(category)}</div>`;
    for (const s of items) {
      html += `
        <button class="skill-item ${s.id === state.activeId ? 'active' : ''}" data-id="${s.id}">
          <span>${escapeHtml(s.name)}</span>
          <span class="level-badge">L${s.level}</span>
        </button>`;
    }
  }
  container.innerHTML = html;

  container.querySelectorAll('.skill-item').forEach(btn => {
    btn.addEventListener('click', () => selectSkill(btn.dataset.id));
  });
}

async function selectSkill(id) {
  state.activeId = id;
  renderSkillList(document.getElementById('skill-search').value);

  document.getElementById('detail-empty').hidden = true;
  const content = document.getElementById('detail-content');
  content.hidden = false;

  const skill = state.skills.find(s => s.id === id);
  document.getElementById('detail-category').textContent = skill.category;
  document.getElementById('detail-name').textContent = skill.name;

  const trailEl = document.getElementById('trail-list');
  const courseEl = document.getElementById('course-list');
  trailEl.innerHTML = `<div class="skeleton-row"></div>`;
  courseEl.innerHTML = `<div class="skeleton-row"></div>`;

  try {
    const [trail, courses] = await Promise.all([
      api(`/api/skills/${id}/trail`),
      api(`/api/skills/${id}/courses`),
    ]);

    trailEl.innerHTML = trail.map((stop, i) => `
      <li class="trail-stop ${stop.id === id ? 'target' : ''}" data-step="${i + 1}">
        <div class="trail-stop-name">${escapeHtml(stop.name)}</div>
        <div class="trail-stop-meta">${escapeHtml(stop.category)} · Level ${stop.level}${stop.id === id ? ' · target skill' : ''}</div>
      </li>
    `).join('');

    courseEl.innerHTML = courses.length
      ? courses.map(c => `
          <div class="course-card">
            <div class="course-name">${escapeHtml(c.name)}</div>
            <div class="course-meta">${escapeHtml(c.provider)} · ${c.hours}h</div>
          </div>
        `).join('')
      : `<div class="recommend-empty">No course in the catalog teaches this skill yet.</div>`;
  } catch (err) {
    trailEl.innerHTML = `<div class="error-banner">${escapeHtml(err.message)}</div>`;
    courseEl.innerHTML = '';
  }
}

function renderKnownList() {
  const container = document.getElementById('known-list');
  container.innerHTML = state.skills.map(s => `
    <label class="known-item">
      <input type="checkbox" value="${s.id}" />
      <span>${escapeHtml(s.name)}</span>
    </label>
  `).join('');
}

async function handleRecommend() {
  const known = Array.from(document.querySelectorAll('#known-list input:checked')).map(el => el.value);
  const resultsEl = document.getElementById('recommend-results');
  const btn = document.getElementById('recommend-btn');
  btn.disabled = true;
  resultsEl.innerHTML = `<div class="skeleton-row" style="width:220px;"></div>`;

  try {
    const results = await api('/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ known }),
    });
    resultsEl.innerHTML = results.length
      ? results.map(s => `<span class="recommend-chip">${escapeHtml(s.name)}</span>`).join('')
      : `<div class="recommend-empty">Nothing new is unlocked yet — check off more skills you already know, or you've cleared the whole tree.</div>`;
  } catch (err) {
    resultsEl.innerHTML = `<div class="error-banner">${escapeHtml(err.message)}</div>`;
  } finally {
    btn.disabled = false;
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

async function init() {
  checkHealth();
  setInterval(checkHealth, 15000);

  try {
    state.skills = await api('/api/skills');
    renderSkillList();
    renderKnownList();
  } catch (err) {
    document.getElementById('skill-list').innerHTML =
      `<div class="error-banner">${escapeHtml(err.message)}</div>`;
  }

  document.getElementById('skill-search').addEventListener('input', e => {
    renderSkillList(e.target.value);
  });
  document.getElementById('recommend-btn').addEventListener('click', handleRecommend);
}

init();
