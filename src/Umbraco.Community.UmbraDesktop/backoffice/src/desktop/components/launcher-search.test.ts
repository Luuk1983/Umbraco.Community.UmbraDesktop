import { expect } from '@open-wc/testing';
import { mountLauncher, stubApp } from './launcher.test-helper.js';
import type { UmbraDesktopLauncherMount } from './launcher.test-helper.js';
import type { UmbraDesktopSearchItem, UmbraDesktopSearchSource } from '../search/types.js';
import type { UmbraDesktopWindow, UmbraDesktopApp } from '../types.js';
import type { UmbraDesktopWorkspaceSubject } from '../dirty-watcher.js';

const KEY = 'aaaaaaaa-1111-2222-3333-444444444444';

const doc = (name: string, unique = name, href: string | undefined = `section/content/workspace/document/edit/${unique}`): UmbraDesktopSearchItem => ({
  key: `document:${unique}`,
  name,
  icon: 'icon-document',
  detail: 'Home › News',
  open: { kind: 'entity', entityType: 'document', unique, href },
});

/** A list of documents, for sources with more than a section shows. */
const many = (n: number) => Array.from({ length: n }, (_, i) => doc(`Home ${i}`, `k${i}`));

/** A source answering every query with the given items. */
const fixed = (alias: string, prominence: 'full' | 'compact', items: UmbraDesktopSearchItem[], weight = 0, total = items.length): UmbraDesktopSearchSource => ({
  alias,
  label: alias,
  weight,
  prominence,
  search: async (_q, paging) => ({ items: items.slice(paging.skip, paging.skip + paging.take), total }),
});

/** Type into the search field the way a person does. */
async function type(mount: UmbraDesktopLauncherMount, text: string) {
  const input = mount.root.querySelector<HTMLInputElement>('.search-input')!;
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  await mount.settle();
}

/** Wait for the sources to answer and the launcher to draw it: a results body that is not pending. */
async function results(mount: UmbraDesktopLauncherMount) {
  for (let i = 0; i < 100 && !mount.root.querySelector('.search-results:not(.pending)'); i++) await new Promise((r) => setTimeout(r, 5));
  await mount.settle();
}

const APPS = [stubApp('Log Viewer'), stubApp('Content editor'), stubApp('Media library')];

async function mount(options: Partial<Parameters<typeof mountLauncher>[0]> = {}) {
  return mountLauncher({ apps: APPS, groups: [], searchDebounceMs: 0, ...options });
}

it('puts the cursor in the search field when it opens', async () => {
  const m = await mount();
  try {
    expect(m.root.activeElement?.classList.contains('search-input')).to.equal(true);
  } finally {
    m.remove();
  }
});

it('replaces the groups with results as soon as there is text, and brings them back when it is cleared', async () => {
  const m = await mount();
  try {
    await type(m, 'log');
    await results(m);
    expect(!!m.root.querySelector('.search-results')).to.equal(true);
    expect(!!m.root.querySelector('.body .card')).to.equal(false);
    await type(m, '');
    expect(!!m.root.querySelector('.search-results')).to.equal(false);
  } finally {
    m.remove();
  }
});

it('keeps the launcher as it is for text of only spaces', async () => {
  const m = await mount();
  try {
    await type(m, '   ');
    expect(!!m.root.querySelector('.search-results')).to.equal(false);
  } finally {
    m.remove();
  }
});

it('keeps the same field while switching, so typing is not interrupted', async () => {
  const m = await mount();
  try {
    const before = m.root.querySelector('.search-input');
    await type(m, 'l');
    expect(m.root.querySelector('.search-input')).to.equal(before);
  } finally {
    m.remove();
  }
});

it('shows apps, then the full sections, then every other source in a compact section of its own', async () => {
  const m = await mount({
    searchSources: [fixed('Documents', 'full', [doc('Home')], 800), fixed('Data Types', 'compact', many(9), 400)],
  });
  try {
    await type(m, 'o');
    await results(m);
    const groups = [...m.root.querySelectorAll<HTMLElement>('.search-results > .result-group')].map((g) => g.dataset.source);
    expect(groups, 'one band per category, stacked').to.deep.equal(['apps', 'Documents', 'Data Types']);
    const types = m.root.querySelector<HTMLElement>('.result-group[data-source="Data Types"]')!;
    expect(types.querySelectorAll('.result').length, 'its first six results').to.equal(6);
    // Unthemed mounts draw term keys rather than English, so the count is not in the text to check.
    expect(!!types.querySelector('.show-all'), 'and a way to the other three').to.equal(true);
    expect(m.root.querySelector('[data-key="document:Home"] .result-detail')?.textContent).to.equal('Home › News');
  } finally {
    m.remove();
  }
});

