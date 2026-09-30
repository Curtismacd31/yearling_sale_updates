function historyRowHtml(h) {
  return `
    <tr>
      <td>${new Date(h.sent_at).toLocaleString()}</td>
      <td>${h.status ?? '—'}</td>
      <td class="${h.ok ? 'status-sold' : 'status-out'}">${h.ok ? 'OK' : 'FAILED'}</td>
    </tr>`;
}

async function refreshHistory() {
  const history = await api.get('/api/submit/history');
  document.querySelector('#historyTable tbody').innerHTML = history.map(historyRowHtml).join('');
}

window.loadSubmitPanel = async function loadSubmitPanel() {
  const config = await api.get('/api/submit/config');
  const form = document.getElementById('configForm');
  form.saleCompany.value = config.saleCompany || '';
  form.saleCompanyKey.value = config.saleCompanyKey || '';
  form.saleId.value = config.saleId || '';
  await refreshHistory();
};

document.getElementById('configForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const resultEl = document.getElementById('configResult');
  const payload = Object.fromEntries(new FormData(e.target).entries());
  try {
    await api.put('/api/submit/config', payload);
    showResult(resultEl, 'Sale info saved.', false);
  } catch (err) {
    showResult(resultEl, err.message, true);
  }
});

document.getElementById('previewBtn').addEventListener('click', async () => {
  const pre = document.getElementById('xmlPreview');
  const resp = await fetch('/api/submit/preview');
  const xml = await resp.text();
  pre.textContent = xml;
  pre.hidden = false;
});

document.getElementById('sendBtn').addEventListener('click', async () => {
  const resultEl = document.getElementById('submitResult');
  if (!confirm('Submit the current aggregate data to Equiline now?')) return;
  showResult(resultEl, 'Sending…', false);
  try {
    const res = await api.post('/api/submit');
    showResult(resultEl, `Sent successfully (status ${res.status}).`, false);
  } catch (err) {
    showResult(resultEl, err.message, true);
  }
  await refreshHistory();
});
