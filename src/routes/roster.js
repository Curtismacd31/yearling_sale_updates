const express = require('express');
const { readJSON, update, nextId } = require('../db');
const { parseCSV } = require('../services/csv');
const { isEquinelineExport, mapEquinelineExport } = require('../services/equinelineImport');
const { isLinkFile } = require('../services/linkFileImport');
const { LINK_FIELDS, withLinks, syncHipLinks } = require('../services/hipLinks');

const router = express.Router();

const FIELDS = [
  'hip_no', 'yearling_name', 'sire', 'dam',
  'consignor', 'video_url', 'trackit_url', 'pedigree_url'
];
// Display-only extras — not required by the Equiline submission schema, but
// useful to see in the roster table when the source data has them (e.g. the
// official Equineline catalog export includes sex and gait).
const EXTRA_FIELDS = ['sex', 'gait'];

function normalize(row) {
  const out = {};
  for (const f of FIELDS) out[f] = (row[f] ?? '').toString().trim();
  for (const f of EXTRA_FIELDS) out[f] = (row[f] ?? '').toString().trim();
  return out;
}

// Link fields come from the loaded LINK content (see services/hipLinks.js),
// so the table and the Edit form show whatever links are loaded for a hip.
router.get('/', (req, res) => {
  const roster = readJSON('roster') || [];
  res.json(withLinks(roster, readJSON('content') || []));
});

// Link fields live in content.json, not on the roster record
function splitLinks(clean) {
  const links = {};
  for (const f of LINK_FIELDS) {
    links[f.field] = clean[f.field];
    clean[f.field] = '';
  }
  return links;
}

// Bulk load — accepts either raw CSV text or an array of row objects.
// Upserts by hip_no: existing hips get updated in place, new hip_nos are
// appended, so re-loading an updated sheet never duplicates entries.
router.post('/bulk', (req, res) => {
  const { csv, rows } = req.body || {};
  let incoming;
  try {
    incoming = Array.isArray(rows) ? rows : parseCSV(csv || '');
  } catch (e) {
    return res.status(400).json({ error: 'Could not parse CSV: ' + e.message });
  }
  if (!incoming.length) {
    return res.status(400).json({ error: 'No rows found. Expected header: ' + FIELDS.join(',') });
  }

  // Equiline's per-hip content file isn't roster data — never let it touch
  // the roster. It loads from the Updates panel instead.
  if (isLinkFile(incoming)) {
    return res.status(400).json({ error: 'That\'s Equiline\'s updates/links file, not a roster. Load it from the Updates panel\'s bulk load instead.' });
  }

  let detectedSaleId = null;
  if (isEquinelineExport(incoming)) {
    const mapped = mapEquinelineExport(incoming);
    incoming = mapped.rows;
    detectedSaleId = mapped.saleId;
  }

  const missingHip = incoming.filter(r => !String(r.hip_no || '').trim());
  if (missingHip.length) {
    return res.status(400).json({ error: 'Every row needs a hip_no' });
  }

  const result = update('roster', [], (current) => {
    const byHip = new Map(current.map(r => [String(r.hip_no), r]));
    for (const raw of incoming) {
      const clean = normalize(raw);
      const existing = byHip.get(String(clean.hip_no));
      if (existing) {
        // Only overwrite with non-blank values — a file that doesn't carry a
        // column (e.g. the catalog export has no video/Trackit URLs) must
        // never wipe what's already on the hip, names included.
        for (const [k, v] of Object.entries(clean)) {
          if (v !== '') existing[k] = v;
        }
      } else {
        byHip.set(String(clean.hip_no), {
          id: nextId(current),
          ...clean,
          status: 'active',
          sale: { status: 'pending', price: '', buyer: '', recorded_at: null }
        });
        current.push(byHip.get(String(clean.hip_no)));
      }
    }
    return current;
  });

  res.json({ ok: true, count: incoming.length, roster: result, detectedSaleId });
});

// Manual single-entry add
router.post('/', (req, res) => {
  const clean = normalize(req.body || {});
  if (!clean.hip_no) return res.status(400).json({ error: 'hip_no is required' });
  const links = splitLinks(clean);

  const result = update('roster', [], (current) => {
    if (current.some(r => String(r.hip_no) === String(clean.hip_no))) {
      throw new Error(`Hip ${clean.hip_no} already exists`);
    }
    current.push({
      id: nextId(current),
      ...clean,
      status: 'active',
      sale: { status: 'pending', price: '', buyer: '', recorded_at: null }
    });
    return current;
  });
  syncHipLinks(clean.hip_no, links);
  res.json({ ok: true, roster: withLinks(result, readJSON('content') || []) });
});

// Manual edit of one yearling's core details (name/sire/dam/consignor/links)
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const clean = normalize({ ...req.body, hip_no: req.body.hip_no });
  const links = splitLinks(clean);
  let found = false;
  let oldHipNo;
  const result = update('roster', [], (current) => {
    const rec = current.find(r => r.id === id);
    if (!rec) return current;
    found = true;
    oldHipNo = rec.hip_no;
    Object.assign(rec, clean);
    return current;
  });
  if (!found) return res.status(404).json({ error: 'Not found' });
  // Links (and, if the hip number changed, all of the hip's content) follow the edit
  syncHipLinks(clean.hip_no, links, oldHipNo);
  res.json({ ok: true, roster: withLinks(result, readJSON('content') || []) });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const result = update('roster', [], (current) => current.filter(r => r.id !== id));
  res.json({ ok: true, roster: result });
});

module.exports = router;
