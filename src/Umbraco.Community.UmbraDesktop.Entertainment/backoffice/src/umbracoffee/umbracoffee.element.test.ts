import { expect, waitUntil } from '@open-wc/testing';
import './umbracoffee.element.js';
import en from '../localization/en.js';
import { ENGINE_EVENTS } from '../media-player/engine.js';
import { FakeEngine } from '../media-player/test-support.js';
import {
  UMBRACOFFEE_CONTENT_SIZE,
  UMBRACOFFEE_INFO_HEIGHT,
  UMBRACOFFEE_INFO_MIN_HEIGHT,
  UMBRACOFFEE_INFO_RESERVED_HEIGHT,
  UMBRACOFFEE_LIST_MIN_HEIGHT,
  UMBRACOFFEE_MIN_CONTENT_SIZE,
  UMBRACOFFEE_MIN_PLAYER_WIDTH,
  UMBRACOFFEE_NARROW_INFO_HEIGHT,
  UMBRACOFFEE_NARROW_SIDE_TOP_HEIGHT,
  UMBRACOFFEE_NEXT_MAX_AGE_MS,
  UMBRACOFFEE_PANEL_WIDTH,
  UMBRACOFFEE_PLAYER_BAR_HEIGHT,
  UMBRACOFFEE_PLAYER_HEIGHT,
  UMBRACOFFEE_PLAYER_WIDTH,
  UMBRACOFFEE_STACK_BREAKPOINT,
  UMBRACOFFEE_TRAY_ALIAS,
} from './constants.js';
import { UMBRACOFFEE_DATETIME_OPTIONS } from './desktop-format.js';
import type { UmbraCoffeeFetcher } from './store.js';
import {
  answer,
  clock,
  desktopFormatted,
  EPISODES,
  episodeOf,
  feedOf,
  live,
  MINUTE,
  offline,
  removeBoxes,
  sizedBox,
  T0,
  testStore,
  timers,
  upcoming,
} from './test-support.js';
import type { UmbraCoffeeData, UmbraCoffeeEpisode } from './types.js';
import type { UmbraCoffeeAppElement } from './umbracoffee.element.js';
import './window-test-support.js';
import type { TestWindowHostElement, TrayKind } from './window-test-support.js';
import type { UmbStringState } from '@umbraco-cms/backoffice/observable-api';

/**
 * The window, tested through what it draws. Every case hands the element its own store over fixed
 * data, and the shared player a fake engine, so nothing here reaches the network, and both the store
 * and the window run on the test's timers and clock, so nothing polls or ticks behind a case's back.
 * The rules for what to show are `schedule.ts`'s and are tested there; these cases are about the
 * window drawing what it is told (the 2026-10-01 round-2 mock), and about the one rule of its own: a
 * live stream is not torn down by an answer that merely cannot vouch for it.
 *
 * The chat frame is given its real address and never loads it: the runner's page carries a
 * `frame-src 'none'` policy (see `web-test-runner.config.mjs`), so what is asserted is only the
 * address it was given. The parts (countdown, list, chat, dialog, bar) have tests of their own; here
 * they are checked as far as this element wires them.
 */

/** The strings the window falls back to, which are the English dictionary's. */
const STRINGS = en.umbraDesktopEntertainment;

afterEach(removeBoxes);

/** What a case can vary about where and how the window is mounted. */
interface MountOptions {
  /** The box's size, in px. */
  size?: { w: number; h: number };
  /** Which tray context the desktop stand-in provides, or `none` for one that provides no tray. Default `current`. */
  tray?: TrayKind | 'none';
  /** Which settings context it provides, or `none` for none. Default `none`. */
  settings?: 'current' | 'older' | 'none';
  /** False to mount in a plain box, outside any desktop. */
  desktop?: boolean;
}

/**
 * Wait for the window and every part it draws to finish rendering.
 * @param element The window.
 */
async function settled(element: UmbraCoffeeAppElement): Promise<void> {
  await element.updateComplete;
  const parts = element.shadowRoot?.querySelectorAll<HTMLElement & { updateComplete?: Promise<unknown> }>(
    'umbracoffee-countdown, umbracoffee-episode-list, umbracoffee-chat, umbracoffee-settings, umbradesktop-media-player, umbradesktop-control-bar',
  );
  await Promise.all([...(parts ?? [])].map((part) => part.updateComplete));
  await element.updateComplete;
}

/**
 * Mount the window in a box of an exact size, the way a window body hands it one.
 * @param source The data the store gives, or a fetcher the case controls.
 * @param options Size and desktop.
 * @returns The window after the store's first answer has rendered, its store, the store's timers, the
 *   window's timers, the clock both share, the box, the desktop stand-in, the engine the player got,
 *   and the hour setting the settings stand-in formats with (when there is one).
 */
async function mount(source: UmbraCoffeeData | UmbraCoffeeFetcher, options: MountOptions = {}) {
  const time = clock();
  const storeTimers = timers(time);
  const windowTimers = timers(time);
  const store = testStore(source, storeTimers);
  const engine = new FakeEngine();
  let host: TestWindowHostElement | undefined;
  let setting: UmbStringState<string> | undefined;
  if (options.desktop !== false) {
    host = document.createElement('umbracoffee-test-window-host');
    if (options.tray !== 'none') host.provideTray(options.tray ?? 'current');
    if (options.settings && options.settings !== 'none') setting = host.provideSettings(options.settings);
  }
  const box = sizedBox(options.size ?? UMBRACOFFEE_CONTENT_SIZE, host);
  const element = document.createElement('umbracoffee-app');
  element.store = store;
  element.environment = windowTimers;
  element.playerEngine = engine;
  box.appendChild(element);
  await store.settled;
  await settled(element);
  return { element, store, storeTimers, windowTimers, time, box, host, engine, setting };
}

/**
 * One node in the window.
 * @param element The window.
 * @param selector What to find.
 * @returns The node, or null.
 */
function find<T extends Element = HTMLElement>(element: UmbraCoffeeAppElement, selector: string): T | null {
  return element.shadowRoot?.querySelector<T>(selector) ?? null;
}

/**
 * Whether a node is drawn at all. Nodes are compared as booleans, because a failing `to.equal` on two
 * elements makes chai format them for the message, and formatting an iframe hangs the page.
 * @param element The window.
 * @param selector What to look for.
 * @returns True when it is there.
 */
function has(element: UmbraCoffeeAppElement, selector: string): boolean {
  return find(element, selector) !== null;
}

/**
 * The shared player in the window.
 * @param element The window.
 * @returns The player element, or null.
 */
function player(element: UmbraCoffeeAppElement) {
  return find<HTMLElement & { videoId: string; autoplay: boolean; engine?: unknown }>(element, 'umbradesktop-media-player');
}

