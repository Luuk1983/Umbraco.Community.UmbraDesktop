/**
 * Static file server for the manifest injection spike.
 *
 * Exists for two reasons that a file:// URL cannot give us. Installability requires a secure
 * context, and `localhost` counts as one while `file://` does not, so the fixture has to be served
 * at all. And the server log is the *independent* record: a page can claim it appended a link
 * element, but only the server can say whether Chrome went and fetched the manifest because of it.
 * Every request is logged with a timestamp for exactly that.
 *
 * Deliberately dependency-free. The spike's value is that it can be re-run years from now against a
 * future Chrome, and `node server.mjs` with nothing installed is the version of that which still
 * works.
 */

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

/** The one port this listens on. Arbitrary, and high enough to be unlikely to collide. */
const PORT = 8731;

/**
 * Content types for the fixture's file kinds.
 *
 * `.webmanifest` is the one that matters: Chrome wants `application/manifest+json`, and serving it
 * as `application/octet-stream` would fail the spike for a reason that has nothing to do with what
 * is being tested.
 */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

/** Where this file lives, so the fixture can be served from any working directory. */
const DIR = import.meta.dirname;

/**
 * Name the browser behind a request, padded so the log stays in columns.
 *
 * Order matters and is the whole subtlety: Edge's UA contains `Chrome`, and Chrome's contains
 * `Safari`, so the most specific token has to be tested first or every browser reports as the one
 * below it.
 * @param {string | undefined} ua The request's `User-Agent` header.
 * @returns {string} A short fixed-width browser name, or `?` when there is nothing to go on.
 */
function browserOf(ua) {
  const name = !ua
    ? '?'
    : /Edg\//.test(ua)
      ? 'Edge'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : '?';
  return name.padEnd(7);
}

http
  .createServer(async (req, res) => {
    // Parsed rather than used raw so a query string cannot become part of the filename.
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const file = url.pathname === '/' ? '/b.html' : url.pathname;

    // The whole point of the server. Read this log, not the page's own claims.
    //
    // The browser is named on every line, not just on the beacon, because a log that cannot tell
    // Chrome from Firefox cannot answer a question about Firefox — and one manual run was already
    // spent discovering that the install dialog under test had been a different browser's. The
    // manifest fetch triggered by an install carries no beacon with it, so the request's own
    // User-Agent is the only thing that can attribute it.
    // `url.search` is logged but never used to resolve the file, so probe.js's own `?probe=banner`
    // check is visible as itself rather than masquerading as the browser's manifest fetch.
    console.log(
      new Date().toISOString(),
      browserOf(req.headers['user-agent']),
      req.method,
      file + url.search,
    );

    // Where probe.js beacons its result, so a browser whose console you cannot reach can still
    // report. Printed prominently because it is the line you are waiting for.
    if (req.method === 'POST' && file === '/report') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      console.log('  >> REPORT', Buffer.concat(chunks).toString());
      res.writeHead(204).end();
      return;
    }

    try {
      const body = await readFile(join(DIR, file));
      res.writeHead(200, {
        'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
        // Never cache. A browser serving these from cache after the server has stopped is how one
        // manual run got thrown away: the pages rendered, the manifest could not be fetched, and the
        // result looked like a browser ignoring manifests rather than like a dead server.
        'cache-control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  })
  // Bound to every interface, not just loopback, so a second device can reach it. See the README's
  // note on why that alone is not enough to test a phone: off `localhost` this is no longer a secure
  // context, and installability stops applying.
  .listen(PORT, '0.0.0.0', () => console.log(`manifest injection spike on http://localhost:${PORT}`));
