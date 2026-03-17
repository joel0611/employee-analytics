/* ─────────────────────────────────────────────────────────────
   GenAI Employee Analytics — app.js
   ───────────────────────────────────────────────────────────── */

const API = 'http://localhost:3001';

// Global state
let allValidRows      = [];
let allEmployees      = [];
let charts            = {};
let insightsFetched   = false;
let validationFetched = false;
let designationSkills = {};   // map: designation → required skills array
let currentSort       = 'none'; // 'none' | 'designation' | 'readiness'
let readinessCache    = {};   // empID → score

// ──────────────────────────────────────────────
// Tab navigation
// ──────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
}

// ──────────────────────────────────────────────
// Loading & toast helpers
// ──────────────────────────────────────────────
function showLoading(text) {
  document.getElementById('loadingText').textContent = text || 'Processing…';
  document.getElementById('loadingOverlay').classList.add('show');
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('show');
}

function toast(msg, type = 'info') {
  const wrap = document.getElementById('toastWrap');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️'}</span><span>${msg}</span>`;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toastOut 0.3s forwards';
    setTimeout(() => el.remove(), 300);
  }, 4000);
}

// ──────────────────────────────────────────────
// Drag and drop
// ──────────────────────────────────────────────
const uploadZone = document.getElementById('uploadZone');
const fileInput  = document.getElementById('fileInput');
const uploadBtn  = document.getElementById('uploadBtn');

uploadBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
uploadZone.addEventListener('click', (e) => { if (e.target !== uploadBtn) fileInput.click(); });
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
});
fileInput.addEventListener('change', e => { if (e.target.files[0]) processFile(e.target.files[0]); });

// ──────────────────────────────────────────────
// Upload CSV
// ──────────────────────────────────────────────
async function processFile(file) {
  if (!file.name.endsWith('.csv')) { toast('Please upload a .csv file', 'error'); return; }

  showLoading('Parsing & validating dataset…');

  const formData = new FormData();
  formData.append('file', file);

  try {
    const resp = await fetch(`${API}/api/upload`, { method: 'POST', body: formData });
    const data = await resp.json();

    if (!resp.ok || data.error) {
      hideLoading();
      toast(data.error || 'Upload failed', 'error');
      return;
    }

    applyData(data);
    hideLoading();
    toast(`Dataset loaded: ${data.totalRows} rows, ${data.errorCount} errors found`, data.errorCount > 0 ? 'info' : 'success');
    switchTab('overview');
    fetchValidation(data.validRows);

  } catch (err) {
    hideLoading();
    toast('Server error: ' + err.message, 'error');
  }
}

// ──────────────────────────────────────────────
// Shared data application
// ──────────────────────────────────────────────
function applyData(data) {
  allValidRows      = data.validRows;
  allEmployees      = data.validRows;
  designationSkills = data.designationSkills || {};
  readinessCache    = {};
  currentSort       = 'none';
  insightsFetched   = false;
  validationFetched = false;

  document.getElementById('datasetBadge').textContent = `${data.totalRows} records loaded`;
  const errBadge = document.getElementById('errorBadge');
  errBadge.textContent = data.errorCount;
  errBadge.style.display = data.errorCount > 0 ? 'inline' : 'none';

  renderOverview(data);
  renderQuality(data);
  renderCharts(data.charts);
  renderEmployeeGrid(data.validRows);
}