/**
 * The episode list element.
 * @param element The window.
 * @returns The list.
 */
function list(element: UmbraCoffeeAppElement) {
  return find<HTMLElement & { shadowRoot: ShadowRoot }>(element, 'umbracoffee-episode-list');
}

/**
 * The episode list's rows, which live in its own shadow root, the first row included.
 * @param element The window.
 * @returns The rows' buttons.
 */
function listRows(element: UmbraCoffeeAppElement): HTMLButtonElement[] {
  return [...(list(element)?.shadowRoot?.querySelectorAll<HTMLButtonElement>('.ep') ?? [])];
}

/**
 * The rows for archive episodes, without the first row the window adds while one is coming or on.
 * @param element The window.
 * @returns The rows' buttons.
 */
function episodeRows(element: UmbraCoffeeAppElement): HTMLButtonElement[] {
  return listRows(element).filter((row) => !row.classList.contains('lead'));
}

/**
 * One node's text, trimmed and whitespace collapsed.
 * @param element The window.
 * @param selector What to read.
 * @returns The text, or undefined when the node is not there.
 */
function textOf(element: UmbraCoffeeAppElement, selector: string): string | undefined {
  return find(element, selector)?.textContent?.replace(/\s+/g, ' ').trim();
}

/**
 * The minutes the countdown shows.
 * @param element The window.
 * @returns The minutes block's number.
 */
function countdownMinutes(element: UmbraCoffeeAppElement): string | undefined {
  const countdown = find(element, 'umbracoffee-countdown');
  return countdown?.shadowRoot?.querySelector('[data-unit="minutes"] b')?.textContent?.trim();
}

/**
 * The settings dialog's switch, once the gear has opened it.
 * @param element The window.
 * @returns The switch, or null.
 */
function dialogSwitch(element: UmbraCoffeeAppElement) {
  return find(element, 'umbracoffee-settings')?.shadowRoot?.querySelector<HTMLButtonElement>('[role="switch"]') ?? null;
}

/**
 * Open the settings dialog from the gear.
 * @param element The window.
 */
async function openSettings(element: UmbraCoffeeAppElement): Promise<void> {
  find<HTMLButtonElement>(element, '.gear')!.click();
  await settled(element);
}

/**
 * The reason the dialog gives for a disabled switch.
 * @param element The window.
 * @returns The reason's text, or undefined when there is none.
 */
function dialogReason(element: UmbraCoffeeAppElement): string | undefined {
  return find(element, 'umbracoffee-settings')?.shadowRoot?.querySelector('.reason')?.textContent?.replace(/\s+/g, ' ').trim();
}

/**
 * The episodes with a summary and two guests on the first, for the details. The second guest has an
 * accent and no affiliation, so the guests line is read in full.
 * @returns Episodes.
 */
const withDetails = (): UmbraCoffeeEpisode[] => [
  {
    ...EPISODES[0]!,
    summary:
      'Marcin and Callum go through the community news, a package spotlight and what Umbraco 17 means for your next upgrade, with time for questions from the chat at the end of the show.',
    guests: [
      { name: 'Sam Smith', affiliation: 'Jumoo' },
      { name: 'Daniël Knippers', affiliation: null },
    ],
  },
  ...EPISODES.slice(1),
];

/**
 * An archive long enough that the list has to scroll, at every size.
 * @returns Episodes, newest first.
 */
const manyEpisodes = (): UmbraCoffeeEpisode[] =>
  Array.from({ length: 40 }, (_, i) =>
    episodeOf({ videoId: i === 0 ? 'v0' : `x${i}`, title: `Episode ${i}`, published: new Date(T0 - (i + 1) * 30 * 86_400_000).toISOString() }),
  );

describe('live', () => {
  it('leads with the live stream: the Live tag, the title, the player waiting, and the chat as the open tab', async () => {
    const { element, engine } = await mount(live());
    expect(textOf(element, '.tag')).to.equal(STRINGS.umbraCoffeeLive);
    expect(find(element, '.tag')?.classList.contains('live')).to.equal(true);
    expect(textOf(element, '.ep-title')).to.equal('October');
    expect(player(element)?.videoId).to.equal('v1');
    expect(player(element)?.autoplay, 'opening a window starts nothing').to.equal(false);
    expect(player(element)?.engine === engine, 'the player plays through the engine it was given').to.equal(true);
    expect((find(element, 'umbracoffee-chat') as unknown as { videoId: string } | null)?.videoId).to.equal('v1');
    expect(find(element, '#tab-chat')?.getAttribute('aria-selected')).to.equal('true');
    expect(find(element, '#tab-episodes')?.getAttribute('aria-selected')).to.equal('false');
    expect(has(element, 'umbracoffee-countdown')).to.equal(false);
  });

  it('says when it started, from the data', async () => {
    const { element } = await mount(live());
    const started = element.localize.date(new Date(T0), UMBRACOFFEE_DATETIME_OPTIONS);
    expect(textOf(element, '.when')).to.equal(STRINGS.umbraCoffeeStartedAt.replace('%0%', started));
  });

  it('puts the gear in the tabs’ row', async () => {
    const { element } = await mount(live());
    expect(has(element, '.tabs-top .gear')).to.equal(true);
    expect(element.shadowRoot!.querySelectorAll('.gear').length, 'one gear').to.equal(1);
  });

  it('swaps to the episodes tab and back, keeping the chat frame loaded meanwhile', async () => {
    const { element } = await mount(live());
    const chat = find(element, 'umbracoffee-chat');
    find<HTMLButtonElement>(element, '#tab-episodes')?.click();
    await settled(element);
    expect(find(element, '#tab-episodes')?.getAttribute('aria-selected')).to.equal('true');
    expect(find(element, '#pane-chat')?.hasAttribute('hidden')).to.equal(true);
    expect(list(element)?.hasAttribute('hidden')).to.equal(false);
    find<HTMLButtonElement>(element, '#tab-chat')?.click();
    await settled(element);
    expect(find(element, 'umbracoffee-chat') === chat, 'the same chat, so it does not reload').to.equal(true);
    expect(find(element, '#pane-chat')?.hasAttribute('hidden')).to.equal(false);
    expect(list(element)?.hasAttribute('hidden')).to.equal(true);
  });

  it('heads the Episodes tab with the stream, marked as the one in the player', async () => {
    const { element } = await mount(live());
    const first = listRows(element)[0]!;
    expect(first.classList.contains('lead')).to.equal(true);
    expect(first.getAttribute('aria-current')).to.equal('true');
  });

  it('drops the tabs and the chat for an older episode, and goes back to the stream from the first row', async () => {
    const { element } = await mount(live());
    find<HTMLButtonElement>(element, '#tab-episodes')?.click();
    await settled(element);
    episodeRows(element)[1]?.click();
    await settled(element);
    expect(player(element)?.videoId).to.equal('v2');
    expect(has(element, 'umbracoffee-chat'), 'an old episode has no chat').to.equal(false);
    expect(has(element, '[role="tablist"]'), 'and no tabs').to.equal(false);
    listRows(element)[0]?.click();
    await settled(element);
    expect(player(element)?.videoId).to.equal('v1');
    expect(player(element)?.autoplay, 'it plays, having been asked for').to.equal(true);
    expect(has(element, 'umbracoffee-chat')).to.equal(true);
    expect(find(element, '#tab-chat')?.getAttribute('aria-selected'), 'opening on Chat again').to.equal('true');
  });
});

