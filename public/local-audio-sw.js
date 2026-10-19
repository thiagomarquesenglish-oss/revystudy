/* Isolated local-audio proof. Never fetch a missing file from the network. */
(() => {
  const prefix = '/__local_audio/v1/';
  const cacheName = 'revystudy-local-audio-proof-v1';
  const marker = { 'X-Revy-Local-Audio': 'v1', 'Cache-Control': 'no-store' };

  async function serve(request) {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: marker });
    const url = new URL(request.url);
    url.search = '';
    if (!/^\/__local_audio\/v1\/[^/]+\/[a-f0-9]{64}\.mp3$/.test(url.pathname)) {
      return new Response(null, { status: 404, headers: marker });
    }
    const saved = await (await caches.open(cacheName)).match(url.href);
    if (!saved || saved.status !== 200) return new Response(null, { status: 404, headers: marker });
    const file = await saved.blob();
    const headers = new Headers({ ...marker, 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff' });
    let start = 0, end = file.size - 1, status = 200;
    const range = request.headers.get('Range');
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match && (match[1] || match[2])) {
        if (match[1]) { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), end) : end; }
        else start = Math.max(0, file.size - Number(match[2]));
      }
      if (!match || !(match[1] || match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= file.size || (!match[1] && Number(match[2]) === 0)) {
        headers.set('Content-Range', `bytes */${file.size}`);
        return new Response(null, { status: 416, headers });
      }
      status = 206;
      headers.set('Content-Range', `bytes ${start}-${end}/${file.size}`);
    }
    headers.set('Content-Length', String(end - start + 1));
    return new Response(request.method === 'HEAD' ? null : file.slice(start, end + 1, 'audio/mpeg'), { status, headers });
  }

  self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin || !url.pathname.startsWith(prefix)) return;
    event.respondWith(serve(event.request).catch(() => new Response(null, { status: 503, headers: marker })));
    // Workbox must not turn a missing local file into the HTML app shell.
    event.stopImmediatePropagation();
  });
})();