// ──────────────────────────────────────────────
// Overview Tab
// ──────────────────────────────────────────────
function renderOverview(data) {
  const { eda } = data;

  document.getElementById('overviewStats').innerHTML = `
    ${statCard('📄', data.totalRows, 'Total Records', '')}
    ${statCard('✅', data.validCount, 'Valid Rows', 'green')}
    ${statCard('❌', data.errorCount, 'Error Rows', 'red')}
    ${statCard('🔁', eda.duplicateIds.length, 'Duplicate IDs', eda.duplicateIds.length > 0 ? 'yellow' : 'green')}
  `;

  // Missing table
  const tbody = document.getElementById('missingTableBody');
  tbody.innerHTML = '';
  for (const col of Object.keys(eda.missingCounts)) {
    const cnt = eda.missingCounts[col];
    const pct = ((cnt / eda.totalRows) * 100).toFixed(1);
    const hasMissing = cnt > 0;
    const row = document.createElement('tr');
    row.className = `missing-row ${hasMissing ? 'has-missing' : 'no-missing'}`;
    row.innerHTML = `
      <td><strong>${col}</strong></td>
      <td>${eda.totalRows}</td>
      <td>${cnt}</td>
      <td>${pct}%</td>
      <td>${hasMissing
        ? `<span class="valid-pill fail">⚠ Missing</span>`
        : `<span class="valid-pill ok">✓ Complete</span>`}
      </td>
    `;
    tbody.appendChild(row);
  }

  // YoE stats
  const { mean, min, max, median, count } = eda.yoeStats;
  document.getElementById('yoeStats').innerHTML = `
    ${statCard('📊', count, 'Valid YoE Records', '')}
    ${statCard('➕', mean, 'Mean YoE', 'green')}
    ${statCard('📉', min, 'Min YoE', 'purple')}
    ${statCard('📈', max, 'Max YoE', 'yellow')}
    ${statCard('⚖️', median, 'Median YoE', '')}
  `;

  // Duplicates
  const dupSec = document.getElementById('duplicateSection');
  if (eda.duplicateIds.length > 0) {
    dupSec.style.display = 'block';
    document.getElementById('duplicateList').innerHTML = eda.duplicateIds.map(id =>
      `<span class="tag yellow" style="margin:4px">${id}</span>`
    ).join('');
  } else {
    dupSec.style.display = 'none';
  }

  // Intern anomalies section
  const anomalies = eda.internAnomalies || [];
  const internSec = document.getElementById('internAnomalySection');
  if (anomalies.length > 0) {
    internSec.style.display = 'block';
    document.getElementById('internAnomalyTableBody').innerHTML = anomalies.map(a => `
      <tr>
        <td><span class="tag red">${esc(a.id)}</span></td>
        <td>${esc(a.name)}</td>
        <td>${esc(a.designation)}</td>
        <td><span class="tag yellow">${a.yoe} yrs</span></td>
        <td style="font-size:0.78rem;color:var(--accent-warn)">⚠ Intern with YoE > 1 year — possible data entry error</td>
      </tr>
    `).join('');
  } else {
    internSec.style.display = 'none';
  }

  // Invalid names/addresses section — show loading state immediately
  document.getElementById('invalidNamesSection').style.display = 'block';
  document.getElementById('invalidNamesLoading').style.display = 'flex';
  document.getElementById('invalidNamesTableWrap').style.display = 'none';
  document.getElementById('noInvalidNamesMsg').style.display = 'none';
  document.getElementById('invalidNamesTableBody').innerHTML = '';
}

function statCard(icon, value, label, cls) {
  return `
    <div class="stat-card ${cls}">
      <span class="stat-icon">${icon}</span>
      <div class="stat-value">${value}</div>
      <div class="stat-label">${label}</div>
    </div>
  `;
}