describe('upcoming', () => {
  it('draws the countdown in the picture’s place, not a player, with no tabs', async () => {
    const { element } = await mount(upcoming());
    expect(has(element, 'umbradesktop-media-player')).to.equal(false);
    expect(has(element, 'umbracoffee-chat')).to.equal(false);
    expect(has(element, '[role="tablist"]')).to.equal(false);
    expect(textOf(element, '.tag')).to.equal(STRINGS.umbraCoffeeUpcoming);
    expect(find(element, '.tag')?.classList.contains('soon')).to.equal(true);
    expect(textOf(element, '.ep-title')).to.equal('October');
    expect(textOf(element, '.hero-kicker')).to.equal(STRINGS.umbraCoffeeStartsIn);
    expect(countdownMinutes(element)).to.equal('25');
  });

  it('counts the minutes down as the clock moves', async () => {
    const { element, windowTimers, time } = await mount(upcoming());
    time.advance(5 * MINUTE);
    windowTimers.fire();
    await settled(element);
    expect(countdownMinutes(element)).to.equal('20');
  });

  it('draws the control bar under it, disabled, saying when it starts, its YouTube link on the waiting room', async () => {
    const { element } = await mount(upcoming());
    const bar = find<HTMLElement & { disabled: boolean; status: string; videoId: string }>(element, 'umbradesktop-control-bar')!;
    expect(bar.disabled).to.equal(true);
    expect(bar.status).to.equal(STRINGS.umbraCoffeeStartsRelative.replace('%0%', element.localize.relativeTime(25, 'minute')));
    expect(bar.videoId).to.equal('v1');
  });

  it('heads the list with the upcoming episode, marked as what the window shows', async () => {
    const { element } = await mount(upcoming());
    const first = listRows(element)[0]!;
    expect(first.classList.contains('lead')).to.equal(true);
    expect(first.querySelector('.ep-t')?.textContent?.trim()).to.equal('October');
    expect(first.getAttribute('aria-current')).to.equal('true');
  });

  it('plays the latest episode in place on Watch the last episode, and starts it', async () => {
    const { element } = await mount(upcoming());
    expect(textOf(element, '.hero-note')).to.contain('September');
    find<HTMLButtonElement>(element, '.watch-last')?.click();
    await settled(element);
    expect(player(element)?.videoId).to.equal('v0');
    expect(player(element)?.autoplay, 'the user clicked to watch it').to.equal(true);
    expect(has(element, '.hero')).to.equal(false);
  });

  it('goes back to the countdown from a picked episode through the first row', async () => {
    const { element } = await mount(upcoming());
    episodeRows(element)[1]?.click();
    await settled(element);
    expect(player(element)?.videoId).to.equal('v2');
    expect(listRows(element)[0]?.getAttribute('aria-current'), 'the first row is no longer what shows').to.equal(null);
    listRows(element)[0]?.click();
    await settled(element);
    expect(has(element, 'umbradesktop-media-player')).to.equal(false);
    expect(countdownMinutes(element)).to.equal('25');
  });
});

describe('on demand', () => {
  it('puts the latest episode in the player, paused, and tags it', async () => {
    const { element } = await mount(answer());
    expect(player(element)?.videoId).to.equal('v0');
    expect(player(element)?.autoplay).to.equal(false);
    expect(textOf(element, '.tag')).to.equal(STRINGS.umbraCoffeeLatest);
    expect(find(element, '.tag')?.classList.contains('latest')).to.equal(true);
    expect(textOf(element, '.ep-title')).to.equal('September');
    expect(has(element, 'umbracoffee-chat')).to.equal(false);
    expect(has(element, '[role="tablist"]'), 'no tabs when nothing is live').to.equal(false);
  });

  it('writes the date, the guests by name with their company, and the summary under the title', async () => {
    const { element } = await mount(answer({ episodes: withDetails() }));
    expect(textOf(element, '.when')).to.equal(element.localize.date(EPISODES[0]!.published, { dateStyle: 'full' }));
    expect(textOf(element, '.guests')).to.equal(`${STRINGS.umbraCoffeeWith} Sam Smith, Jumoo ${STRINGS.umbraCoffeeAnd} Daniël Knippers`);
    expect([...element.shadowRoot!.querySelectorAll('.guests b')].map((b) => b.textContent)).to.deep.equal(['Sam Smith', 'Daniël Knippers']);
    expect(textOf(element, '.summary')).to.contain('Marcin and Callum go through the community news');
    const title = find(element, '.ep-title')!.getBoundingClientRect();
    expect(find(element, '.summary')!.getBoundingClientRect().top, 'the summary is under the title').to.be.greaterThan(title.bottom);
  });

  it('draws nothing for a missing summary or missing guests', async () => {
    const { element } = await mount(answer());
    expect(has(element, '.summary')).to.equal(false);
    expect(has(element, '.guests')).to.equal(false);
    const [first] = withDetails();
    const guestsOnly = await mount(answer({ episodes: [{ ...first!, summary: '' }, ...EPISODES.slice(1)] }));
    expect(has(guestsOnly.element, '.summary')).to.equal(false);
    expect(has(guestsOnly.element, '.guests')).to.equal(true);
    const summaryOnly = await mount(answer({ episodes: [{ ...first!, guests: [] }, ...EPISODES.slice(1)] }));
    expect(has(summaryOnly.element, '.summary')).to.equal(true);
    expect(has(summaryOnly.element, '.guests')).to.equal(false);
  });

  it('reads nothing from a description an episode might still carry', async () => {
    const stale = { ...EPISODES[0]!, description: 'An old description from a version 1 file.' };
    const { element } = await mount(answer({ episodes: [stale, ...EPISODES.slice(1)] }));
    expect(textOf(element, '.info')).to.not.contain('An old description');
  });

  it('plays a picked episode at once, marks it, and drops the tag, which is for the latest only', async () => {
    const { element } = await mount(answer());
    listRows(element)[1]?.click();
    await settled(element);
    expect(player(element)?.videoId).to.equal('v2');
    expect(player(element)?.autoplay, 'the user clicked to watch it').to.equal(true);
    expect(listRows(element)[1]?.getAttribute('aria-current')).to.equal('true');
    expect(has(element, '.tag')).to.equal(false);
    expect(textOf(element, '.ep-title')).to.equal('August');
  });

  it('tells the list whether the player is playing, for its Now playing and Paused', async () => {
    const { element, engine } = await mount(answer());
    const listed = list(element) as unknown as { playing: boolean };
    expect(listed.playing).to.equal(false);
    engine.play();
    await settled(element);
    expect(listed.playing).to.equal(true);
    engine.pause();
    await settled(element);
    expect(listed.playing).to.equal(false);
  });

  it('lists every episode through the list element, with the channel link, and the gear beside its search', async () => {
    const { element } = await mount(answer());
    expect(listRows(element).map((r) => r.querySelector('.ep-t')?.textContent?.trim())).to.deep.equal(EPISODES.map((e) => e.title));
    expect(list(element)?.shadowRoot?.querySelector('a.channel') === null).to.equal(false);
    const gear = find(element, '.gear')!;
    expect(gear.closest('[slot="tools"]') === null, 'slotted into the list’s search row').to.equal(false);
    const field = list(element)!.shadowRoot!.querySelector('.search')!.getBoundingClientRect();
    expect(gear.getBoundingClientRect().left).to.be.at.least(field.right);
  });
});

