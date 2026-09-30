document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.panel).classList.add('active');

    // Refresh the panel's data whenever it's opened
    if (btn.dataset.panel === 'panel-updates') window.loadUpdatesPanel?.();
    if (btn.dataset.panel === 'panel-saleday') window.loadSaledayPanel?.();
    if (btn.dataset.panel === 'panel-submit') window.loadSubmitPanel?.();
  });
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await api.post('/api/auth/logout');
  window.location.href = '/login.html';
});

(async function init() {
  try {
    const me = await api.get('/api/auth/me');
    document.getElementById('whoami').textContent = me.username;
  } catch {
    window.location.href = '/login.html';
    return;
  }
  window.loadRosterPanel?.();
})();
