import { expect } from '@open-wc/testing';
import { UmbraDesktopSearchEngine, UMBRADESKTOP_SEARCH_TAKE } from './search-engine';
import type { UmbraDesktopSearchItem, UmbraDesktopSearchPaging, UmbraDesktopSearchSource, UmbraDesktopSearchState } from './types';
import type { UmbraDesktopApp } from '../types';

const item = (name: string): UmbraDesktopSearchItem => ({
  key: name,
  name,
  icon: 'icon-document',
  open: { kind: 'entity', entityType: 'document', unique: name, href: `section/content/workspace/document/edit/${name}` },
});

/** A source over a fixed list of names, recording every call. */
function source(alias: string, prominence: 'full' | 'compact', names: string[], weight = 0) {
  const calls: Array<{ query: string; paging: UmbraDesktopSearchPaging }> = [];
  const src: UmbraDesktopSearchSource = {
    alias,
    label: alias,
    weight,
    prominence,
    async search(query, paging) {
      calls.push({ query, paging });
      const hits = names.filter((n) => n.toLowerCase().includes(query.toLowerCase()));
      return { items: hits.slice(paging.skip, paging.skip + paging.take).map(item), total: hits.length };
    },
  };
  return { src, calls };
}

/** An engine with no debounce, collecting every state it reports. */
function engine(debounceMs = 0) {
  const states: UmbraDesktopSearchState[] = [];
  const e = new UmbraDesktopSearchEngine({ nameOf: (a) => a.name, onChange: (s) => states.push(s), debounceMs });
  return { e, states };
}

const until = async (check: () => boolean) => {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(check(), 'condition reached').to.equal(true);
};

it('gives prominent sources full sections and the rest compact ones, each with its first results', async () => {
  const docs = source('docs', 'full', ['Home', 'Homework'], 10);
  const types = source('types', 'compact', [...Array.from({ length: 8 }, (_, i) => `Home ${i}`), 'Other'], 5);
  const { e } = engine();
  e.setSources([types.src, docs.src]);
  e.setQuery('home');
  await until(() => !e.state.pending);
  // Up to 12 for Documents and Media and 6 for the rest: enough to fill a few rows side by side.
  expect(UMBRADESKTOP_SEARCH_TAKE).to.include({ full: 12, compact: 6 });
  expect(e.state.sections.map((s) => [s.source.alias, s.items.map((i) => i.name), s.total])).to.deep.equal([['docs', ['Home', 'Homework'], 2]]);
  expect(e.state.others.map((s) => [s.source.alias, s.items.length, s.total])).to.deep.equal([['types', 6, 8]]);
  expect(docs.calls[0].paging).to.deep.equal({ skip: 0, take: UMBRADESKTOP_SEARCH_TAKE.full });
  expect(types.calls[0].paging).to.deep.equal({ skip: 0, take: UMBRADESKTOP_SEARCH_TAKE.compact });
});

it('orders sections by the source weight, heaviest first', async () => {
  const a = source('a', 'full', ['x'], 1);
  const b = source('b', 'full', ['x'], 9);
  const { e } = engine();
  e.setSources([a.src, b.src]);
  e.setQuery('x');
  await until(() => !e.state.pending);
  expect(e.state.sections.map((s) => s.source.alias)).to.deep.equal(['b', 'a']);
});

it('leaves out a source that found nothing', async () => {
  const docs = source('docs', 'full', ['Other']);
  const { e } = engine();
  e.setSources([docs.src]);
  e.setQuery('home');
  await until(() => !e.state.pending);
  expect(e.state.sections).to.deep.equal([]);
  expect(e.state.others).to.deep.equal([]);
});

it('shows matching apps at once, without waiting for the sources', async () => {
  const docs = source('docs', 'full', ['Log entry']);
  const { e } = engine(30);
  e.setApps([{ alias: 'log', name: 'Log Viewer' } as UmbraDesktopApp]);
  e.setSources([docs.src]);
  e.setQuery('log');
  expect(e.state.query, 'the text is current at once').to.equal('log');
  expect(e.state.apps.map((a) => a.alias), 'and so are the apps').to.deep.equal(['log']);
  expect(e.state.pending, 'while the sources are still to answer').to.equal(true);
  expect(docs.calls, 'which are only asked once typing pauses').to.deep.equal([]);
  await until(() => !e.state.pending);
  expect(e.state.apps.map((a) => a.alias), 'the apps stay').to.deep.equal(['log']);
  expect(e.state.sections.map((s) => s.source.alias)).to.deep.equal(['docs']);
});

it('drops the previous source results while the next ones load, so none is shown beside the wrong text', async () => {
  const docs = source('docs', 'full', ['Home', 'Homework']);
  const types = source('types', 'compact', ['Home type']);
  const { e } = engine(30);
  e.setApps([{ alias: 'home', name: 'Home app' } as UmbraDesktopApp]);
  e.setSources([docs.src, types.src]);
  e.setQuery('home');
  await until(() => !e.state.pending);
  e.setQuery('homew');
  expect(e.state.pending).to.equal(true);
  expect(e.state.query).to.equal('homew');
  expect(e.state.apps, 'no app matches the new text').to.deep.equal([]);
  expect(e.state.sections).to.deep.equal([]);
  expect(e.state.others).to.deep.equal([]);
  await until(() => !e.state.pending);
  expect(e.state.sections[0].items.map((i) => i.name)).to.deep.equal(['Homework']);
});

