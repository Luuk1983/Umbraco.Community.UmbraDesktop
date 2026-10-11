import { expect } from '@open-wc/testing';
import { UmbraDesktopPackageSettingsStore } from './package-settings-store.js';

/**
 * One package's settings for the signed-in user, kept in one `umbracoUserData` row and held in the
 * page. The rules were Accessories' and are tested here as they were there: the value is undefined
 * until the stored one arrives, a change applies at once and is written in the background, a failed
 * write is kept and reported, a late read does not undo a change, other tabs follow a stored change.
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

/** A value with something in it, so it is told apart from nothing. */
const ON = { screensaver: { enabled: true } };

/** A channel name no other case shares, so two cases' stores never hear each other. */
let channels = 0;
const channel = () => `package-settings-test-${++channels}-${Math.random()}`;

/** Stores made by a case, closed after it. */
let made: UmbraDesktopPackageSettingsStore[] = [];
afterEach(() => {
  for (const store of made) store.close();
  made = [];
});

/**
 * A store over a document, closed after the case.
 * @param document What it reads and writes.
 * @param name The cross-tab channel's name, shared to stand for two tabs.
 */
function store(document: ReturnType<typeof fakeDocument>['document'], name?: string) {
  const subject = new UmbraDesktopPackageSettingsStore(document, name);
  made.push(subject);
  return subject;
}

it('reads the stored value from the account, parsed', async () => {
  const subject = store(fakeDocument(JSON.stringify(ON)).document);
  await subject.load();
  expect([subject.value, subject.loaded]).to.deep.equal([ON, true]);
});

it('is undefined until the stored value has loaded', async () => {
  let open!: () => void;
  const { document, state } = fakeDocument(JSON.stringify(ON));
  state.gate = new Promise((resolve) => (open = resolve));
  const subject = store(document);
  const loading = subject.load();
  expect([subject.value, subject.loaded]).to.deep.equal([undefined, false]);
  open();
  await loading;
  expect(subject.value).to.deep.equal(ON);
});

it('is undefined, with nothing wrong, when nothing is stored', async () => {
  const subject = store(fakeDocument(null).document);
  await subject.load();
  expect([subject.value, subject.status]).to.deep.equal([undefined, undefined]);
});

it('is undefined, with nothing wrong, when what is stored is not JSON', async () => {
  const subject = store(fakeDocument('{not json').document);
  await subject.load();
  expect([subject.value, subject.status]).to.deep.equal([undefined, undefined]);
});

it('says so when the account could not be read, and reads again on the next load', async () => {
  const { document, state } = fakeDocument(JSON.stringify(ON));
  state.failing = true;
  const subject = store(document);
  await subject.load();
  expect([subject.value, subject.status, subject.loaded]).to.deep.equal([undefined, 'unread', false]);
  state.failing = false;
  await subject.load();
  expect([subject.value, subject.status]).to.deep.equal([ON, undefined]);
});

it('tells its subscribers when the stored value arrives', async () => {
  const subject = store(fakeDocument(JSON.stringify(ON)).document);
  const heard: unknown[] = [];
  subject.subscribe((value) => heard.push(value));
  await subject.load();
  expect(heard).to.deep.equal([ON]);
});

it('tells its subscribers once when the read finds nothing stored, so a box can stop waiting', async () => {
  const subject = store(fakeDocument(null).document);
  const heard: boolean[] = [];
  subject.subscribe(() => heard.push(subject.loaded));
  await subject.load();
  expect(heard).to.deep.equal([true]);
});

it('tells its subscribers once when a read that failed succeeds', async () => {
  const { document, state } = fakeDocument(JSON.stringify(ON));
  state.failing = true;
  const subject = store(document);
  await subject.load();
  const heard: unknown[] = [];
  subject.subscribe(() => heard.push([subject.value, subject.status]));
  state.failing = false;
  await subject.load();
  expect(heard).to.deep.equal([[ON, undefined]]);
});

