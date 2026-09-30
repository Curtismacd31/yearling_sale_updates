const SALE_STATUSES = ['pending', 'sold', 'rna', 'withdrawn'];

function saledayRowHtml(r) {
  const sale = r.sale || { status: 'pending', price: '', buyer: '' };
  const options = SALE_STATUSES.map(s =>
    `<option value="${s}" ${s === sale.status ? 'selected' : ''}>${s}</option>`).join('');
  return `
    <tr data-hip="${r.hip_no}">
      <td><span class="hip-tag">${r.hip_no}</span></td>
      <td class="yearling-name">${r.yearling_name || ''}</td>
      <td>${r.sire || ''}</td>
      <td>${r.dam || ''}</td>
      <td><select class="sd-status">${options}</select></td>
      <td><input class="sd-price" value="${sale.price || ''}" placeholder="10000" inputmode="numeric"></td>
      <td><input class="sd-buyer" value="${sale.buyer || ''}" placeholder="Buyer name"></td>
      <td><button class="sd-save">Save</button></td>
    </tr>`;
}

function renderSaleday(roster) {
  const tbody = document.querySelector('#saledayTable tbody');
  tbody.innerHTML = roster.map(saledayRowHtml).join('');

  tbody.querySelectorAll('tr').forEach(tr => {
    tr.querySelector('.sd-save').addEventListener('click', async () => {
      const hip = tr.dataset.hip;
      const status = tr.querySelector('.sd-status').value;
      const price = tr.querySelector('.sd-price').value.trim();
      const buyer = tr.querySelector('.sd-buyer').value.trim();
      try {
        await api.post(`/api/saleday/${hip}/result`, { status, price, buyer });
        tr.style.background = '#123018';
        setTimeout(() => { tr.style.background = ''; }, 600);
        await window.loadRosterPanel();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

window.loadSaledayPanel = async function loadSaledayPanel() {
  const roster = await api.get('/api/saleday');
  renderSaleday(roster);
};
