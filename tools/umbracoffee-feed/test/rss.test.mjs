import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed } from '../src/rss.mjs';
import { fixture } from './helpers.mjs';

test('parses all 15 entries of the recorded feed, newest first as the feed gives them', () => {
  const entries = parseFeed(fixture('feed-umbracoffee.xml'));
  assert.equal(entries.length, 15);
  assert.equal(entries[0].videoId, 'aRkc0fRxQjw');
  assert.equal(entries[0].title, 'umbraCoffee - The September Shift');
  assert.equal(entries[0].published, '2026-09-25T11:27:38+00:00');
  assert.match(entries[0].description, /^Welcome to your monthly dose of #umbraCoffee/);
  assert.match(entries[0].description, /\/\/ TODO$/);
  assert.equal(entries[1].videoId, 'Mp-5Uy7pZ9E');
});

test('takes the entry title, not the channel title or media:title', () => {
  const entries = parseFeed(fixture('feed-umbracoffee.xml'));
  assert.ok(entries.every((e) => e.title !== 'umbraCoffee'));
});

test('decodes the five XML entities, ampersand last so &amp;lt; stays literal text', () => {
  const xml = `<feed><entry><yt:videoId>x</yt:videoId><title>A &amp; B &#39;c&#39; &quot;d&quot; &lt;e&gt; &amp;lt;</title>
    <published>2026-01-01T00:00:00+00:00</published><media:description>1 &lt; 2 &amp; 3</media:description></entry></feed>`;
  const [entry] = parseFeed(xml);
  assert.equal(entry.title, `A & B 'c' "d" <e> &lt;`);
  assert.equal(entry.description, '1 < 2 & 3');
});

test('a feed with no entries returns an empty list', () => {
  assert.deepEqual(parseFeed('<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>x</title></feed>'), []);
});

test('garbage input throws rather than reporting an empty channel', () => {
  assert.throws(() => parseFeed('<html>Sorry, blocked</html>'), /not an Atom feed/);
  assert.throws(() => parseFeed(''), /not an Atom feed/);
  assert.throws(() => parseFeed(undefined), /not an Atom feed/);
});

test('an entry with no description gets an empty one', () => {
  const [entry] = parseFeed('<feed><entry><yt:videoId>x</yt:videoId><title>t</title><published>2026-01-01T00:00:00+00:00</published></entry></feed>');
  assert.equal(entry.description, '');
});
