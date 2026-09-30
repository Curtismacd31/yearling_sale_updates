const express = require('express');
const { readJSON, update } = require('../db');

const router = express.Router();

// Roster sorted for the sale-day view: numeric hip order, "out" hips last
router.get('/', (req, res) => {
  const roster = readJSON('roster') || [];
  const sorted = [...roster].sort((a, b) => {
    if (a.status === 'out' && b.status !== 'out') return 1;
    if (b.status === 'out' && a.status !== 'out') return -1;
    return (parseInt(a.hip_no, 10) || 0) - (parseInt(b.hip_no, 10) || 0);
  });
  res.json(sorted);
});

// Record the outcome for a hip as it goes through the ring
router.post('/:hip_no/result', (req, res) => {
  const hip_no = String(req.params.hip_no);
  const { status, price, buyer } = req.body || {};
  const allowed = ['pending', 'sold', 'rna', 'withdrawn'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'status must be one of: ' + allowed.join(', ') });
  }
  if (status === 'sold' && !price) {
    return res.status(400).json({ error: 'price is required when status is sold' });
  }

  let found = false;
  const roster = update('roster', [], (current) => {
    const rec = current.find(r => String(r.hip_no) === hip_no);
    if (!rec) return current;
    found = true;
    rec.sale = {
      status,
      price: status === 'sold' ? String(price) : '',
      buyer: status === 'sold' ? String(buyer || '') : '',
      recorded_at: new Date().toISOString()
    };
    if (status === 'withdrawn') rec.status = 'out';
    return current;
  });
  if (!found) return res.status(404).json({ error: 'Hip not found' });
  res.json({ ok: true, roster });
});

module.exports = router;
