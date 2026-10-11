import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateResults, applyDetails } from '../src/apply-details.mjs';
import { sourceHash } from '../src/build.mjs';

const NOW = new Date('2026-10-01T09:00:00Z');
const sources = [
  { videoId: 'a', title: 'A', published: '2026-09-01T00:00:00Z', description: 'desc a' },
  { videoId: 'b', title: 'B', published: '2026-08-01T00:00:00Z', description: 'desc b' },
  { videoId: 'c', title: 'C', published: '2026-07-01T00:00:00Z', description: 'desc c' },
];
const known = new Set(sources.map((s) => s.videoId));
const result = (videoId, fields = {}) => ({
  videoId,
  summary: `About ${videoId}.`,
  guests: [{ name: 'Jane Doe', affiliation: 'Perplex' }],
  guestsUnnamed: false,
  uncertain: false,
  uncertainReason: null,
  ...fields,
});

/** A data folder with sources.json and, optionally, details.json and overrides.json. */
function dataDir({ details, overrides } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'uc-apply-'));
  writeFileSync(join(dir, 'sources.json'), JSON.stringify({ version: 1, generatedAt: '2026-09-30T00:00:00Z', episodes: sources }));
  if (details) writeFileSync(join(dir, 'details.json'), JSON.stringify(details));
  if (overrides) writeFileSync(join(dir, 'overrides.json'), JSON.stringify(overrides));
  return dir;
}

test('validateResults accepts the prompt shape plus videoId', () => {
  assert.deepEqual(validateResults([result('a'), result('b', { guests: [], guestsUnnamed: true, uncertain: true, uncertainReason: 'no topics' })], known), []);
});

test('validateResults names every bad entry and what is wrong with it', () => {
  const errors = validateResults([
    result('a'),
    result('zzz'),
    result('b', { summary: 3 }),
    { ...result('c'), extra: 1 },
    (() => { const r = result('c'); delete r.uncertain; return r; })(),
    result('a', { guests: [{ name: '', affiliation: null }] }),
    result('b', { guests: [{ name: 'X', affiliation: 5 }] }),
    result('b', { guests: [{ name: 'X', affiliation: null, role: 'host' }] }),
    result('c', { guestsUnnamed: 'no' }),
    result('c', { uncertainReason: 4 }),
    'not an object',
  ], known);
  const text = errors.join('\n');
  assert.match(text, /entry 2 \(zzz\).*not in sources\.json/);
  assert.match(text, /entry 3 \(b\).*summary/);
  assert.match(text, /entry 4 \(c\).*unexpected key "extra"/);
  assert.match(text, /entry 5 \(c\).*missing key "uncertain"/);
  assert.match(text, /entry 6 \(a\).*guests\[0\]\.name/);
  assert.match(text, /entry 7 \(b\).*guests\[0\]\.affiliation/);
  assert.match(text, /entry 8 \(b\).*guests\[0\].*unexpected key "role"/);
  assert.match(text, /entry 9 \(c\).*guestsUnnamed/);
  assert.match(text, /entry 10 \(c\).*uncertainReason/);
  assert.match(text, /entry 11\b.*not an object/);
  assert.doesNotMatch(text, /entry 1 /);
});

test('validateResults refuses a duplicate videoId and a file that is not an array', () => {
  assert.match(validateResults([result('a'), result('a')], known).join('\n'), /entry 2 \(a\).*more than once/);
  assert.match(validateResults({ a: result('a') }, known).join('\n'), /array/);
});

test('validateResults holds uncertain and its reason to the prompt rules', () => {
  const errors = validateResults([
    result('a', { uncertain: true, uncertainReason: null }),
    result('b', { uncertain: false, uncertainReason: 'why' }),
  ], known).join('\n');
  assert.match(errors, /entry 1 \(a\).*uncertainReason/);
  assert.match(errors, /entry 2 \(b\).*uncertainReason/);
});

// Real descriptions do this: "joined by Jane Doe, plus the Warsaw masterclass participants". So
// unnamed guests sit beside named ones, and `guestsUnnamed` means "there are guests not named".
test('validateResults accepts named guests beside unnamed ones', () => {
  const named = [{ name: 'Jane Doe', affiliation: null }];
  assert.deepEqual(validateResults([result('c', { guests: named, guestsUnnamed: true })], known), []);
});

test('a bad file is refused whole and nothing is written', () => {
  const dir = dataDir();
  writeFileSync(join(dir, 'results.json'), JSON.stringify([result('a'), result('nope')]));
  assert.throws(() => applyDetails({ dir, resultsPath: join(dir, 'results.json'), now: NOW }), /nope/);
  assert.equal(existsSync(join(dir, 'details.json')), false);
  assert.equal(existsSync(join(dir, 'episodes.json')), false);
  rmSync(dir, { recursive: true });
});

test('applyDetails stamps the current sourceHash, merges and rebuilds episodes.json', () => {
  const old = { summary: 'Old b.', guests: [], guestsUnnamed: false, uncertain: false, uncertainReason: null, sourceHash: 'ffffffffffffffff' };
  const keep = { summary: 'Kept c.', guests: [], guestsUnnamed: false, uncertain: false, uncertainReason: null, sourceHash: sourceHash('C', 'desc c') };
  const overrides = { version: 1, guestNames: { 'Jane Doe': 'Jane A. Doe' }, episodes: { a: { summary: 'Owner wins.' } } };
  const dir = dataDir({ details: { version: 1, episodes: { b: old, c: keep } }, overrides });
  const overridesBytes = readFileSync(join(dir, 'overrides.json'), 'utf8');
  const overridesTime = statSync(join(dir, 'overrides.json')).mtimeMs;
  writeFileSync(join(dir, 'results.json'), JSON.stringify([result('a'), result('b')]));

  const counts = applyDetails({ dir, resultsPath: join(dir, 'results.json'), now: NOW });
  assert.deepEqual(counts, { applied: 2, added: 1, redone: 1, pending: 0, episodesChanged: true });

  const details = JSON.parse(readFileSync(join(dir, 'details.json'), 'utf8'));
  assert.equal(details.version, 1);
  assert.deepEqual(details.episodes.a, {
    summary: 'About a.', guests: [{ name: 'Jane Doe', affiliation: 'Perplex' }], guestsUnnamed: false,
    uncertain: false, uncertainReason: null, sourceHash: sourceHash('A', 'desc a'),
  });
  assert.equal(details.episodes.b.summary, 'About b.');
  assert.equal(details.episodes.b.sourceHash, sourceHash('B', 'desc b'));
  assert.deepEqual(details.episodes.c, keep, 'an entry not in the results is untouched');

  const episodes = JSON.parse(readFileSync(join(dir, 'episodes.json'), 'utf8'));
  assert.equal(episodes.version, 2);
  assert.equal(episodes.episodes[0].summary, 'Owner wins.');
  assert.deepEqual(episodes.episodes[1].guests, [{ name: 'Jane A. Doe', affiliation: 'Perplex' }]);
  assert.equal(readFileSync(join(dir, 'overrides.json'), 'utf8'), overridesBytes, 'overrides.json is never written');
  assert.equal(statSync(join(dir, 'overrides.json')).mtimeMs, overridesTime);
  rmSync(dir, { recursive: true });
});

test('applyDetails reports what is still to do', () => {
  const dir = dataDir();
  writeFileSync(join(dir, 'results.json'), JSON.stringify([result('a')]));
  const counts = applyDetails({ dir, resultsPath: join(dir, 'results.json'), now: NOW });
  assert.equal(counts.added, 1);
  assert.equal(counts.pending, 2);
  rmSync(dir, { recursive: true });
});
