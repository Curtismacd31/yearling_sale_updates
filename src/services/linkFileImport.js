/**
 * Equiline bulk content import ("link file" / bulk updates).
 *
 * This is Equiline's own per-hip content format — one row per <Content>
 * line, with the header:
 *   sale_company,sale_company_key,sale_id,hip_number,sequence,
 *   content_type,content,content_label
 *
 * It's the baseline content for the whole sale (a TrackIT link for every
 * hip, Video links where they exist, and RESULT/WITHDRAWN for hips already
 * out). Loading it is what puts every hip on the roster into each XML send.
 *
 * Loaded from the Updates panel's bulk load. Mapping:
 *   LINK / UPDATE rows   -> content.json entries (source: 'link_file')
 *   RESULT, WITHDRAWN    -> roster hip marked out + sale.status 'withdrawn'
 *                           (the XML builder derives the RESULT line from
 *                           that, same as a hip withdrawn in the app)
 *   sale company/key/id  -> config.json, only where those fields are blank
 *
 * Re-loading is safe: the file is treated as the full picture, so every
 * entry from a previous bulk load is replaced wholesale. Updates and links
 * entered by hand in the app are never touched.
 */
const { readJSON, writeJSON, update, nextId } = require('../db');

const MARKER_FIELDS = ['hip_number', 'sequence', 'content_type', 'content'];

function cleanKey(k) {
  return String(k).replace(/^\uFEFF/, '').trim();
}

function normalizeRows(rows) {
  return rows.map(row => {
    const out = {};
    for (const [k, v] of Object.entries(row)) out[cleanKey(k)] = (v ?? '').toString().trim();
    return out;
  });
}

function isLinkFile(rows) {
  if (!rows || !rows.length) return false;
  const keys = Object.keys(rows[0]).map(cleanKey);
  return MARKER_FIELDS.every(f => keys.includes(f));
}

function importLinkFile(rawRows) {
  const rows = normalizeRows(rawRows).filter(r => r.hip_number);
  const roster = readJSON('roster') || [];
  const rosterHips = new Set(roster.map(r => String(r.hip_no)));

  const entries = [];
  const withdrawnHips = new Set();
  const unknownHips = new Set();
  const skippedTypes = new Map();

  for (const r of rows) {
    const hip = String(r.hip_number);
    if (!rosterHips.has(hip)) { unknownHips.add(hip); continue; }
    const type = r.content_type.toUpperCase();

    if (type === 'LINK' || type === 'UPDATE') {
      if (!r.content) continue;
      entries.push({
        type,
        hip_no: hip,
        label: r.content_label || '',
        text: r.content,
        seq: parseInt(r.sequence, 10) || 0
      });
    } else if (type === 'RESULT' &&
      (r.content.toUpperCase() === 'WITHDRAWN' || r.content_label.toUpperCase() === 'WITHDRAWN')) {
      // Equiline's file carries WITHDRAWN in either the content or the label column
      withdrawnHips.add(hip);
    } else {
      const key = `${type}${r.content ? ' / ' + r.content : ''}`;
      skippedTypes.set(key, (skippedTypes.get(key) || 0) + 1);
    }
  }

  // Keep entries in the file's own order: hip, then sequence
  entries.sort((a, b) =>
    ((parseInt(a.hip_no, 10) || 0) - (parseInt(b.hip_no, 10) || 0)) || (a.seq - b.seq));

  let linksAdded = 0;
  let updatesAdded = 0;
  update('content', [], (current) => {
    const kept = current.filter(c => c.source !== 'link_file');
    const manualKeys = new Set(kept.map(c => `${c.hip_no}|${c.type}|${c.text}`));
    const now = new Date().toISOString();
    for (const e of entries) {
      if (manualKeys.has(`${e.hip_no}|${e.type}|${e.text}`)) continue; // already entered by hand
      kept.push({
        id: nextId(kept),
        hip_no: e.hip_no,
        type: e.type,
        label: e.label,
        text: e.text,
        seq: e.seq,
        source: 'link_file',
        created_at: now
      });
      if (e.type === 'LINK') linksAdded++; else updatesAdded++;
    }
    return kept;
  });

  let withdrawnApplied = 0;
  if (withdrawnHips.size) {
    update('roster', [], (current) => {
      const now = new Date().toISOString();
      for (const rec of current) {
        if (!withdrawnHips.has(String(rec.hip_no))) continue;
        if (rec.sale && rec.sale.status === 'withdrawn' && rec.status === 'out') continue;
        rec.status = 'out';
        rec.out_reason = rec.out_reason || 'Withdrawn (link file)';
        rec.sale = { status: 'withdrawn', price: '', buyer: '', recorded_at: now };
        withdrawnApplied++;
      }
      return current;
    });
  }

  // Fill blank sale config fields from the file (never overwrite what's set)
  const first = rows[0] || {};
  const config = readJSON('config') || { saleCompany: '', saleCompanyKey: '', saleId: '' };
  const configFilled = [];
  const fill = (field, value) => {
    if (!config[field] && value) { config[field] = value; configFilled.push(field); }
  };
  fill('saleCompany', first.sale_company);
  fill('saleCompanyKey', first.sale_company_key);
  fill('saleId', first.sale_id);
  if (configFilled.length) writeJSON('config', config);

  const hipsCovered = new Set([...entries.map(e => e.hip_no), ...withdrawnHips]);
  const missingHips = [...rosterHips].filter(h => !hipsCovered.has(h));

  return {
    rows: rows.length,
    linksAdded,
    updatesAdded,
    withdrawn: withdrawnHips.size,
    withdrawnApplied,
    hipsCovered: hipsCovered.size,
    rosterHips: rosterHips.size,
    missingHips: missingHips.sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0)),
    unknownHips: [...unknownHips],
    skipped: Object.fromEntries(skippedTypes),
    configFilled
  };
}

module.exports = { isLinkFile, importLinkFile };
