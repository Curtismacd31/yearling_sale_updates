/**
 * Tiny atomic JSON file store.
 *
 * No database server to run/manage — each "table" is a JSON file in /data.
 * Writes go to a temp file in the same directory, then get renamed over the
 * real file (rename is atomic on the same filesystem), so a crash or
 * concurrent request never leaves a half-written file on disk.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function ensureFile(name, defaultValue) {
  const fp = filePath(name);
  if (!fs.existsSync(fp)) {
    writeJSON(name, defaultValue);
  }
}

function readJSON(name) {
  const fp = filePath(name);
  if (!fs.existsSync(fp)) return null;
  const raw = fs.readFileSync(fp, 'utf8');
  if (!raw.trim()) return null;
  return JSON.parse(raw);
}

function writeJSON(name, data) {
  const fp = filePath(name);
  const tmp = path.join(DATA_DIR, `.${name}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, fp); // atomic on POSIX + same-volume Windows
}

/**
 * Simple mutation helper: read -> mutate -> write, so callers never forget
 * the read/write pair or risk writing a stale copy after doing async work
 * in between (mutator should be synchronous).
 */
function update(name, defaultValue, mutator) {
  const current = readJSON(name) ?? defaultValue;
  const next = mutator(current);
  writeJSON(name, next);
  return next;
}

function nextId(records) {
  return records.reduce((max, r) => Math.max(max, r.id || 0), 0) + 1;
}

module.exports = { readJSON, writeJSON, update, ensureFile, nextId, DATA_DIR };
