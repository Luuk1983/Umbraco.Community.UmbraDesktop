import { expect, fixture, html, waitUntil } from '@open-wc/testing';
import { UmbExtensionRegistry } from '@umbraco-cms/backoffice/extension-api';
import { customElement } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import type { ArcadeApi, ArcadeBoard, ArcadeSubmitResult } from '../api/arcade-api.js';
import { UmbraDesktopArcadeContext } from './arcade.context.js';

/** Hosts the context, as the desktop element does. */
@customElement('umbradesktop-arcade-pieces-test-host')
class TestHost extends UmbLitElement {}

/** A game with two boards, so a remembered board can differ from the first. */
const game = {
  type: 'umbraDesktopGame', alias: 'Pkg.Snake.Game', name: 'Snake scores',
  meta: { app: 'Pkg.Snake', label: 'Snake', leaderboards: [{ alias: 'default', label: 'Classic', better: 'higher', format: 'points' }, { alias: 'fast', label: 'Fast', better: 'higher', format: 'points' }] },
};

/** A first, hidden score at 3rd, with the question still open: the result to vary. */
const accepted = (over: Partial<Extract<ArcadeSubmitResult, { status: 'accepted' }>> = {}): ArcadeSubmitResult => ({
  status: 'accepted', isPersonalBest: true, previousBest: null, rank: 3, isPublic: false, askedAboutPublic: false, displayName: 'Ada', passed: null, ...over,
});

/** Builds a context over fakes and in-memory storage; records what it asked, toasted and saved. */
async function setup(submit: ArcadeSubmitResult, board?: ArcadeBoard) {
  // `lang="en"` pins the ordinals: without it the localizer takes the browser's language, so "3rd" fails on a Dutch machine.
  const host = await fixture<TestHost>(html`<umbradesktop-arcade-pieces-test-host lang="en"></umbradesktop-arcade-pieces-test-host>`);
  const registry = new UmbExtensionRegistry<UmbExtensionManifest>();
  registry.register(game as unknown as UmbExtensionManifest);
  const calls: string[] = [];
  const memory = new Map<string, string>();
  const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => void memory.set(key, value) } as Storage;
  const api: ArcadeApi = {
    getProfile: async () => undefined,
    updateProfile: async (patch) => { calls.push(`update:${JSON.stringify(patch)}`); return { displayName: 'Ada', isPublic: patch.isPublic ?? false, notifyWhenBeaten: true, askedAboutPublic: true }; },
    deleteProfile: async () => true,
    submit: async () => submit,
    getBoard: async () => board,
    getOverview: async () => ({ colleagues: 2, boards: [] }),
    getBest: async () => null,
    takeBeaten: async () => [],
    removeScore: async () => true,
    resetBoard: async () => true,
    resetName: async () => true,
  };
  const asked: string[] = [];
  const toasts: string[] = [];
  const context = new UmbraDesktopArcadeContext(host, {
    api,
    registry: registry as never,
    askPrivacy: async (_host, name) => { asked.push(name); return { isPublic: true, displayName: name }; },
    toast: (_host, _color, message) => { toasts.push(message); },
    storage: () => storage,
  });
  // The manifest registers asynchronously; a submit before it does is ignored as an unknown game.
  await waitUntil(() => context.getGames().length > 0, 'game registered');
  return { context, calls, asked, toasts, memory };
}

it('leaves the asking and the toast to a game that shows the result card, and hands back what the card needs', async () => {
  const { context, asked, toasts } = await setup(accepted());
  const result = await context.submit('Pkg.Snake.Game', 'default', 310, { showsResult: true });
  expect(asked).to.deep.equal([]);
  expect(toasts).to.deep.equal([]);
  expect(result).to.include({ status: 'accepted', game: 'Pkg.Snake.Game', board: 'default', value: 310, rank: 3, rankText: '3rd' });
});

it('still asks and toasts for a game that shows no card (design P3)', async () => {
  const { context, asked, toasts } = await setup(accepted());
  await context.submit('Pkg.Snake.Game', 'default', 310);
  expect(asked).to.have.length(1);
  expect(toasts).to.have.length(1);
});

it('remembers the board last played per game', async () => {
  const { context } = await setup(accepted());
  expect(context.lastBoard('Pkg.Snake.Game')).to.equal(undefined);
  await context.submit('Pkg.Snake.Game', 'fast', 310, { showsResult: true });
  expect(context.lastBoard('Pkg.Snake.Game')).to.equal('fast');
});

it('saves the answer from a card, and a later fallback submit does not ask again', async () => {
  const { context, calls, asked } = await setup(accepted());
  expect(await context.setScoresShown(true)).to.equal(true);
  expect(calls).to.include('update:{"isPublic":true}');
  await context.submit('Pkg.Snake.Game', 'default', 310);
  expect(asked).to.deep.equal([]);
});

it('hands a card the answer already given this visit, not a stale result that would ask again', async () => {
  // The server read the question as open before the card's answer was saved.
  const { context } = await setup(accepted({ askedAboutPublic: false, isPublic: false }));
  await context.setScoresShown(true);
  const result = await context.submit('Pkg.Snake.Game', 'default', 310, { showsResult: true });
  expect(result).to.include({ askedAboutPublic: true, isPublic: true });
});

it('reads a standing for a game\'s own display, with the rank in words', async () => {
  const viewer = { rank: 1, userKey: 'k', displayName: 'Ada', value: 480, achievedAtUtc: '2026-10-03T09:00:00Z', isViewer: true };
  const played = await setup(accepted(), { played: true, top: [viewer], viewer, viewerIsPublic: true, canModerate: false, players: 1, above: null });
  expect(await played.context.getStanding('Pkg.Snake.Game', 'default')).to.deep.equal({ best: 480, rank: 1, rankText: '1st' });
  const unplayed = await setup(accepted(), { played: false, top: [], viewer: null, viewerIsPublic: false, canModerate: false, players: 0, above: null });
  expect(await unplayed.context.getStanding('Pkg.Snake.Game', 'default')).to.equal(null);
  const unreachable = await setup(accepted());
  expect(await unreachable.context.getStanding('Pkg.Snake.Game', 'default')).to.equal(undefined);
});

it('says the scores changed after every write that changes a board, so an open hub reads again', async () => {
  const { context } = await setup(accepted());
  const seen: number[] = [];
  context.scoresChanged.subscribe((n) => seen.push(n));
  /** How many times it has said so since subscribing. */
  const changes = () => new Set(seen).size - 1;
  await context.submit('Pkg.Snake.Game', 'default', 310, { showsResult: true });
  expect(changes(), 'after a submit').to.equal(1);
  await context.setScoresShown(false);
  await context.removeScore('Pkg.Snake.Game', 'default', 'k');
  await context.resetBoard('Pkg.Snake.Game', 'default');
  await context.resetName('k');
  await context.deleteMyScores();
  expect(changes(), 'after each change to a board').to.equal(6);
});

it('does not say the scores changed for a submit the server turned away', async () => {
  const { context } = await setup({ status: 'rejected' } as ArcadeSubmitResult);
  const seen: number[] = [];
  context.scoresChanged.subscribe((n) => seen.push(n));
  await context.submit('Pkg.Snake.Game', 'default', 310, { showsResult: true });
  expect(seen.length).to.equal(1);
});

it('passes the overview through', async () => {
  const { context } = await setup(accepted());
  expect(await context.getOverview()).to.deep.equal({ colleagues: 2, boards: [] });
});