it('keeps the launcher as it is until the results arrive, then shows apps and sources together', async () => {
  let release!: () => void;
  const slow: UmbraDesktopSearchSource = {
    alias: 'Documents',
    label: 'Documents',
    weight: 0,
    prominence: 'full',
    search: () => new Promise((resolve) => (release = () => resolve({ items: [doc('Log entry', KEY)], total: 1 }))),
  };
  const m = await mount({ groups: [{ alias: 'g', label: 'G', weight: 0 }], apps: [stubApp('Log Viewer', 'g')], searchSources: [slow] });
  try {
    await type(m, 'log');
    await new Promise((r) => setTimeout(r, 20));
    await m.settle();
    expect(!!m.root.querySelector('.search-results'), 'no results body yet').to.equal(false);
    expect(!!m.root.querySelector('.body .card'), 'the groups stay').to.equal(true);
    release();
    await results(m);
    expect(!!m.root.querySelector('[data-key="app:Log Viewer"]'), 'the app').to.equal(true);
    expect(!!m.root.querySelector(`[data-key="document:${KEY}"]`), 'and the document, together').to.equal(true);
  } finally {
    m.remove();
  }
});

it('says so when nothing is found', async () => {
  const m = await mount({ searchSources: [fixed('Documents', 'full', [])] });
  try {
    await type(m, 'zzz');
    await results(m);
    expect(!!m.root.querySelector('.search-results .empty-note')).to.equal(true);
  } finally {
    m.remove();
  }
});

it('launches an app from the results', async () => {
  const m = await mount();
  try {
    await type(m, 'log');
    await results(m);
    m.root.querySelector<HTMLElement>('[data-key="app:Log Viewer"]')!.click();
    expect(m.launched.map((a) => a.alias)).to.deep.equal(['Log Viewer']);
  } finally {
    m.remove();
  }
});

it('opens a content result in an editor-only window', async () => {
  const m = await mount({ searchSources: [fixed('Documents', 'full', [doc('Home', KEY)])] });
  try {
    await type(m, 'home');
    await results(m);
    m.root.querySelector<HTMLElement>(`[data-key="document:${KEY}"]`)!.click();
    const app = m.launched[0] as UmbraDesktopApp;
    expect(app.chromeProfile).to.equal('workspace-only');
    expect(app.name).to.equal('Home');
    expect((app.content as { url: string }).url).to.equal(`/umbraco/section/content/workspace/document/edit/${KEY}`);
  } finally {
    m.remove();
  }
});

it('brings forward a window already showing the result rather than opening another', async () => {
  const content = { id: 'w1', app: { alias: 'content' } } as UmbraDesktopWindow;
  const m = await mount({
    searchSources: [fixed('Documents', 'full', [doc('Home', KEY)])],
    windows: [content],
    subjects: { w1: [{ entityType: 'document', unique: KEY } as UmbraDesktopWorkspaceSubject] },
  });
  try {
    await type(m, 'home');
    await results(m);
    m.root.querySelector<HTMLElement>(`[data-key="document:${KEY}"]`)!.click();
    expect(m.focused).to.deep.equal(['w1']);
    expect(m.launched).to.deep.equal([]);
  } finally {
    m.remove();
  }
});

it('shows a result it cannot open as disabled, and never navigates for it', async () => {
  const m = await mount({ searchSources: [fixed('Things', 'full', [doc('Outside', 'o', 'https://example.com/x'), { ...doc('Nowhere', 'n'), open: { kind: 'entity', entityType: 'document', unique: 'n' } }])] });
  try {
    await type(m, 'o');
    await results(m);
    for (const key of ['document:o', 'document:n']) {
      const row = m.root.querySelector<HTMLButtonElement>(`[data-key="${key}"]`)!;
      expect(row.disabled, key).to.equal(true);
      row.click();
    }
    expect(m.launched).to.deep.equal([]);
  } finally {
    m.remove();
  }
});

