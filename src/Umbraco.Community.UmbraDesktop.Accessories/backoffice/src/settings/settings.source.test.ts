import { expect } from '@open-wc/testing';
import { AccessoriesSettingsStore } from './settings.source.js';
import { UMBRADESKTOP_ACCESSORIES_DEFAULT_SETTINGS, serializeSettings } from './settings.js';
import type { AccessoriesSettings } from './settings.js';

/**
 * The package's settings as they are kept: in the signed-in user's account, through one
 * `umbracoUserData` document, so a screensaver chosen in one browser is the one they get in any
 * other. The store in front of it holds the value the page uses, which is the default until the
 * stored one has arrived, and tells every element in the page, and other tabs, when it changes.
 */

/** A stored document the test controls: what it holds, whether it answers, and when. */
function fakeDocument(stored: string | null = null) {
  const state = {
    stored,
    failing: false,
    writes: [] as string[],
    /** When set, a read waits for this before it answers, so a test can act while it is loading. */
    gate: undefined as Promise<void> | undefined,
  };
  const document = {
    async read(): Promise<string | null | undefined> {
      if (state.gate) await state.gate;
      return state.failing ? undefined : state.stored;
    },
    async write(value: string): Promise<boolean> {
      state.writes.push(value);
      if (state.failing) return false;
      state.stored = value;
      return true;
    },
  };
  return { document, state };
}

/** Settings with the screensaver switched on, which the default is not. */
const ON: AccessoriesSettings = { screensaver: { enabled: true, saver: 'mystify', waitMinutes: 5 } };

/** A channel name no other case shares, so two cases' stores never hear each other. */
let channels = 0;
const channel = () => `accessories-settings-test-${++channels}-${Math.random()}`;

/** Stores made by a case, closed after it. */
let made: AccessoriesSettingsStore[] = [];
afterEach(() => {
  for (const store of made) store.close();
  made = [];
});

/**
 * A store over a document, closed after the case.
 * @param document What it reads and writes.
 * @param name The cross-tab channel's name, shared to stand for two tabs.
 */
function store(document: ReturnType<typeof fakeDocument>['document'], name?: string): AccessoriesSettingsStore {
  const subject = new AccessoriesSettingsStore(document, name);
  made.push(subject);
  return subject;
}

it('reads the stored settings from the account', async () => {
  const { document } = fakeDocument(serializeSettings(ON));
  const subject = store(document);
  await subject.load();
  expect(subject.value).to.deep.equal(ON);
});

/**
 * Until the stored settings have arrived the value is the default, and the default has the
 * screensaver off, so the idle watcher reading it in that window starts nothing.
 */
it('is the default, screensaver off, until the stored settings have loaded', async () => {
  let open!: () => void;
  const { document, state } = fakeDocument(serializeSettings(ON));
  state.gate = new Promise((resolve) => (open = resolve));
  const subject = store(document);
  const loading = subject.load();
  expect(subject.value).to.deep.equal(UMBRADESKTOP_ACCESSORIES_DEFAULT_SETTINGS);
  expect(subject.value.screensaver.enabled).to.equal(false);
  open();
  await loading;
  expect(subject.value.screensaver.enabled).to.equal(true);
});

it('tells its subscribers when the stored settings arrive', async () => {
  const { document } = fakeDocument(serializeSettings(ON));
  const subject = store(document);
  const heard: AccessoriesSettings[] = [];
  subject.subscribe((value) => heard.push(value));
  await subject.load();
  expect(heard).to.deep.equal([ON]);
});

it('keeps the default when nothing is stored yet, and says nothing is wrong', async () => {
  const { document } = fakeDocument(null);
  const subject = store(document);
  await subject.load();
  expect([subject.value, subject.status]).to.deep.equal([UMBRADESKTOP_ACCESSORIES_DEFAULT_SETTINGS, undefined]);
});

it('says so when the account could not be read, and keeps the default', async () => {
  const { document, state } = fakeDocument(serializeSettings(ON));
  state.failing = true;
  const subject = store(document);
  await subject.load();
  expect([subject.value, subject.status]).to.deep.equal([UMBRADESKTOP_ACCESSORIES_DEFAULT_SETTINGS, 'unread']);
});

