/**
 * Builds the aggregate <SaleUpdates> XML that Equiline expects.
 *
 * IMPORTANT — always send the FULL aggregate, not just what changed since
 * the last submission. Equiline's spec is explicit about this: each upload
 * replaces the picture of the sale entirely, so every hip's every UPDATE /
 * RESULT / LINK line needs to be in every file, every time.
 *
 * NOTE on escaping: Equiline's own sample file embeds raw HTML (<b>, <br>)
 * directly inside the Text="..." attribute value, unescaped. That's not
 * strictly valid XML (a literal "<" inside an attribute should be &lt;),
 * but it is exactly what their sample shows and what their parser expects,
 * so we replicate it here rather than "fixing" it. We only escape the
 * characters that would otherwise break the attribute delimiter itself:
 * double quotes and ampersands.
 */

function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

function attr(name, value) {
  return `${name}="${escapeAttr(value)}"`;
}

/**
 * @param {object} params
 * @param {string} params.saleCompany
 * @param {string} params.saleCompanyKey
 * @param {string} params.saleId
 * @param {Array}  params.roster   full roster array (from data/roster.json)
 * @param {Array}  params.content  full content array (from data/content.json) — UPDATE/LINK entries
 * @returns {string} complete XML document as a string
 */
function buildSaleUpdatesXml({ saleCompany, saleCompanyKey, saleId, roster, content }) {
  const contentByHip = new Map();
  const pushEntry = (hip, entry) => {
    const key = String(hip);
    if (!contentByHip.has(key)) contentByHip.set(key, []);
    contentByHip.get(key).push(entry);
  };

  // Bulk-loaded entries carry the file's own sequence (seq); hand-entered
  // ones don't, so they sort after, in the order entered.
  const seqOf = (c) => (Number.isFinite(c.seq) ? c.seq : Infinity);
  const bySeqThenTime = (a, b) => (seqOf(a) - seqOf(b)) || (new Date(a.created_at) - new Date(b.created_at));

  // 1. UPDATE entries
  const updates = content
    .filter(c => c.type === 'UPDATE')
    .sort(bySeqThenTime);
  for (const u of updates) {
    pushEntry(u.hip_no, { type: 'UPDATE', label: u.label || '', text: u.text });
  }

  // 2. RESULT entries, derived from each hip's current sale status
  for (const r of roster) {
    if (!r.sale) continue;
    if (r.sale.status === 'sold') {
      const price = r.sale.price ? `$${Number(r.sale.price).toLocaleString('en-US')}` : '';
      const text = `${price}<br>${r.sale.buyer || ''}`;
      pushEntry(r.hip_no, { type: 'RESULT', label: '', text });
    } else if (r.sale.status === 'rna') {
      pushEntry(r.hip_no, { type: 'RESULT', label: '', text: 'RNA' });
    } else if (r.sale.status === 'withdrawn') {
      pushEntry(r.hip_no, { type: 'RESULT', label: '', text: 'Withdrawn' });
    }
  }

  // 3. LINK entries (bulk file order — TrackIT, then Video — then by hand)
  const links = content
    .filter(c => c.type === 'LINK')
    .sort(bySeqThenTime);
  for (const l of links) {
    pushEntry(l.hip_no, { type: 'LINK', label: l.label || '', text: l.text });
  }

  const lines = [];
  lines.push('<SaleUpdates>');
  lines.push(`<SaleCompany>${saleCompany}</SaleCompany>`);
  lines.push(`<SaleCompanyKey>${saleCompanyKey}</SaleCompanyKey>`);

  // Stable, human-friendly ordering: numeric hip order
  const hipsInOrder = [...contentByHip.keys()].sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));

  for (const hip of hipsInOrder) {
    const entries = contentByHip.get(hip);
    entries.forEach((entry, idx) => {
      const sequence = idx + 1;
      lines.push(
        `<Content ${attr('Sale', saleId)} ${attr('Hip', hip)} ${attr('Type', entry.type)} ` +
        `${attr('Sequence', sequence)} ${attr('Label', entry.label)} ${attr('Text', entry.text)}/>`
      );
    });
  }

  lines.push('</SaleUpdates>');
  return lines.join('\n');
}

module.exports = { buildSaleUpdatesXml };