describe('offline', () => {
  it('draws no banner: a warning beside the gear, and keeps the episodes', async () => {
    const { element } = await mount(offline());
    expect(has(element, 'umbracoffee-offline-notice')).to.equal(false);
    const warn = find<HTMLButtonElement>(element, '.warn')!;
    expect(warn.getAttribute('aria-label')).to.equal(STRINGS.umbraCoffeeFeedUnavailable);
    expect(warn.nextElementSibling?.classList.contains('gear') || warn.parentElement?.querySelector('.gear') !== null).to.equal(true);
    expect(listRows(element).length).to.equal(EPISODES.length);
    expect(player(element)?.videoId, 'the latest of the snapshot').to.equal('v0');
  });

  it('says what is wrong in a tooltip on hover and on focus, which the button is described by', async () => {
    const { element } = await mount(offline());
    const warn = find<HTMLButtonElement>(element, '.warn')!;
    const tip = find(element, '[role="tooltip"]')!;
    const date = element.localize.date(new Date(T0), { dateStyle: 'long' });
    expect(tip.textContent?.replace(/\s+/g, ' ').trim()).to.equal(STRINGS.umbraCoffeeUnavailable.replace('%0%', date));
    expect(warn.getAttribute('aria-describedby')).to.equal(tip.id);
    expect(tip.hasAttribute('hidden'), 'closed at rest').to.equal(true);
    warn.dispatchEvent(new MouseEvent('mouseenter'));
    await settled(element);
    expect(tip.hasAttribute('hidden'), 'open on hover').to.equal(false);
    warn.dispatchEvent(new MouseEvent('mouseleave'));
    await settled(element);
    expect(tip.hasAttribute('hidden')).to.equal(true);
    warn.dispatchEvent(new FocusEvent('focus'));
    await settled(element);
    expect(tip.hasAttribute('hidden'), 'open on focus').to.equal(false);
    warn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settled(element);
    expect(tip.hasAttribute('hidden'), 'and Escape closes it').to.equal(true);
  });

  it('draws no warning while online', async () => {
    const { element } = await mount(answer());
    expect(has(element, '.warn')).to.equal(false);
    expect(has(element, '[role="tooltip"]')).to.equal(false);
  });

  it('draws no countdown or chat, even if the data still carried a current episode', async () => {
    const { element } = await mount(upcoming({ offline: true }));
    expect(has(element, '.hero')).to.equal(false);
    expect(has(element, 'umbracoffee-chat')).to.equal(false);
  });
});

describe('the settings dialog and the Remind me switch', () => {
  it('opens from the gear, over the window, and closes back to the gear', async () => {
    const { element } = await mount(answer());
    expect(has(element, 'umbracoffee-settings')).to.equal(false);
    await openSettings(element);
    expect(has(element, 'umbracoffee-settings')).to.equal(true);
    find(element, 'umbracoffee-settings')!.dispatchEvent(new CustomEvent('umbracoffee-settings-close', { bubbles: true, composed: true }));
    await settled(element);
    expect(has(element, 'umbracoffee-settings')).to.equal(false);
    expect(element.shadowRoot!.activeElement?.classList.contains('gear'), 'focus goes back to the gear').to.equal(true);
  });

  it('has no switch in the window itself any more', async () => {
    const { element } = await mount(answer());
    expect(has(element, '[role="switch"]')).to.equal(false);
  });

  it('shows what the desktop says, and follows it when it changes elsewhere', async () => {
    const { element, host } = await mount(answer());
    await openSettings(element);
    expect(dialogSwitch(element)?.getAttribute('aria-checked')).to.equal('true');
    expect(dialogSwitch(element)?.disabled).to.equal(false);
    expect(dialogReason(element), 'nothing to explain while it works').to.equal(undefined);
    host!.reminders.setValue(false);
    await settled(element);
    expect(dialogSwitch(element)?.getAttribute('aria-checked')).to.equal('false');
  });

  it('switches the tray item on and off through the desktop, and follows its own click', async () => {
    const { element, host } = await mount(answer());
    await openSettings(element);
    dialogSwitch(element)?.click();
    await settled(element);
    expect(host!.switched).to.deep.equal([{ alias: UMBRACOFFEE_TRAY_ALIAS, enabled: false }]);
    expect(dialogSwitch(element)?.getAttribute('aria-checked')).to.equal('false');
    dialogSwitch(element)?.click();
    await settled(element);
    expect(host!.switched[1]).to.deep.equal({ alias: UMBRACOFFEE_TRAY_ALIAS, enabled: true });
    expect(dialogSwitch(element)?.getAttribute('aria-checked')).to.equal('true');
  });

  it('is disabled offline, saying why', async () => {
    const { element } = await mount(offline());
    await openSettings(element);
    expect(dialogSwitch(element)?.disabled).to.equal(true);
    expect(dialogReason(element)).to.equal(STRINGS.umbraCoffeeRemindOffline);
  });

  it('is disabled on a desktop that cannot say, and points at Desktop settings', async () => {
    const { element, host } = await mount(answer(), { tray: 'older' });
    await openSettings(element);
    expect(dialogSwitch(element)?.disabled).to.equal(true);
    expect(dialogReason(element)).to.equal(STRINGS.umbraCoffeeRemindersWhere);
    dialogSwitch(element)?.click();
    expect(host!.switched.length, 'a disabled switch does nothing').to.equal(0);
  });

  it('is disabled the same way outside a desktop', async () => {
    const { element } = await mount(answer(), { desktop: false });
    await openSettings(element);
    expect(dialogReason(element)).to.equal(STRINGS.umbraCoffeeRemindersWhere);
  });

  it('says it is offline rather than pointing at settings, when both apply', async () => {
    const { element } = await mount(offline(), { tray: 'older' });
    await openSettings(element);
    expect(dialogReason(element)).to.equal(STRINGS.umbraCoffeeRemindOffline);
  });
});