it('opens Help on the page a Help result names', async () => {
  const help: UmbraDesktopSearchItem = { key: 'help:x', name: 'Snapping', icon: 'icon-help-alt', open: { kind: 'help', target: 'umbradesktop/snapping' } };
  const m = await mount({ searchSources: [fixed('Help', 'full', [help])] });
  try {
    await type(m, 'snap');
    await results(m);
    m.root.querySelector<HTMLElement>('[data-key="help:x"]')!.click();
    expect(m.helpOpened).to.deep.equal(['umbradesktop/snapping']);
  } finally {
    m.remove();
  }
});

it('closes the launcher after opening anything', async () => {
  const m = await mount();
  try {
    let launched = 0;
    m.launcher.addEventListener('launched', () => launched++);
    await type(m, 'log');
    await results(m);
    m.root.querySelector<HTMLElement>('.result')!.click();
    expect(launched).to.equal(1);
  } finally {
    m.remove();
  }
});

/** Press a key on whatever has focus in the launcher. */
async function press(m: UmbraDesktopLauncherMount, key: string) {
  const target = (m.root.activeElement as HTMLElement) ?? m.launcher;
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true }));
  await m.settle();
}

it('drills into a section with Show all, and Back returns with the text kept', async () => {
  const m = await mount({ apps: [], searchSources: [fixed('Documents', 'full', many(25))] });
  try {
    await type(m, 'home');
    await results(m);
    m.root.querySelector<HTMLElement>('.show-all')!.click();
    await results(m);
    expect(m.root.querySelectorAll('.drill .result').length).to.equal(20);
    m.root.querySelector<HTMLElement>('.drill .ctl.back')!.click();
    await m.settle();
    expect(!!m.root.querySelector('.drill')).to.equal(false);
    expect(m.root.querySelector<HTMLInputElement>('.search-input')!.value).to.equal('home');
  } finally {
    m.remove();
  }
});

it('drills into a compact source with its Show all', async () => {
  const m = await mount({ apps: [], searchSources: [fixed('Data Types', 'compact', many(9))] });
  try {
    await type(m, 'home');
    await results(m);
    m.root.querySelector<HTMLElement>('.result-group[data-source="Data Types"] .show-all')!.click();
    await results(m);
    expect(m.root.querySelectorAll('.drill .result').length).to.equal(9);
  } finally {
    m.remove();
  }
});

it('loads the next page with Show more, and offers no more at the end', async () => {
  const m = await mount({ apps: [], searchSources: [fixed('Documents', 'full', many(25))] });
  try {
    await type(m, 'home');
    await results(m);
    m.root.querySelector<HTMLElement>('.show-all')!.click();
    await results(m);
    m.root.querySelector<HTMLElement>('.more')!.click();
    await results(m);
    expect(m.root.querySelectorAll('.drill .result').length).to.equal(25);
    expect(!!m.root.querySelector('.more')).to.equal(false);
  } finally {
    m.remove();
  }
});

it('opens the first result with Enter in the field', async () => {
  const m = await mount();
  try {
    await type(m, 'log');
    await results(m);
    await press(m, 'Enter');
    expect(m.launched.map((a) => a.alias)).to.deep.equal(['Log Viewer']);
  } finally {
    m.remove();
  }
});

it('moves through results with the arrow keys, and back up to the field', async () => {
  const m = await mount({ searchSources: [fixed('Documents', 'full', [doc('Log entry', KEY)])] });
  try {
    await type(m, 'log');
    await results(m);
    await press(m, 'ArrowDown');
    expect((m.root.activeElement as HTMLElement).dataset.key).to.equal('app:Log Viewer');
    await press(m, 'ArrowDown');
    expect((m.root.activeElement as HTMLElement).dataset.key).to.equal(`document:${KEY}`);
    await press(m, 'ArrowUp');
    await press(m, 'ArrowUp');
    expect(m.root.activeElement?.classList.contains('search-input')).to.equal(true);
  } finally {
    m.remove();
  }
});

