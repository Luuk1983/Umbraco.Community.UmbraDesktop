import { expect } from '@open-wc/testing';
import { createConsole, installConsole } from './console.js';
import { REMINDED_STORAGE_KEY } from './reminder-record.js';
import { answer, clock, feedOf, MINUTE, T0, testStore, timers } from './test-support.js';

/**
 * The console commands are how a person, and a browser test, make the feed say what it cannot be
 * made to say on demand. Each case runs them over a test store and a hand-driven clock, and checks
 * what the store then holds, since that is what the schedule, the window, the cup and the reminders
 * all read.
 */

/**
 * A store already holding a normal answer, a clock at {@link T0}, and the console over both.
 * @returns The parts.
 */
async function setup() {
  const time = clock();
  const env = timers(time);
  let realCalls = 0;
  const store = testStore(async () => {
    realCalls++;
    return feedOf(answer(), time.now());
  }, env);
  store.subscribe(() => {});
  await store.settled;
  const stored = new Map<string, string>([[REMINDED_STORAGE_KEY, '["x:soon"]']]);
  const storage = {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => void stored.set(k, v),
    removeItem: (k: string) => void stored.delete(k),
  };
  const commands = createConsole(store, { now: () => time.now(), storage: () => storage });
  return { time, env, store, commands, stored, realCalls: () => realCalls };
}

describe('console commands', () => {
  it('simulates an episode starting in the given minutes, fresh and online, keeping the episode list', async () => {
    const { store, commands } = await setup();
    const before = store.value!.episodes.length;
    commands.simulate('upcoming', 8);
    await store.settled;
    const data = store.value!;
    expect(data.offline).to.equal(false);
    expect(data.current?.state).to.equal('upcoming');
    expect(Date.parse(data.current!.scheduledStart!)).to.equal(T0 + 8 * MINUTE);
    expect(data.currentUpdatedAt, 'stamped now, so the schedule trusts it').to.equal(T0);
    expect(data.episodes.length).to.equal(before);
  });

  it('keeps the start fixed while time passes, and restamps the file on every poll', async () => {
    const { store, commands, time, env } = await setup();
    commands.simulate('upcoming', 8);
    await store.settled;
    time.advance(5 * MINUTE);
    env.fire();
    await store.settled;
    expect(Date.parse(store.value!.current!.scheduledStart!), 'the start does not move with the clock').to.equal(T0 + 8 * MINUTE);
    expect(store.value!.currentUpdatedAt).to.equal(T0 + 5 * MINUTE);
  });

  it('gives every simulated episode its own id, so its reminders show even after an earlier one', async () => {
    const { store, commands, time } = await setup();
    commands.simulate('upcoming', 8);
    await store.settled;
    const first = store.value!.current!.videoId;
    time.advance(1000);
    commands.simulate('upcoming', 8);
    await store.settled;
    expect(store.value!.current!.videoId).to.not.equal(first);
  });

  it('simulates live, nothing coming up, and the feed unreachable', async () => {
    const { store, commands } = await setup();
    commands.simulate('live');
    await store.settled;
    expect(store.value!.current?.state).to.equal('live');
    commands.simulate('none');
    await store.settled;
    expect(store.value!.current ?? null).to.equal(null);
    expect(store.value!.offline).to.equal(false);
    commands.simulate('offline');
    await store.settled;
    expect(store.value!.offline).to.equal(true);
  });

  /*
   * A real video id lets a person see a real player and a real live chat in the window: the
   * simulated id is no video at all, so the chat showed YouTube's error page (owner, 2026-10-11).
   */
  it('uses a real video id when given one, for live and for upcoming', async () => {
    const { store, commands } = await setup();
    commands.simulate('live', 'jfKfPfyJRdk');
    await store.settled;
    expect(store.value!.current?.videoId).to.equal('jfKfPfyJRdk');
    commands.simulate('upcoming', 8, 'abcdefghijk');
    await store.settled;
    expect(store.value!.current?.videoId).to.equal('abcdefghijk');
    expect(Date.parse(store.value!.current!.scheduledStart!)).to.equal(T0 + 8 * MINUTE);
  });

  it('refuses a state it does not know, changing nothing, and says which ones it knows', async () => {
    const { store, commands } = await setup();
    const message = commands.simulate('soon' as never);
    await store.settled;
    expect(message).to.match(/upcoming.*live.*none.*offline/);
    expect(store.value!.current ?? null).to.equal(null);
  });

  it('goes back to the real feed on reset', async () => {
    const { store, commands, realCalls } = await setup();
    commands.simulate('live');
    await store.settled;
    const calls = realCalls();
    commands.reset();
    await store.settled;
    expect(realCalls()).to.equal(calls + 1);
    expect(store.value!.current ?? null).to.equal(null);
  });

  it('forgets which reminders were shown', async () => {
    const { commands, stored } = await setup();
    commands.forgetReminders();
    expect(stored.has(REMINDED_STORAGE_KEY)).to.equal(false);
  });

  it('reports what the app believes now', async () => {
    const { store, commands } = await setup();
    commands.simulate('upcoming', 8);
    await store.settled;
    const status = commands.status();
    expect(status.simulating).to.equal('upcoming');
    expect(status.offline).to.equal(false);
    expect(status.current?.state).to.equal('upcoming');
    expect(status.episodes).to.equal(store.value!.episodes.length);
  });

  it('is on the page as soon as the tray cup or the window is loaded', async () => {
    delete (globalThis as { umbraCoffee?: unknown }).umbraCoffee;
    await import('./tray-cup.element.js');
    await import('./umbracoffee.element.js');
    expect(typeof (globalThis as { umbraCoffee?: { help?: unknown } }).umbraCoffee?.help).to.equal('function');
  });

  it('installs itself once as umbraCoffee, with help that names every command', async () => {
    const { store } = await setup();
    const target: Record<string, unknown> = {};
    installConsole(target, store);
    const first = target.umbraCoffee;
    installConsole(target, store);
    expect(target.umbraCoffee, 'a second install keeps the first').to.equal(first);
    const help = (first as ReturnType<typeof createConsole>).help();
    for (const name of ['simulate', 'reset', 'forgetReminders', 'status']) expect(help).to.contain(name);
  });
});