/**
 * Times and dates are written the way the desktop's taskbar clock writes them when the desktop can
 * say how (its settings context's public `formatDateTime`), and in the backoffice language when it
 * cannot: outside a desktop, or inside an older one, whose context has no such method. The stand-in's
 * formatting is unlike any culture's, so a case can tell which was used.
 */
describe('times and dates', () => {
  /** When {@link upcoming} starts. */
  const start = new Date(T0 + 25 * MINUTE - 1000);

  /**
   * The dates the list shows for archive episodes, in list order.
   * @param element The window.
   * @returns The dates.
   */
  const dates = (element: UmbraCoffeeAppElement) => episodeRows(element).map((r) => r.querySelector('.ep-d')?.textContent?.trim());

  it("writes the start time and the episodes' dates as the desktop's clock does", async () => {
    const { element } = await mount(upcoming(), { settings: 'current' });
    expect(textOf(element, '.when'), 'a time asks for an hour, so the 12/24 setting applies').to.contain('h23');
    expect(textOf(element, '.when')).to.equal(desktopFormatted(start, UMBRACOFFEE_DATETIME_OPTIONS));
    expect(dates(element)).to.deep.equal(EPISODES.map((e) => desktopFormatted(new Date(e.published), { dateStyle: 'medium' })));
  });

  it('writes them again when the user changes how the desktop formats times', async () => {
    const { element, setting } = await mount(upcoming(), { settings: 'current' });
    setting!.setValue('h12');
    await settled(element);
    expect(textOf(element, '.when')).to.equal(desktopFormatted(start, UMBRACOFFEE_DATETIME_OPTIONS, 'h12'));
  });

  for (const [name, options] of [
    ['outside a desktop', { desktop: false }],
    ['inside a desktop older than formatDateTime', { settings: 'older' }],
  ] as const) {
    it(`writes them in the backoffice language ${name}`, async () => {
      const { element } = await mount(upcoming(), options);
      expect(textOf(element, '.when')).to.equal(element.localize.date(start, UMBRACOFFEE_DATETIME_OPTIONS));
      expect(dates(element)).to.deep.equal(EPISODES.map((e) => element.localize.date(e.published, { dateStyle: 'medium' })));
    });
  }
});

/**
 * The window's own rule: once it leads with a live stream, an answer that only distrusts it (the feed
 * is unreachable, the next-episode file has gone stale, or this browser has held it too long) does not
 * take the stream and the chat away mid-watch. Only a fresh answer that says something else moves the
 * window on. Frames and players are compared by identity as booleans, as `has` explains.
 */
describe('a live stream being watched', () => {
  it('stays, player and chat untouched, through an offline answer, and moves on at a fresh one', async () => {
    let next: UmbraCoffeeData = live();
    const { element, store, storeTimers } = await mount(async () => feedOf(next, T0));
    const video = player(element);
    const chat = find(element, 'umbracoffee-chat');

    next = offline();
    storeTimers.fire();
    await store.settled;
    await settled(element);
    expect(player(element) === video, 'the same player, so nothing reloads').to.equal(true);
    expect(player(element)?.videoId).to.equal('v1');
    expect(find(element, 'umbracoffee-chat') === chat, 'and the same chat').to.equal(true);
    expect(textOf(element, '.tag'), 'still live').to.equal(STRINGS.umbraCoffeeLive);
    expect(has(element, '.warn'), 'while saying it is offline').to.equal(true);

    next = answer();
    storeTimers.fire();
    await store.settled;
    await settled(element);
    expect(player(element)?.videoId, 'a fresh answer with nothing on').to.equal('v0');
    expect(has(element, 'umbracoffee-chat')).to.equal(false);
  });

  it('stays through an answer whose next-episode file has gone stale', async () => {
    let next: UmbraCoffeeData = live();
    const { element, store, storeTimers } = await mount(async () => feedOf(next, T0));
    const video = player(element);
    next = live({ currentUpdatedAt: T0 - UMBRACOFFEE_NEXT_MAX_AGE_MS - MINUTE });
    storeTimers.fire();
    await store.settled;
    await settled(element);
    expect(player(element) === video).to.equal(true);
    expect(has(element, 'umbracoffee-chat')).to.equal(true);
  });

  it('stays when the answer it has grows too old to trust', async () => {
    const { element, windowTimers, time } = await mount(live());
    const video = player(element);
    const chat = find(element, 'umbracoffee-chat');
    time.advance(UMBRACOFFEE_NEXT_MAX_AGE_MS + MINUTE);
    windowTimers.fire();
    await settled(element);
    expect(player(element) === video, 'the same player').to.equal(true);
    expect(find(element, 'umbracoffee-chat') === chat, 'and the same chat').to.equal(true);
  });

  it('moves on when a fresh answer says the stream is now a different one', async () => {
    let next: UmbraCoffeeData = live();
    const { element, store, storeTimers } = await mount(async () => feedOf(next, T0));
    next = answer({ current: { videoId: 'v9', title: 'November', state: 'live', scheduledStart: null }, currentUpdatedAt: T0 });
    storeTimers.fire();
    await store.settled;
    await settled(element);
    expect(player(element)?.videoId).to.equal('v9');
  });
});

/**
 * Every element that scrolls, or can be scrolled, in the window's composed tree, as a short name.
 * Both are asked: an element whose CSS says it scrolls, and one that moves when told to (overflow
 * hidden over content that does not fit still scrolls, by focus or by script, which is how a window
 * that "never scrolls" ends up scrolled). Elements that are not drawn are skipped, and the frames'
 * own documents are YouTube's.
 * @param element The window.
 * @returns The scrollers, each as its tag and classes.
 */
function scrollers(element: UmbraCoffeeAppElement): string[] {
  const found: string[] = [];
  const name = (node: Element) => `${node.localName}${node.classList.length ? `.${[...node.classList].join('.')}` : ''}`;
  const visit = (node: Element) => {
    if (node.getClientRects().length > 0 && node.localName !== 'iframe') {
      const style = getComputedStyle(node);
      const says = [style.overflowX, style.overflowY].some((value) => value === 'auto' || value === 'scroll');
      const [top, left] = [node.scrollTop, node.scrollLeft];
      node.scrollTop = 10_000;
      node.scrollLeft = 10_000;
      const moves = node.scrollTop !== 0 || node.scrollLeft !== 0;
      node.scrollTop = top;
      node.scrollLeft = left;
      if (says || moves) found.push(name(node));
    }
    for (const child of [...(node.shadowRoot?.children ?? []), ...node.children]) visit(child);
  };
  visit(element);
  return found;
}