it('reads again on the next load after one that failed', async () => {
  const { document, state } = fakeDocument(serializeSettings(ON));
  state.failing = true;
  const subject = store(document);
  await subject.load();
  state.failing = false;
  await subject.load();
  expect([subject.value, subject.status]).to.deep.equal([ON, undefined]);
});

/** A change shows at once in the page, and reaches the account behind it. */
it('applies a change at once, and stores it in the account', async () => {
  const { document, state } = fakeDocument();
  const subject = store(document);
  await subject.load();
  const heard: AccessoriesSettings[] = [];
  subject.subscribe((value) => heard.push(value));
  subject.set(ON);
  expect(subject.value, 'before the save has answered').to.deep.equal(ON);
  expect(heard).to.deep.equal([ON]);
  await subject.saved();
  expect(state.stored).to.equal(serializeSettings(ON));
});

/**
 * A save that fails keeps the choice in the page and says it was not saved, rather than losing it
 * or pretending. The next change saves the whole value again.
 */
it('keeps a change the account refused, says so, and saves it with the next one', async () => {
  const { document, state } = fakeDocument();
  const subject = store(document);
  await subject.load();
  state.failing = true;
  subject.set(ON);
  await subject.saved();
  expect([subject.value, subject.status]).to.deep.equal([ON, 'unsaved']);
  state.failing = false;
  const next = { screensaver: { ...ON.screensaver, waitMinutes: 10 } };
  subject.set(next);
  await subject.saved();
  expect([state.stored, subject.status]).to.deep.equal([serializeSettings(next), undefined]);
});

it('tells its subscribers when a save fails, so a window can say so', async () => {
  const { document, state } = fakeDocument();
  const subject = store(document);
  await subject.load();
  state.failing = true;
  let calls = 0;
  subject.subscribe(() => calls++);
  subject.set(ON);
  await subject.saved();
  expect(calls, 'once for the change, once for the failure').to.equal(2);
});

/** A change made while the stored settings were still on their way is newer than they are. */
it('does not let settings that arrive late overwrite a change made meanwhile', async () => {
  let open!: () => void;
  const { document, state } = fakeDocument(serializeSettings(ON));
  state.gate = new Promise((resolve) => (open = resolve));
  const subject = store(document);
  const loading = subject.load();
  const mine = { screensaver: { enabled: false, saver: 'flying', waitMinutes: 2 } } as const;
  subject.set(mine);
  open();
  await loading;
  await subject.saved();
  expect(subject.value).to.deep.equal(mine);
  expect(state.stored).to.equal(serializeSettings(mine));
});

/** Several quick changes are written one after another, and the account ends on the last. */
it('writes changes in order, and ends on the last one', async () => {
  const { document, state } = fakeDocument();
  const subject = store(document);
  await subject.load();
  for (const waitMinutes of [1, 2, 5]) subject.set({ screensaver: { ...ON.screensaver, waitMinutes } });
  await subject.saved();
  expect(state.stored).to.equal(serializeSettings({ screensaver: { ...ON.screensaver, waitMinutes: 5 } }));
  expect(state.writes.length, 'no more writes than changes').to.be.at.most(3);
});

/**
 * Another tab of the same browser hears a saved change and follows it, as it did when the
 * settings lived in `localStorage`. Two stores on one channel name stand for the two tabs.
 */
it('tells other tabs of the same browser about a saved change', async () => {
  const name = channel();
  const { document } = fakeDocument();
  const here = store(document, name);
  const there = store(fakeDocument().document, name);
  await Promise.all([here.load(), there.load()]);
  const arrived = new Promise<AccessoriesSettings>((resolve) => there.subscribe(resolve));
  here.set(ON);
  expect(await arrived).to.deep.equal(ON);
});

it('does not tell other tabs about a change the account refused', async () => {
  const name = channel();
  const { document, state } = fakeDocument();
  const here = store(document, name);
  const there = store(fakeDocument().document, name);
  await Promise.all([here.load(), there.load()]);
  let heard = false;
  there.subscribe(() => (heard = true));
  state.failing = true;
  here.set(ON);
  await here.saved();
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(heard).to.equal(false);
});
