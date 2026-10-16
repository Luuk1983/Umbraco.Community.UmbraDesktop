/**
 * Reads YouTube's channel Atom feed. Regex over `<entry>` blocks instead of an XML parser: the feed
 * is machine-generated and flat, and this tool has to run from a bare checkout with no `npm install`,
 * so a parser dependency would buy nothing but a step that can fail.
 * @module rss
 */

/**
 * One video as the feed describes it, before any cleanup.
 * @typedef {object} FeedEntry
 * @property {string} videoId The YouTube video id, from `<yt:videoId>`.
 * @property {string} title The raw title, prefix and all.
 * @property {string} published The upload moment exactly as the feed wrote it.
 * @property {string} description The full description, from `<media:description>`.
 */

/**
 * The five entities XML defines, decoded with the ampersand last: doing it first would turn
 * `&amp;lt;` into `<` when it means the literal text `&lt;`.
 * @param {string} text Raw element text.
 * @returns {string} The text with entities decoded.
 */
function decode(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Text of the first element with this exact tag name inside a block. The tag is matched with its
 * angle bracket, so asking for `title` never lands on `<media:title>`.
 * @param {string} block The XML to search.
 * @param {string} tag The tag name, prefix included.
 * @returns {string} The decoded text, or an empty string when the element is absent.
 */
function textOf(block, tag) {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(block);
  return match ? decode(match[1]) : '';
}

/**
 * Parses a channel feed into its entries, in the order the feed gives them (newest first).
 * @param {string} xml The feed body.
 * @returns {FeedEntry[]} The entries; empty for a valid feed with none.
 * @throws {Error} When the input is not an Atom feed at all. A proxy's "blocked" page must fail
 * the run loudly, because reading it as "no episodes" would look like a healthy quiet channel.
 */
export function parseFeed(xml) {
  if (typeof xml !== 'string' || !/<feed[\s>]/.test(xml)) {
    throw new Error('The response is not an Atom feed.');
  }
  const entries = [];
  const pattern = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = pattern.exec(xml)) !== null) {
    const block = match[1];
    entries.push({
      videoId: textOf(block, 'yt:videoId'),
      title: textOf(block, 'title'),
      published: textOf(block, 'published'),
      description: textOf(block, 'media:description'),
    });
  }
  return entries;
}