describe('one scroll area', () => {
  for (const [name, data] of [
    ['on demand', () => answer({ episodes: manyEpisodes() })],
    ['live, on the Episodes tab', () => live({ episodes: manyEpisodes() })],
    ['upcoming', () => upcoming({ episodes: manyEpisodes() })],
    ['offline', () => offline({ episodes: manyEpisodes() })],
  ] as const) {
    for (const [sizeName, size] of [
      ['the opening size', UMBRACOFFEE_CONTENT_SIZE],
      ['the minimum size', UMBRACOFFEE_MIN_CONTENT_SIZE],
    ] as const) {
      it(`scrolls the episode list and nothing else at ${sizeName} (${name})`, async () => {
        const { element, box } = await mount(data(), { size });
        if (has(element, '#tab-episodes')) {
          find<HTMLButtonElement>(element, '#tab-episodes')!.click();
          await settled(element);
        }
        expect(scrollers(element), 'the list’s rows are the one scroller').to.deep.equal(['div.scroll']);
        const scroller = list(element)!.shadowRoot!.querySelector<HTMLElement>('.scroll')!;
        expect(scroller.scrollHeight, 'and it does have more to show').to.be.greaterThan(scroller.clientHeight);
        expect(element.scrollHeight, 'the host holds its box').to.be.at.most(element.clientHeight);
        expect(box.scrollHeight, 'and so does the window body').to.be.at.most(box.clientHeight);
        expect(element.getBoundingClientRect().height).to.be.closeTo(box.getBoundingClientRect().height, 0.5);
      });
    }
  }

  it('scrolls nothing of its own on the Chat tab, the chat frame being YouTube’s', async () => {
    const { element } = await mount(live({ episodes: manyEpisodes() }));
    expect(scrollers(element)).to.deep.equal([]);
  });
});

/**
 * The column is a fixed width, so in a narrow window it would take its width from the player. The
 * window puts it under the player below a width derived from the constants, and these cases hold the
 * boundary on both sides of it.
 */
describe('the layout at different widths', () => {
  /**
   * Whether the column sits beside the player, or under it.
   * @param element The window.
   * @returns `beside` or `under`.
   */
  function layout(element: UmbraCoffeeAppElement): 'beside' | 'under' {
    const stage = find(element, '.stage')!.getBoundingClientRect();
    const side = find(element, '.side')!.getBoundingClientRect();
    return side.left >= stage.right - 0.5 ? 'beside' : 'under';
  }

  it('puts the list under the player at the minimum size, the player taking the whole width', async () => {
    const { element } = await mount(answer(), { size: UMBRACOFFEE_MIN_CONTENT_SIZE });
    expect(layout(element)).to.equal('under');
    expect(player(element)?.getBoundingClientRect().width).to.equal(UMBRACOFFEE_MIN_CONTENT_SIZE.w);
    const info = find(element, '.info')!.getBoundingClientRect();
    expect(find(element, '.side')!.getBoundingClientRect().top).to.be.at.least(info.bottom - 0.5);
  });

  it('is under one pixel short of the breakpoint and beside at it', async () => {
    const narrow = await mount(live(), { size: { w: UMBRACOFFEE_STACK_BREAKPOINT - 1, h: UMBRACOFFEE_CONTENT_SIZE.h } });
    expect(layout(narrow.element)).to.equal('under');
    const wide = await mount(live(), { size: { w: UMBRACOFFEE_STACK_BREAKPOINT, h: UMBRACOFFEE_CONTENT_SIZE.h } });
    expect(layout(wide.element)).to.equal('beside');
    expect(player(wide.element)?.getBoundingClientRect().width, 'never narrower than its minimum beside the column').to.be.at.least(
      UMBRACOFFEE_MIN_PLAYER_WIDTH,
    );
  });

  it('moves the column back beside the player when the window is widened, without reloading the chat', async () => {
    const { element, box } = await mount(live(), { size: UMBRACOFFEE_MIN_CONTENT_SIZE });
    const chat = find(element, 'umbracoffee-chat');
    box.style.width = `${UMBRACOFFEE_CONTENT_SIZE.w}px`;
    box.style.height = `${UMBRACOFFEE_CONTENT_SIZE.h}px`;
    expect(layout(element)).to.equal('beside');
    expect(find(element, 'umbracoffee-chat') === chat).to.equal(true);
  });

  it('keeps the gear beside the search field when the list is under the player', async () => {
    const { element } = await mount(answer(), { size: UMBRACOFFEE_MIN_CONTENT_SIZE });
    const field = list(element)!.shadowRoot!.querySelector('.search')!.getBoundingClientRect();
    const gear = find(element, '.gear')!.getBoundingClientRect();
    expect(gear.left).to.be.at.least(field.right);
    expect(gear.top + gear.height / 2).to.be.closeTo(field.top + field.height / 2, 0.5);
  });

  it('stacks the countdown the same way', async () => {
    const { element } = await mount(upcoming(), { size: UMBRACOFFEE_MIN_CONTENT_SIZE });
    expect(layout(element)).to.equal('under');
  });
});

/**
 * Measured, not reasoned about: the sizes in `constants.ts` promise the mock's window at the opening
 * size, and a window at any size that keeps its controls, its title and a row of the list on screen
 * by letting the picture give.
 */
