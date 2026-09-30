state.content = state.content || [];

function fillHipSelect(select, { activeOnly } = {}) {
  const list = activeOnly ? state.roster.filter(r => r.status === 'active') : state.roster;
  const current = select.value;
  select.innerHTML = list
    .slice()
    .sort((a, b) => (parseInt(a.hip_no, 10) || 0) - (parseInt(b.hip_no, 10) || 0))
    .map(r => `<option value="${r.hip_no}">Hip ${r.hip_no} — ${r.yearling_name || 'unnamed'}</option>`)
    .join('');
  if (list.some(r => String(r.hip_no) === current)) select.value = current;
}

function renderOuts() {
  const outs = state.roster.filter(r => r.status === 'out');
  document.querySelector('#outsTable tbody').innerHTML = outs.map(r => `
    <tr>
      <td>${r.hip_no}</td>
      <td>${r.yearling_name || ''}</td>
      <td>${r.out_reason || ''}</td>
      <td><button class="reinstate-hip" data-hip="${r.hip_no}">Reinstate</button></td>
    </tr>`).join('');

  document.querySelectorAll('.reinstate-hip').forEach(btn => {
    btn.addEventListener('click', async () => {
      await api.post(`/api/updates/${btn.dataset.hip}/reinstate`);
      await window.loadUpdatesPanel();
      await window.loadRosterPanel();
    });
  });
}

function renderUpdatesTable() {
  document.querySelector('#updatesTable tbody').innerHTML = state.content.map(c => `
    <tr>
      <td>${c.hip_no}</td>
      <td>${c.type}</td>
      <td>${c.label || ''}</td>
      <td>${c.text}</td>
      <td><button class="rm-update" data-id="${c.id}">Delete</button></td>
    </tr>`).join('');

  document.querySelectorAll('.rm-update').forEach(btn => {
    btn.addEventListener('click', async () => {
      await api.del('/api/updates/' + btn.dataset.id);
      await window.loadUpdatesPanel();
    });
  });
}

window.loadUpdatesPanel = async function loadUpdatesPanel() {
  if (!state.roster.length) await window.loadRosterPanel();
  state.content = await api.get('/api/updates');
  fillHipSelect(document.getElementById('updateHipSelect'), { activeOnly: true });
  fillHipSelect(document.getElementById('outHipSelect'), { activeOnly: true });
  renderOuts();
  renderUpdatesTable();
};

document.addEventListener('roster:updated', () => {
  fillHipSelect(document.getElementById('updateHipSelect'), { activeOnly: true });
  fillHipSelect(document.getElementById('outHipSelect'), { activeOnly: true });
  renderOuts();
});

document.getElementById('updateForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const resultEl = document.getElementById('updateResult');
  try {
    const hip_no = document.getElementById('updateHipSelect').value;
    const text = document.getElementById('updateText').value.trim();
    await api.post('/api/updates', { hip_no, text });
    document.getElementById('updateText').value = '';
    showResult(resultEl, `Update added for hip ${hip_no}.`, false);
    await window.loadUpdatesPanel();
  } catch (err) {
    showResult(resultEl, err.message, true);
  }
});

document.getElementById('outForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const resultEl = document.getElementById('outResult');
  try {
    const hip_no = document.getElementById('outHipSelect').value;
    const reason = document.getElementById('outReason').value.trim();
    await api.post(`/api/updates/${hip_no}/out`, { reason });
    document.getElementById('outReason').value = '';
    showResult(resultEl, `Hip ${hip_no} moved to outs list.`, false);
    await window.loadUpdatesPanel();
    await window.loadRosterPanel();
  } catch (err) {
    showResult(resultEl, err.message, true);
  }
});

function bulkUpdatesMessage(res) {
  let msg = `Loaded ${res.rows} row(s): ${res.linksAdded} link(s), ${res.updatesAdded} update(s), ` +
    `${res.withdrawn} withdrawn. ${res.hipsCovered} of ${res.rosterHips} roster hips now go out on every send.`;
  if (res.withdrawnApplied) msg += ` ${res.withdrawnApplied} hip(s) newly moved to the outs list.`;
  if (res.configFilled.length) msg += ` Filled blank sale info from the file (${res.configFilled.join(', ')}).`;
  if (res.missingHips.length) msg += ` No content for hip(s): ${res.missingHips.join(', ')}.`;
  if (res.unknownHips.length) msg += ` Skipped hip(s) not on the roster: ${res.unknownHips.join(', ')}.`;
  const skipped = Object.entries(res.skipped || {});
  if (skipped.length) msg += ` Ignored rows: ${skipped.map(([k, n]) => `${k} (${n})`).join(', ')}.`;
  return msg;
}

document.getElementById('bulkUpdatesFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  document.getElementById('bulkUpdatesInput').value = await readFileSmart(file); // from panelRoster.js
});

document.getElementById('bulkUpdatesBtn').addEventListener('click', async () => {
  const resultEl = document.getElementById('bulkUpdatesResult');
  try {
    const csv = document.getElementById('bulkUpdatesInput').value.trim();
    if (!csv) throw new Error('Paste the CSV first, or choose a file.');
    const res = await api.post('/api/updates/bulk', { csv });
    showResult(resultEl, bulkUpdatesMessage(res), res.missingHips.length > 0 || res.unknownHips.length > 0);
    document.getElementById('bulkUpdatesInput').value = '';
    document.getElementById('bulkUpdatesFile').value = '';
    await window.loadRosterPanel();
    await window.loadUpdatesPanel();
  } catch (err) {
    showResult(resultEl, err.message, true);
  }
});
