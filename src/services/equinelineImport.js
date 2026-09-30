/**
 * The sale company's own export (from Equineline's catalog system) uses a
 * very different, much wider column set than our simple roster format —
 * things like hip_number, horse_name, sire_name, dam_name, consignor_name,
 * session_id, sale_id, sex, gait, etc. This adapter recognizes that export
 * by its header and maps it onto our internal roster fields, so it can be
 * pasted/uploaded straight in without reformatting by hand.
 */

const EQUINELINE_MARKER_FIELDS = ['hip_number', 'horse_name', 'sire_name', 'dam_name', 'consignor_name'];

function isEquinelineExport(rows) {
  if (!rows || !rows.length) return false;
  const keys = Object.keys(rows[0]);
  return EQUINELINE_MARKER_FIELDS.every(f => keys.includes(f));
}

function mapEquinelineRow(row) {
  const hipNo = row.hip_number_suffix
    ? `${row.hip_number}${row.hip_number_suffix}`
    : row.hip_number;

  return {
    hip_no: (hipNo || '').toString().trim(),
    yearling_name: (row.horse_name || '').trim(),
    sire: (row.sire_name || '').trim(),
    dam: (row.dam_name || '').trim(),
    consignor: (row.consignor_name || '').trim(),
    // Not present in this export — fill in later via manual edit or a
    // separate bulk update once video/Trackit/pedigree links exist.
    video_url: '',
    trackit_url: '',
    pedigree_url: '',
    // Extra context this export does carry, that isn't part of the Equiline
    // submission schema but is handy to see in the roster table.
    sex: (row.sex || '').trim(),
    gait: (row.gait || '').trim()
  };
}

/**
 * @returns {{ rows: object[], saleId: string|null }} rows already in our
 *   roster shape, plus the sale_id found in the file (if any/consistent) so
 *   the caller can offer to prefill the Submit panel's Sale ID.
 */
function mapEquinelineExport(rows) {
  const mapped = rows.map(mapEquinelineRow);
  const saleIds = [...new Set(rows.map(r => (r.sale_id || '').trim()).filter(Boolean))];
  const saleId = saleIds.length === 1 ? saleIds[0] : null;
  return { rows: mapped, saleId };
}

module.exports = { isEquinelineExport, mapEquinelineExport };