describe('fit', () => {
  /**
   * The video frame's box, inside the player.
   * @param element The window.
   * @returns Its rectangle.
   */
  const frame = (element: UmbraCoffeeAppElement) => player(element)!.shadowRoot!.querySelector('.frame')!.getBoundingClientRect();

  it('opens with the player at its declared width and shape, its bar, the details and the column beside', async () => {
    const { element, engine, box } = await mount(answer({ episodes: withDetails() }));
    engine.duration = 3000;
    engine.emit(ENGINE_EVENTS.durationChange, 3000);
    await settled(element);
    const bar = player(element)!.shadowRoot!.querySelector('umbradesktop-control-bar')!.getBoundingClientRect();
    expect(player(element)!.getBoundingClientRect().width).to.equal(UMBRACOFFEE_PLAYER_WIDTH);
    expect(frame(element).height).to.be.closeTo(UMBRACOFFEE_PLAYER_HEIGHT, 0.5);
    expect(bar.height).to.be.closeTo(UMBRACOFFEE_PLAYER_BAR_HEIGHT, 0.5);
    expect(find(element, '.info')!.getBoundingClientRect().height).to.be.closeTo(UMBRACOFFEE_INFO_HEIGHT, 0.5);
    const side = find(element, '.side')!.getBoundingClientRect();
    expect(side.width).to.equal(UMBRACOFFEE_PANEL_WIDTH);
    expect(side.height, 'the column runs the window’s full height').to.be.closeTo(box.getBoundingClientRect().height, 0.5);
    expect(find(element, '.info')!.getBoundingClientRect().bottom, 'the content size is the sum of its parts').to.be.closeTo(
      box.getBoundingClientRect().bottom,
      0.5,
    );
  });

  it('keeps the player the same height live and on demand', async () => {
    const onDemand = await mount(answer());
    const streaming = await mount(live());
    const height = (element: UmbraCoffeeAppElement) => find(element, '.stage')!.getBoundingClientRect().height;
    expect(height(streaming.element)).to.be.closeTo(height(onDemand.element), 0.5);
  });

  it('gives the countdown and its bar the height of the player, so nothing jumps when the stream starts', async () => {
    for (const size of [UMBRACOFFEE_CONTENT_SIZE, UMBRACOFFEE_MIN_CONTENT_SIZE]) {
      const playing = await mount(answer(), { size });
      const up = await mount(upcoming(), { size });
      expect(find(up.element, '.stage')!.getBoundingClientRect().height, `${size.w}x${size.h}`).to.be.closeTo(
        find(playing.element, '.stage')!.getBoundingClientRect().height,
        0.5,
      );
    }
  });

  /*
   * The countdown sits in its own size container (the stage, so its numbers can follow its height).
   * An unnamed width query inside it then asked the stage, 688px wide and so under the window's
   * breakpoint, and drew the narrow countdown in a wide window.
   */
  it('draws the countdown at the mock’s size in a wide window and smaller only in a narrow one', async () => {
    const number = (element: UmbraCoffeeAppElement) =>
      parseFloat(getComputedStyle(find(element, 'umbracoffee-countdown')!.shadowRoot!.querySelector('[data-unit="minutes"] b')!).fontSize);
    const wide = await mount(upcoming());
    expect(number(wide.element)).to.equal(64);
    const narrow = await mount(upcoming(), { size: UMBRACOFFEE_MIN_CONTENT_SIZE });
    expect(number(narrow.element)).to.be.lessThan(64);
  });

  /*
   * The owner's maximized window (2026-10-11) kept only the title and the date line under the bar,
   * flush with the window's bottom edge, which read as cut off. The cap now leaves the details their
   * reserved height: two summary lines and the bottom padding as well.
   */
  it('caps the picture in a window short for its width, keeping the details their reserved room', async () => {
    const size = { w: 1400, h: UMBRACOFFEE_MIN_CONTENT_SIZE.h };
    const { element, box } = await mount(answer(), { size });
    expect(frame(element).height).to.be.closeTo(size.h - UMBRACOFFEE_PLAYER_BAR_HEIGHT - UMBRACOFFEE_INFO_RESERVED_HEIGHT, 0.5);
    expect(frame(element).width, 'the frame keeps the width; the picture letterboxes').to.be.closeTo(size.w - UMBRACOFFEE_PANEL_WIDTH, 0.5);
    const below = box.getBoundingClientRect().bottom - find(element, '.when')!.getBoundingClientRect().bottom;
    expect(below, 'two summary lines and the bottom padding fit under the date line').to.be.at.least(
      UMBRACOFFEE_INFO_RESERVED_HEIGHT - UMBRACOFFEE_INFO_MIN_HEIGHT - 0.5,
    );
  });

  /*
   * The owner's maximized window (2026-10-01) cut the summary through the middle of a line at the
   * window's bottom edge: the clamp was a fixed five lines and the details had room for three and a
   * bit, so the clip and not the clamp ended it. The summary must end on a whole line, with the
   * ellipsis the clamp draws, at whatever height the details get.
   */
  it('ends the summary on a whole line inside the details at any height, never cut through a line', async () => {
    const long = 'Covers the end of Hacktoberfest, the product update and a release candidate, with packages and events. '.repeat(8);
    const episodes = [{ ...withDetails()[0]!, summary: long }, ...EPISODES.slice(1)];
    for (const size of [
      { w: 1490, h: 880 },
      { w: 1490, h: 860 },
      { w: 1400, h: 800 },
      { w: 1200, h: 700 },
      UMBRACOFFEE_CONTENT_SIZE,
      UMBRACOFFEE_MIN_CONTENT_SIZE,
    ]) {
      const { element } = await mount(answer({ episodes }), { size });
      // The fit is measured after layout, on an animation frame. In the full run the test tabs sit in
      // the background, where frames come late, so a fixed two frames failed about two runs in three
      // (2026-10-11). Wait until the fit has settled instead; a summary that never fits still fails,
      // on the assertions below once the wait gives up.
      await settled(element);
      await waitUntil(
        () => {
          const s = find(element, '.summary');
          const i = find(element, '.info');
          if (!s || !i || s.hidden) return false;
          const n = s.getBoundingClientRect().height / parseFloat(getComputedStyle(s).lineHeight);
          const inside = i.getBoundingClientRect().bottom - parseFloat(getComputedStyle(i).paddingBottom);
          return Math.abs(n - Math.round(n)) < 0.02 && s.getBoundingClientRect().bottom <= inside + 0.5;
        },
        undefined,
        { timeout: 2000 },
      ).catch(() => undefined);
      const info = find(element, '.info')!;
      const summary = find(element, '.summary');
      const label = `${size.w}x${size.h}`;
      expect(summary && !summary.hidden, `${label}: every one of these sizes has room for a line`).to.equal(true);
      const box = summary!.getBoundingClientRect();
      const lineHeight = parseFloat(getComputedStyle(summary!).lineHeight);
      const lines = box.height / lineHeight;
      const inside = info.getBoundingClientRect().bottom - parseFloat(getComputedStyle(info).paddingBottom);
      expect(box.bottom, `${label}: the summary ends inside the details, above their bottom padding`).to.be.at.most(inside + 0.5);
      expect(lines, `${label}: a whole number of lines`).to.be.closeTo(Math.round(lines), 0.02);
      expect(Math.round(lines), `${label}: at least one line`).to.be.at.least(1);
      expect(summary!.scrollHeight, `${label}: clamped, so it ends on the ellipsis`).to.be.greaterThan(summary!.clientHeight);
    }
    // Wide and short: the picture's cap still leaves the details two whole lines of summary.
    const { element } = await mount(answer({ episodes }), { size: { w: 1400, h: 760 } });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await settled(element);
    const summary = find(element, '.summary')!;
    const shown = summary.getBoundingClientRect().height / parseFloat(getComputedStyle(summary).lineHeight);
    expect(Math.round(shown), 'wide and short: two whole lines, not none').to.be.at.least(2);
  });

  it('keeps one row of the list on screen at the minimum size, with the picture at YouTube’s minimum', async () => {
    const { element, box } = await mount(answer({ episodes: withDetails() }), { size: UMBRACOFFEE_MIN_CONTENT_SIZE });
    expect(frame(element).height).to.be.closeTo(
      UMBRACOFFEE_MIN_CONTENT_SIZE.h -
        UMBRACOFFEE_PLAYER_BAR_HEIGHT -
        UMBRACOFFEE_NARROW_INFO_HEIGHT -
        UMBRACOFFEE_NARROW_SIDE_TOP_HEIGHT -
        UMBRACOFFEE_LIST_MIN_HEIGHT,
      0.5,
    );
    expect(find(element, '.info')!.getBoundingClientRect().height, 'the narrow details at their tallest').to.be.closeTo(
      UMBRACOFFEE_NARROW_INFO_HEIGHT,
      0.5,
    );
    const firstRow = listRows(element)[0]!.getBoundingClientRect();
    expect(firstRow.bottom, 'a whole row shows').to.be.at.most(box.getBoundingClientRect().bottom + 0.5);
  });

  it('keeps its minimum height when its parent gives it none', async () => {
    const { element } = await mount(answer(), { size: { w: UMBRACOFFEE_MIN_CONTENT_SIZE.w, h: 0 } });
    expect(element.getBoundingClientRect().height, 'a size container with no height is an invisible window').to.equal(
      UMBRACOFFEE_MIN_CONTENT_SIZE.h,
    );
  });
});

