const express = require('express');
const { readJSON } = require('../db');

const router = express.Router();

// This feed is intentionally NOT behind login — it's meant to be pulled by
// overlays/graphics/other tools (vMix, a website widget, etc). It only ever
// exposes resolved sale results, never login-only roster/consignor admin data.
function getResolvedResults() {
  const roster = readJSON('roster') || [];
  return roster
    .filter(r => r.sale && ['sold', 'rna', 'withdrawn'].includes(r.sale.status) && r.sale.recorded_at)
    .map(r => ({
      hip_no: r.hip_no,
      yearling_name: r.yearling_name,
      sire: r.sire,
      dam: r.dam,
      consignor: r.consignor,
      status: r.sale.status,       // 'sold' | 'rna' | 'withdrawn'
      price: r.sale.price || null,
      buyer: r.sale.buyer || null,
      recorded_at: r.sale.recorded_at
    }))
    .sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));
}

function respondLimited(req, res, limit) {
  const all = getResolvedResults();
  const data = limit === 'all' ? all : all.slice(0, limit);
  res.json({ count: data.length, total: all.length, results: data });
}

// /api/public/results?limit=10   (limit omitted or "all" => everything)
router.get('/', (req, res) => {
  const q = req.query.limit;
  const limit = !q || q === 'all' ? 'all' : Math.max(1, parseInt(q, 10) || 10);
  respondLimited(req, res, limit);
});

// Convenience fixed routes matching "last 5 / last 10 / last 25 / all"
router.get('/last5', (req, res) => respondLimited(req, res, 5));
router.get('/last10', (req, res) => respondLimited(req, res, 10));
router.get('/last25', (req, res) => respondLimited(req, res, 25));
router.get('/all', (req, res) => respondLimited(req, res, 'all'));

module.exports = router;
