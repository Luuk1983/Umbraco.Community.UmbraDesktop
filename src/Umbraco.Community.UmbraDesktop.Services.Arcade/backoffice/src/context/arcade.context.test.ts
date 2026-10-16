import { expect, fixture, html, waitUntil } from '@open-wc/testing';
import { UmbExtensionRegistry } from '@umbraco-cms/backoffice/extension-api';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { customElement } from '@umbraco-cms/backoffice/external/lit';
import { UmbraDesktopArcadeContext } from './arcade.context.js';
import type { ArcadeApi, ArcadeBoard, ArcadeSubmitResult } from '../api/arcade-api.js';

/** A bare element to host the context, as the desktop element does in production. */
@customElement('umbradesktop-arcade-context-test-host')
class TestHost extends UmbLitElement {}

/** The one game the fake registry holds. */
const snakeGame = {
  type: 'umbraDesktopGame',
  alias: 'Pkg.Snake.Game',
  name: 'Snake scores',
  meta: { app: 'Pkg.Snake', label: 'Snake', leaderboards: [{ alias: 'default', label: 'Snake', better: 'higher', format: 'points' }] },
};

/** Storage that keeps nothing, so a submit's remembered board never reaches the real localStorage other test files read. */
const quietStorage = () => ({ getItem: () => null, setItem: () => undefined }) as unknown as Storage;

/** An accepted result to vary. */
const accepted = (over: Partial<Extract<ArcadeSubmitResult, { status: 'accepted' }>> = {}): ArcadeSubmitResult => ({
  status: 'accepted', isPersonalBest: true, previousBest: null, rank: 2, isPublic: true, askedAboutPublic: true, displayName: 'Ada', passed: null, ...over,
});

/** The board the player sees after being beaten: Ada, 2nd with 480. What the beaten toast reads "your 480" and "2nd" from. */
const beatenBoard = (): ArcadeBoard | undefined => ({
  played: true,
  top: [],
  viewer: { rank: 2, userKey: 'k', displayName: 'Ada', value: 480, achievedAtUtc: '2026-10-03T09:00:00Z', isViewer: true },
  viewerIsPublic: true,
  canModerate: false,
  players: 3,
  above: null,
});

/** One toast as the fake records it, with the element and data the Arcade gave it. */
type RecordedToast = { color: string; message: string; element?: { name: string; data: unknown } };

/**
 * The beaten toast's headline, where the game's name is: the desktop shows it above the message.
 * @param toast A recorded toast.
 * @returns The headline, or undefined when the toast has none.
 */
const headlineOf = (toast: RecordedToast | undefined): string | undefined => (toast?.element?.data as { headline?: string } | undefined)?.headline;

/**
 * A fake API recording calls; each test sets what submit answers.
 * @param submit What submit answers.
 * @param beaten What the beaten check answers.
 * @param board What a board read answers.
 * @returns The API and the calls it saw.
 */
function fakeApi(submit: ArcadeSubmitResult, beaten: Awaited<ReturnType<ArcadeApi['takeBeaten']>> = [], board: () => ArcadeBoard | undefined = beatenBoard) {
  const calls: string[] = [];
  const api: ArcadeApi = {
    getProfile: async () => ({ displayName: 'Ada', isPublic: true, notifyWhenBeaten: true, askedAboutPublic: true }),
    updateProfile: async (patch) => { calls.push(`update:${JSON.stringify(patch)}`); return { displayName: patch.displayName ?? 'Ada', isPublic: patch.isPublic ?? true, notifyWhenBeaten: true, askedAboutPublic: true }; },
    deleteProfile: async () => true,
    submit: async (game, board, value) => { calls.push(`submit:${game}:${board.alias}:${value}`); return submit; },
    getBoard: async () => board(),
    getOverview: async () => ({ colleagues: 0, boards: [] }),
    getBest: async () => 300,
    takeBeaten: async () => { calls.push('takeBeaten'); return beaten; },
    removeScore: async () => true,
    resetBoard: async () => true,
    resetName: async () => true,
  };
  return { api, calls };
}

