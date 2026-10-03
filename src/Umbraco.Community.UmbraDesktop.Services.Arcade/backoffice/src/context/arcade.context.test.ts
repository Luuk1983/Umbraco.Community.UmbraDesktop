import { expect, fixture, html } from '@open-wc/testing';
import { UmbExtensionRegistry } from '@umbraco-cms/backoffice/extension-api';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { customElement } from '@umbraco-cms/backoffice/external/lit';
import { UmbraDesktopArcadeContext } from './arcade.context.js';
import type { ArcadeApi, ArcadeSubmitResult } from '../api/arcade-api.js';

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

/** An accepted result to vary. */
const accepted = (over: Partial<Extract<ArcadeSubmitResult, { status: 'accepted' }>> = {}): ArcadeSubmitResult => ({
  status: 'accepted', isPersonalBest: true, previousBest: null, rank: 2, isPublic: true, askedAboutPublic: true, displayName: 'Ada', ...over,
});

/** A fake API recording calls; each test sets what submit answers. */
function fakeApi(submit: ArcadeSubmitResult, beaten: Awaited<ReturnType<ArcadeApi['takeBeaten']>> = []) {
  const calls: string[] = [];
  const api: ArcadeApi = {
    getProfile: async () => ({ displayName: 'Ada', isPublic: true, notifyWhenBeaten: true, askedAboutPublic: true }),
    updateProfile: async (patch) => { calls.push(`update:${JSON.stringify(patch)}`); return { displayName: patch.displayName ?? 'Ada', isPublic: patch.isPublic ?? true, notifyWhenBeaten: true, askedAboutPublic: true }; },
    deleteProfile: async () => true,
    submit: async (game, board, value) => { calls.push(`submit:${game}:${board.alias}:${value}`); return submit; },
    getBoard: async () => undefined,
    getBest: async () => 300,
    takeBeaten: async () => { calls.push('takeBeaten'); return beaten; },
    removeScore: async () => true,
    resetBoard: async () => true,
    resetName: async () => true,
  };
  return { api, calls };
}

/** Build a context with fakes, returning what it asked and toasted. */
async function setup(submit: ArcadeSubmitResult, beaten: Awaited<ReturnType<ArcadeApi['takeBeaten']>> = [], answer?: { isPublic: boolean; displayName: string }) {
  const host = await fixture<TestHost>(html`<umbradesktop-arcade-context-test-host></umbradesktop-arcade-context-test-host>`);
  const registry = new UmbExtensionRegistry<UmbExtensionManifest>();
  registry.register(snakeGame as unknown as UmbExtensionManifest);
  const { api, calls } = fakeApi(submit, beaten);
  const asked: string[] = [];
  const toasts: Array<{ color: string; message: string }> = [];
  const context = new UmbraDesktopArcadeContext(host, {
    api,
    registry: registry as never,
    askPrivacy: async (_host, name) => { asked.push(name); return answer; },
    toast: (_host, color, message) => { toasts.push({ color, message }); },
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
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

it('takes beaten events once when created and toasts each as a warning', async () => {
  const { calls, toasts } = await setup(accepted(), [{ game: 'Pkg.Snake.Game', board: 'default', byDisplayName: 'Grace', value: 500, format: 'points' }]);
  expect(calls.filter((c) => c === 'takeBeaten')).to.have.length(1);
  expect(toasts).to.have.length(1);
  expect(toasts[0].color).to.equal('warning');
  expect(toasts[0].message).to.contain('Grace');
  expect(toasts[0].message).to.contain('Snake');
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
  const toasts: string[] = [];
  new UmbraDesktopArcadeContext(host, {
    api,
    registry: registry as never,
    askPrivacy: async () => undefined,
    toast: (_h, _c, message) => { toasts.push(message); },
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(toasts[0]).to.contain('Minesweeper, Hard');
  expect(toasts[0]).to.contain('1:05');
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
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
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
  const toasts: string[] = [];
  const context = new UmbraDesktopArcadeContext(host, {
    api,
    registry: registry as never,
    askPrivacy: async () => undefined,
    toast: (_h, _c, message) => { toasts.push(message); },
    gamesWaitMs,
  });
  return { context, registry, toasts };
}

it('names a beaten game by its label when the manifest registers late', async () => {
  const { registry, toasts } = await lateSetup();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(toasts).to.deep.equal([]);
  registry.register(snakeGame as unknown as UmbExtensionManifest);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(toasts).to.have.length(1);
  expect(toasts[0]).to.contain('Snake');
  expect(toasts[0]).to.not.contain('Pkg.Snake.Game');
});

it('falls back to the alias when no manifest registers within the wait', async () => {
  const { toasts } = await lateSetup(30);
  await new Promise((resolve) => setTimeout(resolve, 80));
  expect(toasts).to.have.length(1);
  expect(toasts[0]).to.contain('Pkg.Snake.Game');
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
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
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
  await new Promise((resolve) => setTimeout(resolve, 80));
  expect(toasts).to.deep.equal([]);
});