/**
 * A theme may restyle, never resize: the attribute the desktop stamps on the element must not change
 * any box. Measured under all five, on the parts a paint refinement is most likely to disturb.
 */
describe('theming', () => {
  /**
   * The size of every part a theme block styles.
   * @param element The window.
   * @returns Selector to size.
   */
  function sizes(element: UmbraCoffeeAppElement): Record<string, string> {
    const result: Record<string, string> = {};
    for (const selector of ['.stage', '.info', '.ep-title', '.tag', '.side', '.gear', '.tab', '.hero', '.watch-last', '.warn']) {
      const box = find(element, selector)?.getBoundingClientRect();
      result[selector] = box ? `${box.width}x${box.height}` : 'absent';
    }
    return result;
  }

  for (const [name, data] of [
    ['on demand', answer],
    ['upcoming', upcoming],
    ['live', live],
    ['offline', offline],
  ] as const) {
    it(`changes no size between the five themes (${name})`, async () => {
      const { element } = await mount(data());
      const plain = sizes(element);
      for (const theme of ['umbraco', 'umbraco4', 'macos', 'win11', 'win98']) {
        element.setAttribute('data-umbradesktop-theme', theme);
        // The window watches its own attribute with a MutationObserver, whose callback is a microtask.
        await new Promise((resolve) => setTimeout(resolve));
        await settled(element);
        expect(sizes(element), `under ${theme}`).to.deep.equal(plain);
      }
    });
  }
});

/**
 * The countdown is drawn on the picture area's own dark ground, which each theme may tint. White text
 * on it must stay readable under all five.
 */
describe('the countdown’s legibility', () => {
  /**
   * Relative luminance of a colour the browser has resolved, in `rgb()` or `color(srgb …)` form.
   * @param value The resolved colour.
   * @returns The luminance, zero to one.
   */
  function luminance(value: string): number {
    const numbers = (value.match(/[\d.]+/g) ?? []).map(Number);
    const channels = value.startsWith('color(') ? numbers.slice(0, 3).map((n) => n * 255) : numbers.slice(0, 3);
    const [r, g, b] = channels.map((channel) => {
      const unit = channel / 255;
      return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  }

  for (const theme of [undefined, 'umbraco', 'umbraco4', 'macos', 'win11', 'win98']) {
    it(`keeps its text readable on its ground (${theme ?? 'no theme'})`, async () => {
      const { element } = await mount(upcoming());
      if (theme) element.setAttribute('data-umbradesktop-theme', theme);
      await new Promise((resolve) => setTimeout(resolve));
      await settled(element);
      const style = getComputedStyle(find(element, '.hero')!);
      const [light, dark] = [luminance(style.color), luminance(style.backgroundColor)].sort((x, y) => y - x);
      expect((light! + 0.05) / (dark! + 0.05)).to.be.at.least(4.5);
    });
  }
});

describe('the theme attribute', () => {
  it('is copied onto the window’s own parts, so their theme blocks can match it, and follows a change', async () => {
    const { element } = await mount(live());
    element.setAttribute('data-umbradesktop-theme', 'win98');
    await new Promise((resolve) => setTimeout(resolve));
    await settled(element);
    await openSettings(element);
    for (const selector of ['umbradesktop-media-player', 'umbracoffee-chat', 'umbracoffee-episode-list', 'umbracoffee-settings']) {
      expect(find(element, selector)?.getAttribute('data-umbradesktop-theme'), selector).to.equal('win98');
    }
    element.removeAttribute('data-umbradesktop-theme');
    await new Promise((resolve) => setTimeout(resolve));
    await settled(element);
    expect(find(element, 'umbracoffee-chat')?.hasAttribute('data-umbradesktop-theme'), 'absent, not stale').to.equal(false);
  });

  it('reaches the countdown and the waiting bar too', async () => {
    const { element } = await mount(upcoming());
    element.setAttribute('data-umbradesktop-theme', 'macos');
    await new Promise((resolve) => setTimeout(resolve));
    await settled(element);
    for (const selector of ['umbracoffee-countdown', 'umbradesktop-control-bar']) {
      expect(find(element, selector)?.getAttribute('data-umbradesktop-theme'), selector).to.equal('macos');
    }
  });
});

describe('the store', () => {
  it('stops listening when the window closes', async () => {
    const { storeTimers, windowTimers, box } = await mount(answer());
    expect(storeTimers.count, 'polling while open').to.equal(1);
    expect(windowTimers.count, 'and ticking').to.equal(1);
    box.remove();
    expect(storeTimers.count, 'and neither after').to.equal(0);
    expect(windowTimers.count).to.equal(0);
  });

  it('needs no Umbraco session: it mounts and shows with nothing providing auth', async () => {
    const { element } = await mount(answer(), { desktop: false });
    expect(player(element)?.videoId).to.equal('v0');
  });

  it('falls back to the shipped snapshot when the very first fetch fails', async () => {
    const time = clock();
    const store = testStore(async () => ({}), timers(time));
    const element = document.createElement('umbracoffee-app');
    element.store = store;
    element.environment = timers(time);
    element.playerEngine = new FakeEngine();
    sizedBox(UMBRACOFFEE_CONTENT_SIZE).appendChild(element);
    await store.settled;
    await settled(element);
    expect(has(element, '.warn'), 'offline, with the snapshot to read').to.equal(true);
    expect(listRows(element).length).to.be.greaterThan(0);
  });
});