it('clears the text with Escape, back to the launcher, and lets the next Escape through', async () => {
  const m = await mount();
  /** Counts the Escapes that reach the document, removed afterwards so it cannot leak into later tests. */
  let count: ((e: KeyboardEvent) => void) | undefined;
  try {
    await type(m, 'log');
    await results(m);
    let escaped = 0;
    count = (e: KeyboardEvent) => {
      if (e.key === 'Escape') escaped++;
    };
    document.addEventListener('keydown', count);
    await press(m, 'Escape');
    expect(m.root.querySelector<HTMLInputElement>('.search-input')!.value).to.equal('');
    expect(!!m.root.querySelector('.search-results')).to.equal(false);
    expect(escaped, 'the first Escape stops at the field').to.equal(0);
    await press(m, 'Escape');
    expect(escaped, 'the second reaches the taskbar').to.equal(1);
  } finally {
    if (count) document.removeEventListener('keydown', count);
    m.remove();
  }
});

it('goes back from a drilled-down list with Escape before clearing anything', async () => {
  const m = await mount({ apps: [], searchSources: [fixed('Documents', 'full', many(15))] });
  try {
    await type(m, 'home');
    await results(m);
    m.root.querySelector<HTMLElement>('.show-all')!.click();
    await results(m);
    m.root.querySelector<HTMLInputElement>('.search-input')!.focus();
    await press(m, 'Escape');
    expect(!!m.root.querySelector('.drill')).to.equal(false);
    expect(m.root.querySelector<HTMLInputElement>('.search-input')!.value).to.equal('home');
  } finally {
    m.remove();
  }
});

it('steps back through back(), as the taskbar asks on Escape from a result row', async () => {
  const m = await mount();
  try {
    await type(m, 'log');
    await results(m);
    expect(m.launcher.back()).to.equal(true);
    await m.settle();
    expect(!!m.root.querySelector('.search-results')).to.equal(false);
    // Cleared as well, or the field would still say "log" over a launcher showing no results for it.
    expect(m.root.querySelector<HTMLInputElement>('.search-input')!.value).to.equal('');
    expect(m.launcher.back()).to.equal(false);
  } finally {
    m.remove();
  }
});

it('keeps loading while the end of a drilled-down list is already in view, without any scrolling', async () => {
  // A stand-in for the browser's observer that reports the button in view each time it starts
  // watching, as a real one does for a visible element, so a short list in a tall panel can be
  // shown without depending on rendering: a background tab, which is what CI runs tests in, never
  // fires a real observer at all.
  const real = window.IntersectionObserver;
  window.IntersectionObserver = class {
    /** @param callback Told the target is in view. */
    constructor(private callback: IntersectionObserverCallback) {}
    /** @param target Reported as in view, once, as the browser's first report would. */
    observe(target: Element) {
      queueMicrotask(() => this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as never));
    }
    /** Nothing to stop. */
    disconnect() {}
  } as never;
  const m = await mount({ apps: [], searchSources: [fixed('Documents', 'full', many(45))] });
  try {
    await type(m, 'home');
    await results(m);
    m.root.querySelector<HTMLElement>('.show-all')!.click();
    for (let i = 0; i < 100 && m.root.querySelectorAll('.drill .result').length < 45; i++) await new Promise((r) => setTimeout(r, 10));
    expect(m.root.querySelectorAll('.drill .result').length).to.equal(45);
  } finally {
    window.IntersectionObserver = real;
    m.remove();
  }
});

for (const [control, label] of [['.ctl.all-apps', 'All apps'], ['.ctl.arrange', 'Arrange']] as const) {
  it(`searches again after a round trip through ${label}`, async () => {
    const m = await mount();
    try {
      await type(m, 'log');
      await results(m);
      m.root.querySelector<HTMLElement>(control)!.click();
      await m.settle();
      expect(m.launcher.back()).to.equal(true);
      await m.settle();
      await type(m, 'logs');
      await results(m);
      expect(!!m.root.querySelector('.search-results'), 'typing searches again').to.equal(true);
    } finally {
      m.remove();
    }
  });
}

it('moves from the field to the first result, not to the Show all beside its heading', async () => {
  const m = await mount({ apps: [], searchSources: [fixed('Documents', 'full', many(15))] });
  try {
    await type(m, 'home');
    await results(m);
    await press(m, 'ArrowDown');
    expect((m.root.activeElement as HTMLElement).dataset.key).to.equal('document:k0');
  } finally {
    m.remove();
  }
});
