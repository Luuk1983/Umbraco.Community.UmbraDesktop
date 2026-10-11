import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Reads a recorded body from `test/fixtures/`, so no test needs the network.
 * @param {string} name File name inside the fixtures folder.
 * @returns {string} The file's text.
 */
export function fixture(name) {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');
}

/**
 * Builds a `Response`-shaped answer, which is all the tool reads from a fetch.
 * @param {number} status HTTP status.
 * @param {string} body Response text.
 * @returns {{ ok: boolean, status: number, text: () => Promise<string>, json: () => Promise<unknown> }} The fake response.
 */
export function respond(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) };
}

/**
 * A fake `fetch` that routes by URL substring and records every URL it was asked for, so a test can
 * assert both what came back and what was (not) called. An unrouted URL fails the test loudly
 * instead of falling through to the network.
 * @param {Record<string, () => ReturnType<typeof respond>>} routes Substring of the URL mapped to its answer.
 * @returns {{ fetchImpl: (url: string) => Promise<unknown>, calls: string[] }} The fake and its call log.
 */
export function fakeFetch(routes) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    const key = Object.keys(routes).find((k) => String(url).includes(k));
    if (!key) throw new Error(`Unrouted fetch in a test: ${url}`);
    return routes[key]();
  };
  return { fetchImpl, calls };
}
