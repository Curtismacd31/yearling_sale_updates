/**
 * Keeps a hip's Video / TrackIT / Pedigree links in one place.
 *
 * The LINK entries in content.json (bulk-loaded from Equiline's file, or
 * added by hand) are what actually go to Equiline, so they're the source of
 * truth. The roster's video_url / trackit_url / pedigree_url fields are just
 * a view of them:
 *   - withLinks() fills those fields from content when the roster is read,
 *     so the roster table and the Edit form show whatever is loaded.
 *   - syncHipLinks() writes edits from the Edit form back into content, so
 *     a link changed on the roster tab is what gets submitted.
 */
const { update, nextId } = require('../db');

const LINK_FIELDS = [
  { field: 'trackit_url', key: 'trackit', label: 'TrackIT' },
  { field: 'video_url', key: 'video', label: 'Video' },
  { field: 'pedigree_url', key: 'pedigree', label: 'Pedigree' }
];

// "TrackIT", "Trackit", "Track It" -> "trackit"
function labelKey(label) {
  return String(label || '').toLowerCase().replace(/[^a-z]/g, '');
}

const seqOf = (c) => (Number.isFinite(c.seq) ? c.seq : Infinity);
const linkOrder = (a, b) => (seqOf(a) - seqOf(b)) || (new Date(a.created_at) - new Date(b.created_at));

/** First LINK entry per hip per link kind: Map(hip -> { trackit: entry, ... }) */
function linksByHip(content) {
  const byHip = new Map();
  const links = content.filter(c => c.type === 'LINK').sort(linkOrder);
  for (const c of links) {
    const key = labelKey(c.label);
    if (!LINK_FIELDS.some(f => f.key === key)) continue;
    const hip = String(c.hip_no);
    if (!byHip.has(hip)) byHip.set(hip, {});
    const slot = byHip.get(hip);
    if (!slot[key]) slot[key] = c;
  }
  return byHip;
}

/** Roster records with link fields filled from content (roster's own value as fallback). */
function withLinks(roster, content) {
  const byHip = linksByHip(content || []);
  return roster.map(r => {
    const slot = byHip.get(String(r.hip_no)) || {};
    const out = { ...r };
    for (const f of LINK_FIELDS) {
      if (slot[f.key]) out[f.field] = slot[f.key].text;
    }
    return out;
  });
}

/**
 * Write a hip's link fields into content.json.
 * values: { trackit_url, video_url, pedigree_url } — a blank value removes that link.
 * oldHipNo: pass when the hip number itself was edited, so the hip's
 * content (links and updates) moves with it.
 */
function syncHipLinks(hipNo, values, oldHipNo) {
  const hip = String(hipNo);
  update('content', [], (current) => {
    if (oldHipNo !== undefined && String(oldHipNo) !== hip) {
      for (const c of current) if (String(c.hip_no) === String(oldHipNo)) c.hip_no = hip;
    }
    const slot = linksByHip(current).get(hip) || {};
    let next = current;
    for (const f of LINK_FIELDS) {
      const value = String(values[f.field] ?? '').trim();
      const existing = slot[f.key];
      if (existing) {
        if (!value) next = next.filter(c => c !== existing);
        else existing.text = value;
      } else if (value) {
        next.push({
          id: nextId(next),
          hip_no: hip,
          type: 'LINK',
          label: f.label,
          text: value,
          created_at: new Date().toISOString()
        });
      }
    }
    return next;
  });
}

module.exports = { LINK_FIELDS, withLinks, syncHipLinks };