/**
 * Build a context with fakes, returning what it asked and toasted.
 * @param submit What submit answers.
 * @param beaten What the beaten check answers.
 * @param answer What the one-time question answers.
 * @param board What a board read answers.
 * @param lang The backoffice language, as the host's `lang`.
 * @returns The context and what it did.
 */
async function setup(
  submit: ArcadeSubmitResult,
  beaten: Awaited<ReturnType<ArcadeApi['takeBeaten']>> = [],
  answer?: { isPublic: boolean; displayName: string },
  board?: () => ArcadeBoard | undefined,
  lang = 'en',
) {
  // `lang="en"` pins the ordinals: without it the localizer takes the browser's language, so "2nd" fails on a Dutch machine.
  const host = await fixture<TestHost>(html`<umbradesktop-arcade-context-test-host lang=${lang}></umbradesktop-arcade-context-test-host>`);
  const registry = new UmbExtensionRegistry<UmbExtensionManifest>();
  registry.register(snakeGame as unknown as UmbExtensionManifest);
  const { api, calls } = fakeApi(submit, beaten, board);
  const asked: string[] = [];
  const toasts: RecordedToast[] = [];
  const context = new UmbraDesktopArcadeContext(host, {
    api,
    registry: registry as never,
    askPrivacy: async (_host, name) => { asked.push(name); return answer; },
    toast: (_host, color, message, element) => { toasts.push({ color, message, element }); },
    storage: quietStorage,
  });
  // The manifest registers asynchronously; a submit before it does is ignored as an unknown game.
  await waitUntil(() => context.getGames().length > 0, 'game registered');
  return { context, calls, asked, toasts };
}

it('submits to the game and board it is told, and toasts a personal best', async () => {
  const { context, calls, toasts } = await setup(accepted());
  const result = await context.submit('Pkg.Snake.Game', 'default', 300);
  expect(calls).to.include('submit:Pkg.Snake.Game:default:300');
  expect(result?.status).to.equal('accepted');
  expect(toasts).to.have.length(1);
  expect(toasts[0].color).to.equal('positive');
  expect(toasts[0].message).to.contain('Snake');
  expect(toasts[0].message).to.contain('300');
});

it('stays quiet for a score that is not a best', async () => {
  const { context, toasts } = await setup(accepted({ isPersonalBest: false }));
  await context.submit('Pkg.Snake.Game', 'default', 100);
  expect(toasts).to.deep.equal([]);
});

it('asks the one-time question after the first score and saves the answer', async () => {
  const { context, asked, calls } = await setup(accepted({ askedAboutPublic: false, isPublic: false }), [], { isPublic: true, displayName: 'Ace' });
  await context.submit('Pkg.Snake.Game', 'default', 300);
  expect(asked).to.deep.equal(['Ada']);
  expect(calls).to.include('update:{"isPublic":true,"displayName":"Ace"}');
});

it('does not ask once answered', async () => {
  const { context, asked } = await setup(accepted());
  await context.submit('Pkg.Snake.Game', 'default', 300);
  expect(asked).to.deep.equal([]);
});

it('submits nothing for a game or board it does not know', async () => {
  const { context, calls } = await setup(accepted());
  expect(await context.submit('Pkg.Unknown', 'default', 1)).to.equal(undefined);
  expect(await context.submit('Pkg.Snake.Game', 'nope', 1)).to.equal(undefined);
  expect(calls.filter((c) => c.startsWith('submit'))).to.deep.equal([]);
});

/** Bram took first place on Snake with 510. */
const bramOnSnake = { game: 'Pkg.Snake.Game', board: 'default', byDisplayName: 'Bram', value: 510, format: 'points' as const };

it('takes beaten events once when created and toasts each as a warning naming both scores, with its own element', async () => {
  const { calls, toasts } = await setup(accepted(), [bramOnSnake]);
  // The beaten check reads the board too, which can finish after setup has seen the game register.
  await waitUntil(() => toasts.length > 0, 'no beaten toast');
  expect(calls.filter((c) => c === 'takeBeaten')).to.have.length(1);
  expect(toasts).to.have.length(1);
  expect(toasts[0].color).to.equal('warning');
  expect(toasts[0].message).to.contain('510 beats your 480').and.contain('You are 2nd now');
  expect(toasts[0].element?.name).to.equal('umbradesktop-arcade-beaten-toast');
  expect(toasts[0].element?.data).to.deep.include({ headline: 'Bram took first place from you on Snake', game: 'Pkg.Snake.Game', board: 'default' });
});