it('asks nothing again when the text changes only by spaces at its ends', async () => {
  const docs = source('docs', 'full', ['Home']);
  const { e } = engine();
  e.setSources([docs.src]);
  e.setQuery('home');
  await until(() => !e.state.pending);
  e.setQuery('home ');
  expect(e.state.pending, 'the results stay as they are').to.equal(false);
  expect(e.state.sections.map((s) => s.source.alias)).to.deep.equal(['docs']);
  await new Promise((r) => setTimeout(r, 20));
  expect(docs.calls.map((c) => c.query)).to.deep.equal(['home']);
});

it('shows every matching app, however many', async () => {
  const { e } = engine();
  e.setApps(Array.from({ length: 12 }, (_, i) => ({ alias: `a${i}`, name: `Log ${i}` }) as UmbraDesktopApp));
  e.setQuery('log');
  await until(() => !e.state.pending && e.state.query === 'log');
  expect(e.state.apps.length).to.equal(12);
});

it('asks the sources once for a burst of typing, with the last text', async () => {
  const docs = source('docs', 'full', ['Home']);
  const { e } = engine(30);
  e.setSources([docs.src]);
  e.setQuery('h');
  e.setQuery('ho');
  e.setQuery('home');
  await until(() => !e.state.pending);
  expect(docs.calls.map((c) => c.query)).to.deep.equal(['home']);
});

it('treats text of only spaces as empty and asks no source', async () => {
  const docs = source('docs', 'full', ['Home']);
  const { e } = engine();
  e.setSources([docs.src]);
  e.setQuery('   ');
  await new Promise((r) => setTimeout(r, 20));
  expect(docs.calls).to.deep.equal([]);
  expect(e.state.query).to.equal('');
});

it('drops an answer to a query that is no longer current', async () => {
  let release!: () => void;
  const slow: UmbraDesktopSearchSource = {
    alias: 'slow',
    label: 'slow',
    weight: 0,
    prominence: 'full',
    search: (query) =>
      query === 'old'
        ? new Promise((resolve) => (release = () => resolve({ items: [item('stale')], total: 1 })))
        : Promise.resolve({ items: [item('fresh')], total: 1 }),
  };
  const { e } = engine();
  e.setSources([slow]);
  e.setQuery('old');
  await new Promise((r) => setTimeout(r, 10));
  e.setQuery('new');
  await until(() => !e.state.pending);
  release();
  await new Promise((r) => setTimeout(r, 10));
  expect(e.state.sections[0].items.map((i) => i.name)).to.deep.equal(['fresh']);
});

it('reports nothing after it is disposed, such as when the launcher closes mid-search', async () => {
  let release!: () => void;
  const slow: UmbraDesktopSearchSource = {
    alias: 'slow',
    label: 'slow',
    weight: 0,
    prominence: 'full',
    search: () => new Promise((resolve) => (release = () => resolve({ items: [item('late')], total: 1 }))),
  };
  const { e, states } = engine();
  e.setSources([slow]);
  e.setQuery('x');
  await new Promise((r) => setTimeout(r, 10));
  const seen = states.length;
  e.dispose();
  release();
  await new Promise((r) => setTimeout(r, 10));
  expect(states.length).to.equal(seen);
});

it('shows the other sources when one fails', async () => {
  const docs = source('docs', 'full', ['Home']);
  const broken: UmbraDesktopSearchSource = { alias: 'broken', label: 'b', weight: 0, prominence: 'full', search: () => Promise.reject(new Error('500')) };
  const { e } = engine();
  e.setSources([broken, docs.src]);
  e.setQuery('home');
  await until(() => !e.state.pending);
  expect(e.state.sections.map((s) => s.source.alias)).to.deep.equal(['docs']);
});

it('drills into one source a page at a time, and asks no more past the end', async () => {
  const names = Array.from({ length: 25 }, (_, i) => `Home ${i}`);
  const docs = source('docs', 'full', names);
  const { e } = engine();
  e.setSources([docs.src]);
  e.setQuery('home');
  await until(() => !e.state.pending);
  await e.drill('docs');
  expect(e.state.drill?.items.length).to.equal(UMBRADESKTOP_SEARCH_TAKE.page);
  expect(e.state.drill?.total).to.equal(25);
  await e.more();
  expect(e.state.drill?.items.length).to.equal(25);
  const calls = docs.calls.length;
  await e.more();
  expect(docs.calls.length).to.equal(calls);
  e.closeDrill();
  expect(e.state.drill).to.equal(undefined);
  expect(e.state.query).to.equal('home');
});

it('leaves the drilled-down list when the text changes', async () => {
  const docs = source('docs', 'full', ['Home', 'House']);
  const { e } = engine();
  e.setSources([docs.src]);
  e.setQuery('ho');
  await until(() => !e.state.pending);
  await e.drill('docs');
  e.setQuery('hou');
  expect(e.state.drill).to.equal(undefined);
});
