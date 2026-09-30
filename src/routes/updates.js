const express = require('express');
const { readJSON, update, nextId } = require('../db');
const { parseCSV } = require('../services/csv');
const { isLinkFile, importLinkFile } = require('../services/linkFileImport');

const router = express.Router();

// All UPDATE / LINK content entries, most recent first
router.get('/', (req, res) => {
  const content = readJSON('content') || [];
  res.json([...content].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
});

// Add a free-text update for a hip (e.g. race form, notes)
router.post('/', (req, res) => {
  const { hip_no, text, label, type } = req.body || {};
  if (!hip_no || !text) return res.status(400).json({ error: 'hip_no and text are required' });

  const entryType = type === 'LINK' ? 'LINK' : 'UPDATE';

  const result = update('content', [], (current) => {
    current.push({
      id: nextId(current),
      hip_no: String(hip_no),
      type: entryType,
      label: label || '',
      text: String(text),
      created_at: new Date().toISOString()
    });
    return current;
  });
  res.json({ ok: true, content: result });
});

// Bulk load Equiline's per-hip content CSV (LINK / UPDATE / RESULT rows).
// The file is the full picture: previous bulk-loaded entries are replaced.
router.post('/bulk', (req, res) => {
  let rows;
  try {
    rows = parseCSV((req.body && req.body.csv) || '');
  } catch (e) {
    return res.status(400).json({ error: 'Could not parse CSV: ' + e.message });
  }
  if (!isLinkFile(rows)) {
    return res.status(400).json({
      error: 'Not an Equiline content file. Expected header: sale_company,sale_company_key,sale_id,hip_number,sequence,content_type,content,content_label'
    });
  }
  if (!(readJSON('roster') || []).length) {
    return res.status(400).json({ error: 'Load the roster first — this file attaches content to hips already on the roster.' });
  }
  const summary = importLinkFile(rows);
  res.json({ ok: true, ...summary, content: readJSON('content') || [] });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const result = update('content', [], (current) => current.filter(c => c.id !== id));
  res.json({ ok: true, content: result });
});

// Mark a yearling as OUT (scratched before sale day) — adds it to the outs list
router.post('/:hip_no/out', (req, res) => {
  const hip_no = String(req.params.hip_no);
  const { reason } = req.body || {};
  let found = false;
  const roster = update('roster', [], (current) => {
    const rec = current.find(r => String(r.hip_no) === hip_no);
    if (!rec) return current;
    found = true;
    rec.status = 'out';
    rec.out_reason = reason || '';
    rec.sale = { status: 'withdrawn', price: '', buyer: '', recorded_at: new Date().toISOString() };
    return current;
  });
  if (!found) return res.status(404).json({ error: 'Hip not found' });
  res.json({ ok: true, roster });
});

// Undo an out (put the yearling back to active)
router.post('/:hip_no/reinstate', (req, res) => {
  const hip_no = String(req.params.hip_no);
  let found = false;
  const roster = update('roster', [], (current) => {
    const rec = current.find(r => String(r.hip_no) === hip_no);
    if (!rec) return current;
    found = true;
    rec.status = 'active';
    rec.out_reason = '';
    rec.sale = { status: 'pending', price: '', buyer: '', recorded_at: null };
    return current;
  });
  if (!found) return res.status(404).json({ error: 'Hip not found' });
  res.json({ ok: true, roster });
});

module.exports = router;