it('writes the numbers in its toasts in the backoffice language, not the browser\'s', async () => {
  // Swiss German groups thousands with an apostrophe, which neither an English nor a Dutch browser does.
  const swiss = (value: number) => value.toLocaleString('de-CH');
  expect(swiss(1_510)).to.not.equal((1_510).toLocaleString());
  const board = () => ({ ...beatenBoard()!, viewer: { ...beatenBoard()!.viewer!, value: 1_480 } });
  const { context, toasts } = await setup(accepted(), [{ ...bramOnSnake, value: 1_510 }], undefined, board, 'de-CH');
  await waitUntil(() => toasts.length > 0, 'no beaten toast');
  expect(toasts[0].message).to.contain(`${swiss(1_510)} beats your ${swiss(1_480)}`);
  await context.submit('Pkg.Snake.Game', 'default', 1_520);
  expect(toasts[1].message).to.contain(swiss(1_520));
});

it('says only the winning score when the player no longer has one on the board', async () => {
  const { toasts } = await setup(accepted(), [bramOnSnake], undefined, () => undefined);
  await waitUntil(() => toasts.length > 0, 'no beaten toast');
  expect(toasts).to.have.length(1);
  expect(toasts[0].message).to.equal('With 510. Select to open the leaderboard.');
});

it('reads a best through to the server', async () => {
  const { context } = await setup(accepted());
  expect(await context.getBest('Pkg.Snake.Game', 'default')).to.equal(300);
});

it('can be destroyed twice, as Umbraco does', async () => {
  const { context } = await setup(accepted());
  context.destroy();
  expect(() => context.destroy()).to.not.throw();
});

it('says the game name with its board when the game has several', async () => {
  const host = await fixture<TestHost>(html`<umbradesktop-arcade-context-test-host></umbradesktop-arcade-context-test-host>`);
  const registry = new UmbExtensionRegistry<UmbExtensionManifest>();
  registry.register({
    type: 'umbraDesktopGame',
    alias: 'Pkg.Mines',
    name: 'Mines',
    meta: {
      app: 'Pkg.Mines.App',
      label: 'Minesweeper',
      leaderboards: [
        { alias: 'easy', label: 'Easy', better: 'lower', format: 'time' },
        { alias: 'hard', label: 'Hard', better: 'lower', format: 'time' },
      ],
    },
  } as unknown as UmbExtensionManifest);
  const { api } = fakeApi(accepted(), [{ game: 'Pkg.Mines', board: 'hard', byDisplayName: 'Grace', value: 65_000, format: 'time' }]);
  const toasts: RecordedToast[] = [];
  new UmbraDesktopArcadeContext(host, {
    api,
    registry: registry as never,
    askPrivacy: async () => undefined,
    toast: (_h, color, message, element) => { toasts.push({ color, message, element }); },
  });
  await waitUntil(() => toasts.length > 0, 'no beaten toast');
  expect(headlineOf(toasts[0])).to.contain('Minesweeper, Hard');
  expect(toasts[0].message).to.contain('1:05');
});

it('still toasts nothing when the notification toast itself cannot be raised', async () => {
  const host = await fixture<TestHost>(html`<umbradesktop-arcade-context-test-host></umbradesktop-arcade-context-test-host>`);
  const registry = new UmbExtensionRegistry<UmbExtensionManifest>();
  registry.register(snakeGame as unknown as UmbExtensionManifest);
  const { api } = fakeApi(accepted());
  const context = new UmbraDesktopArcadeContext(host, {
    api,
    registry: registry as never,
    askPrivacy: async () => undefined,
    toast: () => { throw new Error('no notification context'); },
    storage: quietStorage,
  });
  await waitUntil(() => context.getGames().length > 0, 'game registered');
  const result = await context.submit('Pkg.Snake.Game', 'default', 300);
  expect(result?.status).to.equal('accepted');
});

