/**
 * Minimal CSV parser — no dependency needed for a header row + simple rows.
 * Handles quoted fields, escaped quotes (""), and commas inside quotes.
 * Returns an array of objects keyed by the header row.
 */
function parseCSV(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;

  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { rows.push(row); row = []; };

  // Normalize line endings, then walk char by char.
  const input = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') pushField();
      else if (c === '\n') { pushField(); pushRow(); }
      else field += c;
    }
  }
  // Trailing field/row (file may or may not end with a newline).
  if (field.length > 0 || row.length > 0) { pushField(); pushRow(); }

  const filtered = rows.filter(r => r.some(cell => cell.trim() !== ''));
  if (filtered.length === 0) return [];

  const header = filtered[0].map(h => h.trim());
  return filtered.slice(1).map(r => {
    const obj = {};
    header.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim(); });
    return obj;
  });
}

module.exports = { parseCSV };
