/**
 * Equiline submission client.
 *
 * Equiline's service takes a plain POST of the XML to one URL, with no
 * login step. The URL comes from .env:
 *
 *   EQUILINE_SUBMIT_URL=http://www.test.equineline.com/xml/CatalogAppServices.cfm?s=updates&t=xml
 *
 * (Use a plain "&" in .env; "&amp;" is only how it looks when copied out of
 * a web page or XML file.)
 */

async function submitToEquiline(xml) {
  const submitUrl = (process.env.EQUILINE_SUBMIT_URL || '').trim();
  if (!submitUrl) {
    throw new Error('EQUILINE_SUBMIT_URL is not set. Add it to .env and restart the server.');
  }
  if (submitUrl.includes('&amp;')) {
    throw new Error('EQUILINE_SUBMIT_URL contains "&amp;". Replace it with a plain "&" in .env and restart the server.');
  }
  if (/\.invalid(\/|:|$)/i.test(new URL(submitUrl).hostname + '/')) {
    throw new Error(`EQUILINE_SUBMIT_URL is still the placeholder from .env.example (${submitUrl}). Put Equiline's real URL in .env and restart the server.`);
  }

  let resp;
  try {
    resp = await fetch(submitUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body: xml
    });
  } catch (err) {
    // Node's fetch only says "fetch failed" when it can't reach a server at
    // all; the real reason (DNS, refused, timeout, TLS) is on err.cause.
    const reason = err.cause?.code || err.cause?.message || err.message;
    throw new Error(`Could not reach ${submitUrl} (${reason}): no response from the server.`);
  }

  const responseText = await resp.text().catch(() => '');

  // Equineline's test site redirects anything it won't accept to its Beta
  // login page, which answers 200, so a plain resp.ok would log a
  // "successful" submit that never reached the service. Treat it as a failure.
  if (resp.redirected && /login/i.test(resp.url)) {
    return {
      ok: false,
      status: resp.status,
      responseText: `Redirected to Equineline's login page (${resp.url}), so the XML was not accepted. Ask Equiline what the POST is missing.`
    };
  }

  return { ok: resp.ok, status: resp.status, responseText };
}

module.exports = { submitToEquiline };