// ──────────────────────────────────────────────
// Data Quality Tab
// ──────────────────────────────────────────────
function renderQuality(data) {
  const { errorRows, validCount, totalRows, eda } = data;
  const dq = eda?.dqScore || {};

  // Summary stat cards
  document.getElementById('qualityStats').innerHTML = `
    ${statCard('📋', totalRows, 'Total Records', '')}
    ${statCard('✅', validCount, 'Passed All Rules', 'green')}
    ${statCard('❌', errorRows.length, 'Failed Validation', 'red')}
    ${statCard('📏', '6+', 'Rules Applied', 'purple')}
  `;

  // Data Quality Score widget
  const dqWrap = document.getElementById('dqScoreWrap');
  if (dq.overall !== undefined) {
    const gauge = scoreGaugeColor(dq.overall);
    dqWrap.style.display = 'block';
    dqWrap.innerHTML = `
      <div class="dq-score-card">
        <div class="dq-score-header">
          <div class="dq-overall-wrap">
            <div class="dq-overall-label">Overall Data Quality Score</div>
            <div class="dq-overall-score" style="color:${gauge.color}">${dq.overall}<span style="font-size:1rem;color:var(--text-muted)">/100</span></div>
            <div class="dq-grade" style="background:${gauge.color}20;color:${gauge.color};border:1px solid ${gauge.color}40">${gauge.grade}</div>
          </div>
          <div class="dq-dimensions">
            ${dqDimensionBar('🎯 Accuracy', dq.accuracy, 'Rows with valid YoE range & no anomalies')}
            ${dqDimensionBar('✅ Validity', dq.validity, 'Rows passing all format rules')}
            ${dqDimensionBar('📦 Completeness', dq.completeness, 'Non-missing cells across all required columns')}
            ${dqDimensionBar('🔑 Uniqueness', dq.uniqueness, 'Rows with unique Employee IDs')}
          </div>
        </div>
      </div>
    `;
  } else {
    dqWrap.style.display = 'none';
  }

  // Intern anomalies in DQ tab
  const anomalies = eda?.internAnomalies || [];
  const dqInternSec = document.getElementById('dqInternAnomalySection');
  if (anomalies.length > 0) {
    dqInternSec.style.display = 'block';
    document.getElementById('dqInternAnomalyBody').innerHTML = anomalies.map(a => `
      <tr>
        <td><span class="tag orange">⚠ Anomaly</span></td>
        <td><span class="tag">${esc(a.id)}</span></td>
        <td>${esc(a.name)}</td>
        <td>${esc(a.designation)}</td>
        <td>${a.yoe} yrs</td>
        <td style="font-size:0.78rem;color:var(--accent-warn)">Intern with YoE > 1 year impacts Accuracy score</td>
      </tr>
    `).join('');
  } else {
    dqInternSec.style.display = 'none';
  }

  // Error rows table
  const tbody = document.getElementById('errorTableBody');
  tbody.innerHTML = '';

  if (errorRows.length === 0) {
    document.getElementById('errorRowsTableWrap').style.display = 'none';
    document.getElementById('noErrorsMsg').style.display = 'block';
    return;
  }

  document.getElementById('errorRowsTableWrap').style.display = 'block';
  document.getElementById('noErrorsMsg').style.display = 'none';

  for (const { rowIndex, row, errors } of errorRows) {
    const isAnomaly = errors.some(e => e.includes('Anomaly'));
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="tag red">Row ${rowIndex}</span></td>
      <td>${esc(row['Employee ID'] || '—')}</td>
      <td>${esc(row['Name'] || '—')}</td>
      <td style="max-width:160px; word-break:break-all">${esc(row['Email ID'] || '—')}</td>
      <td>${esc(row['Phone Number'] || '—')}</td>
      <td>${esc(row['Education'] || '—')}</td>
      <td>${esc(row['Designation'] || '—')}</td>
      <td>${esc(row['YoE'] || '—')}</td>
      <td style="max-width:140px">${esc(row['Skills'] || '—')}</td>
      <td>
        <ul class="error-list">
          ${errors.map(e => `<li${e.includes('Anomaly') ? ' style="color:var(--accent-warn)"' : ''}>${esc(e)}</li>`).join('')}
        </ul>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

function dqDimensionBar(label, value, tooltip) {
  const pct = Math.min(Math.max(value || 0, 0), 100);
  const color = pct >= 90 ? '#10b981' : pct >= 70 ? '#f59e0b' : '#ef4444';
  return `
    <div class="dq-dim" title="${esc(tooltip)}">
      <div class="dq-dim-header">
        <span class="dq-dim-label">${label}</span>
        <span class="dq-dim-val" style="color:${color}">${value}%</span>
      </div>
      <div class="dq-dim-bar">
        <div class="dq-dim-fill" style="width:${pct}%;background:${color}"></div>
      </div>
    </div>
  `;
}

function scoreGaugeColor(score) {
  if (score >= 90) return { color: '#10b981', grade: 'Excellent' };
  if (score >= 75) return { color: '#3b82f6', grade: 'Good' };
  if (score >= 60) return { color: '#f59e0b', grade: 'Fair' };
  return { color: '#ef4444', grade: 'Poor' };
}

// ──────────────────────────────────────────────
// Charts
// ──────────────────────────────────────────────
const CHART_COLORS = [
  '#3b82f6', '#6366f1', '#10b981', '#f59e0b', '#ec4899',
  '#8b5cf6', '#14b8a6', '#f97316', '#06b6d4', '#a855f7',
  '#22c55e', '#ef4444', '#eab308', '#0ea5e9', '#d946ef'
];

function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

function renderCharts({ educationDist, designationDist, topSkills, yoeBuckets }) {
  // Education donut
  destroyChart('education');
  charts['education'] = new Chart(document.getElementById('educationChart'), {
    type: 'doughnut',
    data: {
      labels: Object.keys(educationDist),
      datasets: [{ data: Object.values(educationDist), backgroundColor: CHART_COLORS, borderColor: '#111f3a', borderWidth: 2 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, padding: 12 } },
      }
    }
  });

  // Designation bar
  destroyChart('designation');
  charts['designation'] = new Chart(document.getElementById('designationChart'), {
    type: 'bar',
    data: {
      labels: Object.keys(designationDist),
      datasets: [{
        label: 'Employees',
        data: Object.values(designationDist),
        backgroundColor: CHART_COLORS,
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { display: false } },
      }
    }
  });

  // Top skills bar
  destroyChart('skills');
  charts['skills'] = new Chart(document.getElementById('skillsChart'), {
    type: 'bar',
    data: {
      labels: Object.keys(topSkills),
      datasets: [{
        label: 'Count',
        data: Object.values(topSkills),
        backgroundColor: CHART_COLORS.map(c => c + 'cc'),
        borderColor: CHART_COLORS,
        borderWidth: 1,
        borderRadius: 5,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#94a3b8', font: { size: 10 }, maxRotation: 40 }, grid: { display: false } },
        y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
      }
    }
  });

  // YoE histogram
  destroyChart('yoe');
  charts['yoe'] = new Chart(document.getElementById('yoeChart'), {
    type: 'bar',
    data: {
      labels: Object.keys(yoeBuckets),
      datasets: [{
        label: 'Employees',
        data: Object.values(yoeBuckets),
        backgroundColor: 'rgba(99,102,241,0.7)',
        borderColor: '#6366f1',
        borderWidth: 1,
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { display: false }, title: { display: true, text: 'Years of Experience', color: '#94a3b8' } },
        y: { ticks: { color: '#94a3b8', precision: 0 }, grid: { color: 'rgba(255,255,255,0.05)' } },
      }
    }
  });
}

// ──────────────────────────────────────────────
// Employee Grid — sort & filter
// ──────────────────────────────────────────────
function getFilteredSorted() {
  const q = (document.getElementById('empSearch')?.value || '').toLowerCase().trim();
  let list = q
    ? allValidRows.filter(e =>
      (e['Name'] || '').toLowerCase().includes(q) ||
      (e['Employee ID'] || '').toLowerCase().includes(q)
    )
    : [...allValidRows];

  if (currentSort === 'designation') {
    list.sort((a, b) => (a['Designation'] || '').localeCompare(b['Designation'] || ''));
  } else if (currentSort === 'readiness') {
    list.sort((a, b) => {
      const sa = readinessCache[a['Employee ID']] ?? -1;
      const sb = readinessCache[b['Employee ID']] ?? -1;
      return sb - sa; // descending
    });
  }
  return list;
}

function renderEmployeeGrid(employees) {
  const grid = document.getElementById('employeeGrid');

  if (!employees || employees.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><p>No valid employee records to display.</p></div>`;
    // Hide radar section
    const rs = document.getElementById('designationRadarSection');
    if (rs) rs.style.display = 'none';
    return;
  }

  grid.innerHTML = employees.map(emp => empCardHTML(emp)).join('');

  // Radar chart for designation sort
  if (currentSort === 'designation') {
    renderDesignationRadar(employees);
  } else {
    const rs = document.getElementById('designationRadarSection');
    if (rs) rs.style.display = 'none';
  }
}

function empCardHTML(emp) {
  const initials  = (emp['Name'] || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const skills    = (emp['Skills'] || '').split(/[,;|]+/).map(s => s.trim()).filter(Boolean);
  const visSkills = skills.slice(0, 4);
  const extraCount = skills.length - 4;
  const id = emp['Employee ID'];
  const score = readinessCache[id];
  const isInternAnomaly = isIntern(emp['Designation'] || '') && parseFloat(emp['YoE']) > 1;

  return `
    <div class="emp-card${isInternAnomaly ? ' anomaly-card' : ''}" onclick="openEmployeeModal(${JSON.stringify(emp).replace(/"/g, '&quot;')})" id="card-${esc(id)}">
      ${isInternAnomaly ? `<div class="anomaly-ribbon" title="Intern with YoE > 1 year — data anomaly">⚠ Anomaly</div>` : ''}
      <div class="emp-avatar">${initials}</div>
      <div class="emp-name">${esc(emp['Name'])}</div>
      <div class="emp-role">${esc(emp['Designation'])} • ${esc(id)}</div>
      <div class="emp-meta">
        <span>🎓 ${esc(emp['Education'])}</span>
        <span>📅 ${esc(emp['YoE'])} yrs experience</span>
      </div>
      <div class="emp-skills">
        ${visSkills.map(s => `<span class="skill-tag">${esc(s)}</span>`).join('')}
        ${extraCount > 0 ? `<span class="skill-tag more">+${extraCount} more</span>` : ''}
      </div>
      <div class="readiness-bar-wrap">
        <div class="readiness-label"><span>AI Readiness</span><span id="score-${esc(id)}">${score !== undefined ? score + '/100' : '—'}</span></div>
        <div class="progress-bar"><div class="progress-fill" id="bar-${esc(id)}" style="width:${score !== undefined ? score : 0}%"></div></div>
      </div>
    </div>
  `;
}

function isIntern(designation) {
  const d = (designation || '').toLowerCase();
  return d.includes('intern') || d.includes('trainee') || d.includes('apprentice');
}

function filterEmployees(query) {
  renderEmployeeGrid(getFilteredSorted());
}

function sortEmployees(sortType) {
  currentSort = sortType;
  // Update sort button states
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.toggle('active', b.dataset.sort === sortType));
  renderEmployeeGrid(getFilteredSorted());
}

// ──────────────────────────────────────────────
// Designation Radar Chart
// ──────────────────────────────────────────────
function renderDesignationRadar(employees) {
  const radarSection = document.getElementById('designationRadarSection');
  radarSection.style.display = 'block';

  // Compute unique designations in this view
  const designGroups = {};
  for (const emp of employees) {
    const d = emp['Designation'] || 'Unknown';
    if (!designGroups[d]) designGroups[d] = [];
    designGroups[d].push(emp);
  }

  // Build a list of unique required skills (union of top-designation required skills)
  const allDesigns = Object.keys(designGroups);
  const skillSet = new Set();
  for (const d of allDesigns) {
    const matched = findDesignKey(d);
    if (matched && designationSkills[matched]) {
      designationSkills[matched].forEach(s => skillSet.add(s));
    }
  }
  // Cap at 10 skills for readability
  const radarSkills = Array.from(skillSet).slice(0, 10);

  if (radarSkills.length < 3) {
    radarSection.style.display = 'none';
    return;
  }

  // Build dataset per designation
  const colors = CHART_COLORS;
  const datasets = allDesigns.slice(0, 8).map((d, i) => {
    const matched = findDesignKey(d);
    const required = matched ? (designationSkills[matched] || []) : [];
    const reqLower = new Set(required.map(s => s.toLowerCase()));

    // Average skill coverage fraction
    const groupEmps = designGroups[d];
    const skillCoverage = radarSkills.map(skill => {
      // Fraction of employees in this group who have this skill
      const count = groupEmps.filter(emp => {
        const empSkills = (emp['Skills'] || '').toLowerCase();
        return empSkills.split(/[,;|/]+/).some(s => s.trim() === skill.toLowerCase());
      }).length;
      return Math.round((count / groupEmps.length) * 100);
    });

    return {
      label: d,
      data: skillCoverage,
      borderColor: colors[i % colors.length],
      backgroundColor: colors[i % colors.length] + '22',
      borderWidth: 2,
      pointBackgroundColor: colors[i % colors.length],
      pointRadius: 4,
    };
  });

  destroyChart('designationRadar');
  charts['designationRadar'] = new Chart(document.getElementById('designationRadarChart'), {
    type: 'radar',
    data: { labels: radarSkills, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, padding: 10, boxWidth: 14 } },
      },
      scales: {
        r: {
          min: 0, max: 100,
          ticks: { color: '#64748b', backdropColor: 'transparent', stepSize: 25 },
          grid: { color: 'rgba(255,255,255,0.08)' },
          pointLabels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } },
          angleLines: { color: 'rgba(255,255,255,0.06)' },
        }
      }
    }
  });

  // Update subtitle
  const ct = allDesigns.length;
  document.getElementById('radarSubtitle').textContent =
    `Skill coverage % per designation — ${ct} designation group${ct !== 1 ? 's' : ''} shown`;
}

function findDesignKey(designation) {
  const dl = designation.toLowerCase();
  for (const k of Object.keys(designationSkills)) {
    if (dl.includes(k.toLowerCase()) || k.toLowerCase().includes(dl.split(' ')[0])) return k;
  }
  return 'DEFAULT';
}

// ──────────────────────────────────────────────
// Employee Modal
// ──────────────────────────────────────────────
async function openEmployeeModal(emp) {
  const initials = (emp['Name'] || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const isAnomaly = isIntern(emp['Designation'] || '') && parseFloat(emp['YoE']) > 1;

  document.getElementById('modalHeader').innerHTML = `
    <div class="modal-avatar">${initials}</div>
    <div>
      <div class="modal-name">${esc(emp['Name'])}</div>
      <div class="modal-role">${esc(emp['Designation'])} &nbsp;•&nbsp; ${esc(emp['Employee ID'])}</div>
      ${isAnomaly ? `<div style="margin-top:6px"><span class="tag orange" style="font-size:0.72rem">⚠ Intern Anomaly: ${esc(emp['YoE'])} yrs experience</span></div>` : ''}
    </div>
  `;

  document.getElementById('modalBody').innerHTML = `
    <div class="empty-state">
      <div class="spinner" style="margin:0 auto 12px; width:36px; height:36px;"></div>
      <p>Generating AI review…</p>
    </div>
  `;

  document.getElementById('modalBg').classList.add('show');

  try {
    const resp = await fetch(`${API}/api/employee-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee: emp }),
    });
    const data = await resp.json();

    if (!resp.ok || data.error) {
      document.getElementById('modalBody').innerHTML = `<div class="insight-text" style="color:var(--accent-err)">Error: ${esc(data.error)}</div>`;
      return;
    }

    const r = data.review;
    const score = r.readinessScore || 0;

    // Cache and update card
    const id = emp['Employee ID'];
    readinessCache[id] = score;
    const scoreEl = document.getElementById(`score-${esc(id)}`);
    const barEl   = document.getElementById(`bar-${esc(id)}`);
    if (scoreEl) scoreEl.textContent = score + '/100';
    if (barEl)   barEl.style.width = score + '%';

    // If sorted by readiness, re-render grid to reorder
    if (currentSort === 'readiness') {
      renderEmployeeGrid(getFilteredSorted());
    }

    document.getElementById('modalBody').innerHTML = `
      <div class="modal-section">
        <div style="display:flex; align-items:center; gap:24px; margin-bottom:16px">
          <div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:6px; text-transform:uppercase; letter-spacing:.08em;">AI Readiness Score</div>
            <div class="readiness-score-big">${score}<span style="font-size:1.2rem; -webkit-text-fill-color:var(--text-muted)">/100</span></div>
          </div>
          <div style="flex:1">
            <div class="progress-bar" style="height:12px">
              <div class="progress-fill" style="width:${score}%"></div>
            </div>
          </div>
        </div>
        ${isAnomaly ? `<div class="anomaly-alert">⚠ <strong>Data Anomaly:</strong> This employee is marked as an intern but has ${esc(emp['YoE'])} years of experience — this may indicate incorrect data.</div>` : ''}
      </div>

      <div class="modal-section">
        <div class="modal-section-title">🧑‍💼 Overall Review</div>
        <div class="insight-text">${esc(r.overallReview || '')}</div>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">🛠️ Skill Assessment</div>
        <div class="insight-text">${esc(r.skillAssessment || '')}</div>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">⚠️ Identified Skill Gaps</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${(r.skillGaps || []).map(g => `<span class="tag red">⚡ ${esc(g)}</span>`).join('')}
          ${(r.skillGaps || []).length === 0 ? '<span class="valid-pill ok" style="font-size:0.8rem">No gaps detected ✓</span>' : ''}
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">🎓 Recommended Courses</div>
        <div class="course-grid">
          ${(r.courseRecommendations || []).map(c => `
            <div class="course-card">
              <div class="course-platform">${esc(c.platform || '')}</div>
              <div class="course-title">${esc(c.title || '')}</div>
              <div class="course-skill">Addresses: <strong>${esc(c.skill || '')}</strong></div>
              <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:10px; line-height:1.5">${esc(c.reason || '')}</div>
              <div class="course-footer">
                <span class="course-level level-${esc(c.level || 'Beginner')}">${esc(c.level || 'Beginner')}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

  } catch (err) {
    document.getElementById('modalBody').innerHTML = `<div class="insight-text" style="color:var(--accent-err)">Error: ${esc(err.message)}</div>`;
  }
}

