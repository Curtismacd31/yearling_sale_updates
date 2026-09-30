window.state = window.state || { roster: [] };

function linksCellHtml(r) {
  const links = [];
  if (r.video_url) links.push(`<a href="${r.video_url}" target="_blank" rel="noopener">Video</a>`);
  if (r.trackit_url) links.push(`<a href="${r.trackit_url}" target="_blank" rel="noopener">Trackit</a>`);
  if (r.pedigree_url) links.push(`<a href="${r.pedigree_url}" target="_blank" rel="noopener">Pedigree</a>`);
  return links.length ? `<div class="links-cell">${links.join('')}</div>` : '';
}

function rosterRowHtml(r) {
  return `
    <tr data-id="${r.id}">
      <td><span class="hip-tag">${r.hip_no}</span></td>
      <td class="yearling-name">${r.yearling_name || ''}</td>
      <td>${r.sire || ''}</td>
      <td>${r.dam || ''}</td>
      <td>${r.sex || ''}</td>
      <td>${r.consignor || ''}</td>
      <td>${linksCellHtml(r)}</td>
      <td><span class="status-dot status-${r.status}">${r.status}</span></td>
      <td class="row-actions">
        <button class="edit-hip" data-id="${r.id}">Edit</button>
        <button class="rm-hip" data-id="${r.id}">Remove</button>
      </td>
    </tr>`;
}

function populateSexFilter() {
  const select = document.getElementById('rosterSexFilter');
  const current = select.value;
  const sexes = [...new Set(state.roster.map(r => r.sex).filter(Boolean))].sort();
  select.innerHTML = '<option value="">All sexes</option>' +
    sexes.map(s => `<option value="${s}">${s}</option>`).join('');
  if (sexes.includes(current)) select.value = current;
}

function getFilteredRoster() {
  const search = document.getElementById('rosterSearch').value.trim().toLowerCase();
  const sex = document.getElementById('rosterSexFilter').value;
  const hideOut = document.getElementById('rosterHideOut').checked;

  return state.roster.filter(r => {
    if (hideOut && r.status === 'out') return false;
    if (sex && r.sex !== sex) return false;
    if (search) {
      const haystack = [r.yearling_name, r.sire, r.dam, r.consignor].join(' ').toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

function renderRoster() {
  populateSexFilter();
  const filtered = getFilteredRoster()
    .slice()
    .sort((a, b) => (parseInt(a.hip_no, 10) || 0) - (parseInt(b.hip_no, 10) || 0));

  const tbody = document.querySelector('#rosterTable tbody');
  tbody.innerHTML = filtered.map(rosterRowHtml).join('');
  document.getElementById('rosterCount').textContent = state.roster.length;
  document.getElementById('rosterFilterCount').textContent =
    `${filtered.length} of ${state.roster.length} shown`;

  tbody.querySelectorAll('.edit-hip').forEach(btn => {
    btn.addEventListener('click', () => {
      const record = state.roster.find(r => r.id === Number(btn.dataset.id));
      if (record) startEditingHip(record);
    });
  });

  tbody.querySelectorAll('.rm-hip').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this hip entirely? (Use "Mark Out" in Updates instead if you just want it off the sale.)')) return;
      await api.del('/api/roster/' + btn.dataset.id);
      if (document.getElementById('editingId').value === btn.dataset.id) cancelEditingHip();
      await window.loadRosterPanel();
    });
  });

  document.dispatchEvent(new CustomEvent('roster:updated'));
}

['rosterSearch', 'rosterSexFilter', 'rosterHideOut'].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener(el.tagName === 'INPUT' && el.type === 'text' ? 'input' : 'change', renderRoster);
});

window.loadRosterPanel = async function loadRosterPanel() {
  state.roster = await api.get('/api/roster');
  renderRoster();
};

document.getElementById('csvLoadBtn').addEventListener('click', async () => {
  const resultEl = document.getElementById('csvResult');
  try {
    const csv = document.getElementById('csvInput').value.trim();
    if (!csv) throw new Error('Paste some CSV first, or choose a file.');
    const res = await api.post('/api/roster/bulk', { csv });
    let msg = `Loaded ${res.count} row(s). Roster now has ${res.roster.length} hip(s).`;
    if (res.detectedSaleId) {
      msg += ` Detected Sale ID ${res.detectedSaleId} from the file — set it in the Submit panel if you haven't already.`;
    }
    showResult(resultEl, msg, false);
    document.getElementById('csvInput').value = '';
    await window.loadRosterPanel();
  } catch (err) {
    showResult(resultEl, err.message, true);
  }
});

document.getElementById('csvFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  document.getElementById('csvInput').value = await readFileSmart(file);
});

// Excel on Windows commonly saves "CSV" exports as Windows-1252, not UTF-8 —
// a strict UTF-8 decode fails on those (or silently mangles curly quotes /
// accented names), so try UTF-8 first and fall back to windows-1252.
async function readFileSmart(file) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

document.getElementById('manualForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const resultEl = document.getElementById('manualResult');
  const form = e.target;
  const payload = Object.fromEntries(new FormData(form).entries());
  const editingId = payload.editingId;
  delete payload.editingId;

  try {
    if (editingId) {
      await api.put('/api/roster/' + editingId, payload);
      showResult(resultEl, `Updated hip ${payload.hip_no}.`, false);
    } else {
      const existing = state.roster.find(r => String(r.hip_no) === String(payload.hip_no));
      if (existing) {
        await api.put('/api/roster/' + existing.id, payload);
        showResult(resultEl, `Hip ${payload.hip_no} already existed — updated it instead of adding a duplicate.`, false);
      } else {
        await api.post('/api/roster', payload);
        showResult(resultEl, `Added hip ${payload.hip_no}.`, false);
      }
    }
    cancelEditingHip();
    await window.loadRosterPanel();
  } catch (err) {
    showResult(resultEl, err.message, true);
  }
});

function startEditingHip(record) {
  const form = document.getElementById('manualForm');
  form.editingId.value = record.id;
  form.hip_no.value = record.hip_no || '';
  form.yearling_name.value = record.yearling_name || '';
  form.sire.value = record.sire || '';
  form.dam.value = record.dam || '';
  form.consignor.value = record.consignor || '';
  form.sex.value = record.sex || '';
  form.video_url.value = record.video_url || '';
  form.trackit_url.value = record.trackit_url || '';
  form.pedigree_url.value = record.pedigree_url || '';

  document.getElementById('manualSubmitBtn').textContent = 'Save Changes';
  document.getElementById('manualFormTitle').textContent = 'Edit hip';
  document.getElementById('editingHipLabel').textContent = record.hip_no;
  document.getElementById('editingNote').hidden = false;
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  form.hip_no.focus();
}

function cancelEditingHip() {
  const form = document.getElementById('manualForm');
  form.reset();
  form.editingId.value = '';
  document.getElementById('manualSubmitBtn').textContent = 'Add Hip';
  document.getElementById('manualFormTitle').textContent = 'Manual entry (one at a time)';
  document.getElementById('editingNote').hidden = true;
}

document.getElementById('cancelEditBtn').addEventListener('click', cancelEditingHip);