it('applies a change at once, and stores it as JSON', async () => {
  const { document, state } = fakeDocument();
  const subject = store(document);
  await subject.load();
  const heard: unknown[] = [];
  subject.subscribe((value) => heard.push(value));
  subject.set(ON);
  expect(subject.value, 'before the save has answered').to.deep.equal(ON);
  expect(heard).to.deep.equal([ON]);
  await subject.saved();
  expect(state.stored).to.equal(JSON.stringify(ON));
});

it('does not tell its subscribers about a change that leaves the value as it was', async () => {
  const subject = store(fakeDocument(JSON.stringify(ON)).document);
  await subject.load();
  let calls = 0;
  subject.subscribe(() => calls++);
  subject.set({ screensaver: { enabled: true } });
  await subject.saved();
  expect(calls).to.equal(0);
});

it('keeps a change the account refused, says so, and saves it with the next one', async () => {
  const { document, state } = fakeDocument();
  const subject = store(document);
  await subject.load();
  state.failing = true;
  subject.set(ON);
  await subject.saved();
  expect([subject.value, subject.status]).to.deep.equal([ON, 'unsaved']);
  state.failing = false;
  subject.set({ screensaver: { enabled: false } });
  await subject.saved();
  expect([state.stored, subject.status]).to.deep.equal([
    JSON.stringify({ screensaver: { enabled: false } }),
    undefined,
  ]);
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

/**
 * Subscribers are other packages' code. One that throws must not keep the rest from hearing, and
 * must not reject the write loop, which would end it and make `saved()` throw.
 */
it('carries on past a subscriber that throws: the others hear, and the change is still stored', async () => {
  const { document, state } = fakeDocument();
  const subject = store(document);
  await subject.load();
  const errors: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void errors.push(args);
  try {
    const heard: unknown[] = [];
    subject.subscribe(() => {
      throw new Error('a package got it wrong');
    });
    subject.subscribe((value) => heard.push(value));
    subject.set(ON);
    await subject.saved();
    expect(heard, 'the second subscriber').to.deep.equal([ON]);
    expect(state.stored).to.equal(JSON.stringify(ON));
    expect(errors.length, 'reported, once per throw').to.be.greaterThan(0);
    expect(String(errors[0][0])).to.contain('[UmbraDesktop]');
  } finally {
    console.error = original;
  }
});

it('does not let a value that arrives late overwrite a change made meanwhile', async () => {
  let open!: () => void;
  const { document, state } = fakeDocument(JSON.stringify(ON));
  state.gate = new Promise((resolve) => (open = resolve));
  const subject = store(document);
  const loading = subject.load();
  subject.set({ mine: true });
  open();
  await loading;
  await subject.saved();
  expect(subject.value).to.deep.equal({ mine: true });
  expect(state.stored).to.equal(JSON.stringify({ mine: true }));
});

it('writes changes in order, and ends on the last one', async () => {
  const { document, state } = fakeDocument();
  const subject = store(document);
  await subject.load();
  for (const n of [1, 2, 5]) subject.set({ n });
  await subject.saved();
  expect(state.stored).to.equal(JSON.stringify({ n: 5 }));
  expect(state.writes.length, 'no more writes than changes').to.be.at.most(3);
});

it('tells other tabs about a saved change, and not about a refused one', async () => {
  const name = channel();
  const { document, state } = fakeDocument();
  const here = store(document, name);
  const there = store(fakeDocument().document, name);
  await Promise.all([here.load(), there.load()]);
  const arrived = new Promise<unknown>((resolve) => there.subscribe(resolve));
  here.set(ON);
  expect(await arrived).to.deep.equal(ON);

  let heard = false;
  there.subscribe(() => (heard = true));
  state.failing = true;
  here.set({ refused: true });
  await here.saved();
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(heard).to.equal(false);
});
