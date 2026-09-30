const api = {
  async _req(method, url, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const resp = await fetch(url, opts);
    let data = null;
    try { data = await resp.json(); } catch { /* not json (e.g. xml preview) */ }
    if (!resp.ok) {
      const err = new Error((data && data.error) || `Request failed (${resp.status})`);
      err.status = resp.status;
      throw err;
    }
    return data;
  },
  get(url) { return this._req('GET', url); },
  post(url, body) { return this._req('POST', url, body); },
  put(url, body) { return this._req('PUT', url, body); },
  del(url) { return this._req('DELETE', url); }
};

function showResult(el, message, isError) {
  el.textContent = message;
  el.className = 'result ' + (isError ? 'error' : 'ok');
}
