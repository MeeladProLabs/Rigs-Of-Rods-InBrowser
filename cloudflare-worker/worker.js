// Rigs of Rods mod download proxy.
//
// The forum (forum.rigsofrods.org) sends no CORS headers, so a browser page
// cannot read mod downloads directly. This Worker fetches the file server-side
// (no CORS applies) and returns it with permissive CORS headers, so the mod
// repository page can store the bytes into IndexedDB and the game can use them.
//
// Usage: https://<your-worker>.workers.dev/?url=<encoded target url>
//   e.g. https://ror-mod-proxy.<subdomain>.workers.dev/?url=https%3A%2F%2Fforum...
//
// Free tier: no credit card required. Limits are generous (100k requests/day);
// the response body is streamed, not buffered, so even large mod files work.

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request) {
    // Preflight for CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const target = url.searchParams.get('url');
    if (!target) {
      return new Response('Missing "url" query parameter.', {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    // Only proxy http(s) targets to avoid SSRF on localhost/private ranges.
    let parsed;
    try {
      parsed = new URL(target);
    } catch {
      return new Response('Invalid target URL.', { status: 400, headers: CORS_HEADERS });
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return new Response('Only http(s) targets are allowed.', { status: 400, headers: CORS_HEADERS });
    }
    const hostname = parsed.hostname;
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.endsWith('.local') ||
      /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)
    ) {
      return new Response('Private/local targets are not allowed.', { status: 400, headers: CORS_HEADERS });
    }

    try {
      const upstream = await fetch(target, {
        redirect: 'follow',
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept': '*/*',
        },
      });

      const headers = new Headers(upstream.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      headers.set('Access-Control-Allow-Headers', '*');
      // The forum sends X-Content-Type-Options: nosniff, so keep the
      // content-type/content-length from upstream untouched.

      // Stream the body straight through (no buffering -> large mods fine).
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
      });
    } catch (err) {
      return new Response('Proxy error: ' + (err && err.message ? err.message : String(err)), {
        status: 502,
        headers: CORS_HEADERS,
      });
    }
  },
};
