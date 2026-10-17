import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { report, formatReport } from '../src/report.mjs';
import { respond } from './helpers.mjs';

/** Descriptions that must never reach the output: each is distinctive enough to find in it. */
const OURS_B = 'Stored text of episode B, quite old.';
const THEIRS_A = 'YouTube text of episode A, written later.';
const THEIRS_B = 'YouTube text of episode B, edited since.';

/** A sources.json with one episode per case the report has to tell apart. */
const SOURCES = {
  version: 1,
  generatedAt: '2026-10-01T00:00:00Z',
  episodes: [
    { videoId: 'AAAAAAAAAAA', title: 'Special A', published: '2026-09-01T00:00:00Z', description: '' },
    { videoId: 'BBBBBBBBBBB', title: 'Episode B', published: '2026-08-01T00:00:00Z', description: OURS_B },
    { videoId: 'CCCCCCCCCCC', title: 'Episode C', published: '2026-07-01T00:00:00Z', description: 'Same\ntext.' },
    { videoId: 'DDDDDDDDDDD', title: 'Special D', published: '2026-06-01T00:00:00Z', description: '' },
    { videoId: 'EEEEEEEEEEE', title: 'Gone E', published: '2026-05-01T00:00:00Z', description: 'Was here.' },
  ],
};

/** What `videos.list` says about the same videos. E is gone, so YouTube does not answer for it. */
const YOUTUBE = {
  AAAAAAAAAAA: THEIRS_A,
  BBBBBBBBBBB: THEIRS_B,
  CCCCCCCCCCC: 'Same \r\n text.',
  DDDDDDDDDDD: '',
};

/** A fake `videos.list` over {@link YOUTUBE}, recording each batch of ids it was asked for. */
function youtube() {
  const batches = [];
  const fetchImpl = async (url) => {
    const ids = new URL(url).searchParams.get('id').split(',');
    batches.push(ids);
    const items = ids.filter((id) => id in YOUTUBE).map((id) => ({ id, snippet: { title: `umbraCoffee - ${id}`, description: YOUTUBE[id] } }));
    return respond(200, JSON.stringify({ items }));
  };
  return { fetchImpl, batches };
}

/** A data folder holding only {@link SOURCES}. */
function folder() {
  const dir = mkdtempSync(join(tmpdir(), 'uc-report-test-'));
  writeFileSync(join(dir, 'sources.json'), JSON.stringify(SOURCES, null, 2) + '\n');
  return dir;
}

test('the report lists episodes with no description here that YouTube has one for, and ones whose description differs', async () => {
  const dir = folder();
  const { fetchImpl, batches } = youtube();
  const result = await report({ dir, apiKey: 'K', fetchImpl });
  assert.deepEqual(batches, [SOURCES.episodes.map((e) => e.videoId)], 'one call for five ids');
  assert.deepEqual(result.missing, [{ videoId: 'AAAAAAAAAAA', title: 'Special A' }]);
  assert.deepEqual(result.differs, [{ videoId: 'BBBBBBBBBBB', title: 'Episode B' }]);
  rmSync(dir, { recursive: true });
});

test('the report prints id, title and link, and never a description', async () => {
  const dir = folder();
  const text = formatReport(await report({ dir, apiKey: 'K', fetchImpl: youtube().fetchImpl }));
  assert.match(text, /AAAAAAAAAAA\s+Special A\s+https:\/\/www\.youtube\.com\/watch\?v=AAAAAAAAAAA/);
  assert.match(text, /BBBBBBBBBBB\s+Episode B\s+https:\/\/www\.youtube\.com\/watch\?v=BBBBBBBBBBB/);
  assert.ok(text.indexOf('AAAAAAAAAAA') < text.indexOf('BBBBBBBBBBB'), 'the lists come in the order the design gives them');
  for (const description of [OURS_B, THEIRS_A, THEIRS_B, 'Same', 'Was here']) {
    assert.ok(!text.includes(description), `the output contains description text: ${description}`);
  }
  for (const id of ['CCCCCCCCCCC', 'DDDDDDDDDDD', 'EEEEEEEEEEE']) assert.ok(!text.includes(id), `${id} should be in neither list`);
  rmSync(dir, { recursive: true });
});

test('a backfilled description is not flagged for what the watch-page scrape did to it, but an added word is', async () => {
  // As measured on 2026-10-17: the scrape dropped list markers, showed a social link as "/ handle"
  // and a video link as that video's title. YouTube's text has the markers and the raw links.
  const scraped = 'Topics:\nPost-Codegarden Blues\nGuest: Owain Williams ( / owaincodes )\nUnboxing Umbraco 16: goodbye TinyMCE\nSee ya';
  const original = 'Topics:\n- Post-Codegarden Blues\n- Guest: Owain Williams (https://twitter.com/OwainCodes)\n- https://www.youtube.com/watch?v=abc\nSee ya';
  const edited = original.replace('See ya', 'See ya in July');
  const dir = mkdtempSync(join(tmpdir(), 'uc-report-test-'));
  const episodes = [
    { videoId: 'SCRAPED0001', title: 'Scraped', published: '2025-06-27T00:00:00Z', description: scraped },
    { videoId: 'EDITED00001', title: 'Edited', published: '2025-05-30T00:00:00Z', description: scraped },
  ];
  writeFileSync(join(dir, 'sources.json'), JSON.stringify({ version: 1, generatedAt: '2026-10-01T00:00:00Z', episodes }));
  const theirs = { SCRAPED0001: original, EDITED00001: edited };
  const fetchImpl = async (url) => {
    const ids = new URL(url).searchParams.get('id').split(',');
    return respond(200, JSON.stringify({ items: ids.map((id) => ({ id, snippet: { title: id, description: theirs[id] } })) }));
  };
  const result = await report({ dir, apiKey: 'K', fetchImpl });
  assert.deepEqual(result.differs.map((e) => e.videoId), ['EDITED00001']);
  assert.deepEqual(result.missing, []);
  rmSync(dir, { recursive: true });
});

test('an empty list says so instead of printing nothing', () => {
  const text = formatReport({ missing: [], differs: [] });
  assert.equal((text.match(/none/g) ?? []).length, 2);
});

test('the report writes nothing', async () => {
  const dir = folder();
  const before = readdirSync(dir).map((f) => [f, readFileSync(join(dir, f), 'utf8')]);
  await report({ dir, apiKey: 'K', fetchImpl: youtube().fetchImpl });
  assert.deepEqual(readdirSync(dir).map((f) => [f, readFileSync(join(dir, f), 'utf8')]), before);
  rmSync(dir, { recursive: true });
});