it('asks the one-time question once when two first scores are submitted together', async () => {
  const { context, asked, calls } = await setup(accepted({ askedAboutPublic: false, isPublic: false }), [], { isPublic: true, displayName: 'Ace' });
  await Promise.all([context.submit('Pkg.Snake.Game', 'default', 300), context.submit('Pkg.Snake.Game', 'default', 400)]);
  expect(asked).to.deep.equal(['Ada']);
  expect(calls.filter((c) => c.startsWith('update'))).to.have.length(1);
});

it('asks again on the next score when the dialog was closed without an answer', async () => {
  const { context, asked } = await setup(accepted({ askedAboutPublic: false, isPublic: false }), [], undefined);
  await context.submit('Pkg.Snake.Game', 'default', 300);
  await context.submit('Pkg.Snake.Game', 'default', 400);
  expect(asked).to.deep.equal(['Ada', 'Ada']);
});

/** A registry holding no game yet, a context over it, and what it toasted. */
async function lateSetup(gamesWaitMs?: number) {
  const host = await fixture<TestHost>(html`<umbradesktop-arcade-context-test-host></umbradesktop-arcade-context-test-host>`);
  const registry = new UmbExtensionRegistry<UmbExtensionManifest>();
  const { api } = fakeApi(accepted(), [{ game: 'Pkg.Snake.Game', board: 'default', byDisplayName: 'Grace', value: 500, format: 'points' }]);
  const toasts: RecordedToast[] = [];
  const context = new UmbraDesktopArcadeContext(host, {
    api,
    registry: registry as never,
    askPrivacy: async () => undefined,
    toast: (_h, color, message, element) => { toasts.push({ color, message, element }); },
    gamesWaitMs,
  });
  return { context, registry, toasts };
}

it('names a beaten game by its label when the manifest registers late', async () => {
  const { registry, toasts } = await lateSetup();
  // A fixed wait on purpose: this checks that nothing happens yet, and there is no event for that.
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(toasts).to.deep.equal([]);
  registry.register(snakeGame as unknown as UmbExtensionManifest);
  await waitUntil(() => toasts.length > 0, 'no beaten toast');
  expect(toasts).to.have.length(1);
  expect(headlineOf(toasts[0])).to.contain('Snake');
  expect(headlineOf(toasts[0])).to.not.contain('Pkg.Snake.Game');
});

it('falls back to the alias when no manifest registers within the wait', async () => {
  const { toasts } = await lateSetup(30);
  await waitUntil(() => toasts.length > 0, 'no beaten toast');
  expect(toasts).to.have.length(1);
  expect(headlineOf(toasts[0])).to.contain('Pkg.Snake.Game');
});

it('neither toasts nor asks when destroyed before a submit finishes', async () => {
  const host = await fixture<TestHost>(html`<umbradesktop-arcade-context-test-host></umbradesktop-arcade-context-test-host>`);
  const registry = new UmbExtensionRegistry<UmbExtensionManifest>();
  registry.register(snakeGame as unknown as UmbExtensionManifest);
  const { api } = fakeApi(accepted({ askedAboutPublic: false }));
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const original = api.submit;
  api.submit = async (g, b, v) => { await gate; return original(g, b, v); };
  const asked: string[] = [];
  const toasts: string[] = [];
  const context = new UmbraDesktopArcadeContext(host, {
    api,
    registry: registry as never,
    askPrivacy: async (_h, name) => { asked.push(name); return undefined; },
    toast: (_h, _c, message) => { toasts.push(message); },
    storage: quietStorage,
  });
  await waitUntil(() => context.getGames().length > 0, 'game registered');
  const pending = context.submit('Pkg.Snake.Game', 'default', 300);
  context.destroy();
  release();
  await pending;
  expect(asked).to.deep.equal([]);
  expect(toasts).to.deep.equal([]);
});

it('neither toasts nor keeps waiting when destroyed before the beaten check finishes', async () => {
  const { context, toasts } = await lateSetup(30);
  context.destroy();
  // A fixed wait on purpose, past the 30 ms games wait: this checks that nothing happens, and there is no event for that.
  await new Promise((resolve) => setTimeout(resolve, 80));
  expect(toasts).to.deep.equal([]);
});