function closeModal(e) {
  if (e.target === document.getElementById('modalBg')) closeModalDirect();
}

function closeModalDirect() {
  document.getElementById('modalBg').classList.remove('show');
}

// ──────────────────────────────────────────────
// Validation (async, runs after upload)
// ──────────────────────────────────────────────
async function fetchValidation(employees) {
  if (validationFetched) return;
  validationFetched = true;

  document.getElementById('validationLoading').innerHTML = `
    <div class="spinner" style="margin:0 auto 12px"></div>
    <p>Validating names and addresses…</p>
  `;

  try {
    const resp = await fetch(`${API}/api/validate-fields`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employees }),
    });
    const data = await resp.json();

    if (!resp.ok || data.error) {
      document.getElementById('validationLoading').innerHTML = `<p style="color:var(--accent-err)">Validation error: ${esc(data.error)}</p>`;
      document.getElementById('invalidNamesLoading').style.display = 'none';
      document.getElementById('noInvalidNamesMsg').style.display = 'block';
      document.getElementById('noInvalidNamesMsg').innerHTML = `<p style="color:var(--accent-err); font-size:0.82rem">Gemini validation error: ${esc(data.error)}</p>`;
      return;
    }

    const validations = data.validations || [];

    document.getElementById('validationLoading').style.display = 'none';
    document.getElementById('validationTableWrap').style.display = 'block';

    const tbody = document.getElementById('validationTableBody');
    tbody.innerHTML = validations.map(v => {
      const emp = employees[v.index] || {};
      return `
        <tr>
          <td><span class="tag">${esc(v.id || emp['Employee ID'] || '—')}</span></td>
          <td>${esc(emp['Name'] || '—')}</td>
          <td>${v.nameValid
          ? `<span class="valid-pill ok">✓ Valid</span>`
          : `<span class="valid-pill fail">✗ Invalid</span>`}</td>
          <td style="font-size:0.78rem; color:var(--text-muted)">${esc(v.nameIssue || '—')}</td>
          <td style="max-width:180px; font-size:0.78rem">${esc(emp['Address'] || '—')}</td>
          <td>${v.addressValid
          ? `<span class="valid-pill ok">✓ Valid</span>`
          : `<span class="valid-pill fail">✗ Invalid</span>`}</td>
          <td style="font-size:0.78rem; color:var(--text-muted)">${esc(v.addressIssue || '—')}</td>
        </tr>
      `;
    }).join('');

    // Overview tab — only invalid entries
    const invalidRows = validations.filter(v => !v.nameValid || !v.addressValid);
    document.getElementById('invalidNamesLoading').style.display = 'none';

    if (invalidRows.length === 0) {
      document.getElementById('noInvalidNamesMsg').style.display = 'block';
    } else {
      document.getElementById('invalidNamesTableWrap').style.display = 'block';
      const overviewTbody = document.getElementById('invalidNamesTableBody');
      overviewTbody.innerHTML = invalidRows.map(v => {
        const emp = employees[v.index] || {};
        return `
          <tr>
            <td><span class="tag">${esc(v.id || emp['Employee ID'] || '—')}</span></td>
            <td>${esc(emp['Name'] || '—')}</td>
            <td style="font-size:0.78rem; color:var(--accent-err)">${v.nameValid ? '<span class="valid-pill ok" style="font-size:0.72rem">✓ OK</span>' : esc(v.nameIssue || 'Invalid name')}</td>
            <td style="max-width:200px; font-size:0.78rem">${esc(emp['Address'] || '—')}</td>
            <td style="font-size:0.78rem; color:var(--accent-err)">${v.addressValid ? '<span class="valid-pill ok" style="font-size:0.72rem">✓ OK</span>' : esc(v.addressIssue || 'Invalid address')}</td>
          </tr>
        `;
      }).join('');
    }

  } catch (err) {
    document.getElementById('validationLoading').innerHTML = `<p style="color:var(--accent-err)">Error: ${esc(err.message)}</p>`;
    document.getElementById('invalidNamesLoading').style.display = 'none';
    document.getElementById('noInvalidNamesMsg').style.display = 'block';
    document.getElementById('noInvalidNamesMsg').innerHTML = `<p style="color:var(--accent-err); font-size:0.82rem">Error: ${esc(err.message)}</p>`;
  }
}

// ──────────────────────────────────────────────
// Utility: safe HTML escaping
// ──────────────────────────────────────────────
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ──────────────────────────────────────────────
// Auto-load default dataset on startup
// ──────────────────────────────────────────────
async function loadDefaultDataset() {
  showLoading('Loading default dataset…');
  try {
    const resp = await fetch(`${API}/api/load-default`);
    const data = await resp.json();

    if (!resp.ok || data.error) {
      hideLoading();
      console.warn('Default dataset not loaded:', data.error || resp.statusText);
      return;
    }

    applyData(data);
    hideLoading();
    toast(`Default dataset loaded: ${data.totalRows} rows, ${data.errorCount} errors found`, data.errorCount > 0 ? 'info' : 'success');
    switchTab('overview');
    fetchValidation(data.validRows);

  } catch (err) {
    hideLoading();
    console.warn('Could not load default dataset:', err.message);
  }
}

document.addEventListener('DOMContentLoaded', loadDefaultDataset);
