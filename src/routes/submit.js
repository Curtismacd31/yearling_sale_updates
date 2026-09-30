const express = require('express');
const { readJSON, writeJSON, update, nextId } = require('../db');
const { buildSaleUpdatesXml } = require('../services/xmlBuilder');
const { submitToEquiline } = require('../services/equilineClient');

const router = express.Router();

function currentXml() {
  const config = readJSON('config') || {};
  const roster = readJSON('roster') || [];
  const content = readJSON('content') || [];
  return buildSaleUpdatesXml({
    saleCompany: config.saleCompany || '',
    saleCompanyKey: config.saleCompanyKey || '',
    saleId: config.saleId || '',
    roster,
    content
  });
}

router.get('/config', (req, res) => {
  res.json(readJSON('config') || { saleCompany: '', saleCompanyKey: '', saleId: '' });
});

router.put('/config', (req, res) => {
  const { saleCompany, saleCompanyKey, saleId } = req.body || {};
  const config = { saleCompany: saleCompany || '', saleCompanyKey: saleCompanyKey || '', saleId: saleId || '' };
  writeJSON('config', config);
  res.json({ ok: true, config });
});

// Preview the aggregate XML without sending it anywhere
router.get('/preview', (req, res) => {
  res.type('application/xml').send(currentXml());
});

// Build the aggregate XML and POST it to Equiline
router.post('/', async (req, res) => {
  const config = readJSON('config') || {};
  if (!config.saleId) {
    return res.status(400).json({ error: 'Set a Sale ID in the submit panel before sending (Equiline assigns this per sale).' });
  }

  const xml = currentXml();
  let outcome;
  try {
    outcome = await submitToEquiline(xml);
  } catch (err) {
    outcome = { ok: false, status: null, responseText: err.message };
  }

  update('submissions', [], (log) => {
    log.push({
      id: nextId(log),
      sent_at: new Date().toISOString(),
      ok: outcome.ok,
      status: outcome.status,
      response: outcome.responseText,
      xml
    });
    // Keep the last 100 submission attempts on disk — plenty for troubleshooting
    return log.slice(-100);
  });

  if (!outcome.ok) {
    return res.status(502).json({ error: 'Equiline submission failed', detail: outcome.responseText, status: outcome.status });
  }
  res.json({ ok: true, status: outcome.status, response: outcome.responseText });
});

router.get('/history', (req, res) => {
  const log = readJSON('submissions') || [];
  res.json([...log].sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at)));
});

module.exports = router;
