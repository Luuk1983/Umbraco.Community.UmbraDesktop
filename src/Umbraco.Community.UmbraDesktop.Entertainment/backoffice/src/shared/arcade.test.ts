import { expect, fixture, html } from '@open-wc/testing';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { customElement } from '@umbraco-cms/backoffice/external/lit';
import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { ArcadeScores, ARCADE_CONTEXT } from './arcade.js';

/** Stands in for the desktop: the element that provides the Arcade's context. */
@customElement('umbradesktop-entertainment-arcade-test-host')
class Host extends UmbLitElement {}

/** Stands in for a game element, which asks for the Arcade from below the provider. */
@customElement('umbradesktop-entertainment-arcade-test-game')
class Game extends UmbLitElement {}

/** Mounts a game inside a host, so the host can provide the Arcade's context. */
async function mount(): Promise<{ host: Host; game: Game }> {
  const host = await fixture<Host>(
    html`<umbradesktop-entertainment-arcade-test-host><umbradesktop-entertainment-arcade-test-game></umbradesktop-entertainment-arcade-test-game></umbradesktop-entertainment-arcade-test-host>`,
  );
  return { host, game: host.querySelector('umbradesktop-entertainment-arcade-test-game') as Game };
}

/**
 * A stand-in Arcade. Umbraco 17's `provideContext` calls `getHostElement()` on what it is given, so
 * a plain object cannot be provided; the stand-in has to be a controller like the real context.
 */
class FakeArcade extends UmbControllerBase {
  /** Records what a game submitted. */
  calls: unknown[] = [];

  /**
   * @param host The element that owns the stand-in.
   * @param behaviour What `submit`, `getBest` and, when a test needs one, `getStanding` do.
   */
  constructor(
    host: UmbControllerHost,
    private readonly behaviour: { submit: (...args: unknown[]) => Promise<unknown>; getBest: () => Promise<unknown>; getStanding?: () => Promise<unknown> },
  ) {
    super(host);
  }

  /** @param args Game, board, value. @returns Whatever the test set up. */
  submit(...args: unknown[]) {
    this.calls.push(args);
    return this.behaviour.submit(...args);
  }

  /** @returns Whatever the test set up. */
  getBest() {
    return this.behaviour.getBest();
  }

  /** @returns Whatever the test set up, or undefined (no standing) when the test set up nothing. */
  getStanding() {
    return this.behaviour.getStanding?.() ?? Promise.resolve(undefined);
  }
}

describe('ArcadeScores', () => {
  it('does nothing, and says so, without the Arcade', async () => {
    const game = await fixture<Game>(html`<umbradesktop-entertainment-arcade-test-game></umbradesktop-entertainment-arcade-test-game>`);
    const scores = new ArcadeScores(game, 'Pkg.Snake.Game');
    expect(await scores.submit('default', 10)).to.equal(undefined);
    expect(await scores.best('default')).to.equal(undefined);
  });

  it('answers at once without the Arcade, even in a tab where animation frames never run', async () => {
    // A hidden tab runs no animation frames, and Umbraco's getContext only gives up on a frame.
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = () => 0;
    try {
      const game = await fixture<Game>(html`<umbradesktop-entertainment-arcade-test-game></umbradesktop-entertainment-arcade-test-game>`);
      const scores = new ArcadeScores(game, 'Pkg.Snake.Game');
      const late = new Promise((resolve) => setTimeout(() => resolve('late'), 2000));
      expect(await Promise.race([scores.submit('default', 10), late])).to.equal(undefined);
    } finally {
      window.requestAnimationFrame = raf;
    }
  });

  it('submits through the Arcade when it is there', async () => {
    const { host, game } = await mount();
    const arcade = new FakeArcade(host, { submit: async () => ({ status: 'accepted' }), getBest: async () => 300 });
    host.provideContext(ARCADE_CONTEXT, arcade as never);
    const scores = new ArcadeScores(game, 'Pkg.Snake.Game');
    const accepted = (await scores.submit('default', 10)) as { status: string } | undefined;
    expect(accepted?.status).to.equal('accepted');
    expect(arcade.calls).to.deep.equal([['Pkg.Snake.Game', 'default', 10, {}]]);
    expect(await scores.best('default')).to.equal(300);
  });

  it('reports a rejected score as not taken, and an unplayed board as no best', async () => {
    const { host, game } = await mount();
    host.provideContext(ARCADE_CONTEXT, new FakeArcade(host, { submit: async () => ({ status: 'rejected' }), getBest: async () => null }) as never);
    const scores = new ArcadeScores(game, 'Pkg.Snake.Game');
    expect(await scores.submit('default', 10)).to.equal(undefined);
    expect(await scores.best('default')).to.equal(undefined);
  });

  it('finds an Arcade that arrives after the game opened', async () => {
    const { host, game } = await mount();
    const scores = new ArcadeScores(game, 'Pkg.Snake.Game');
    const pending = scores.best('default');
    host.provideContext(ARCADE_CONTEXT, new FakeArcade(host, { submit: async () => ({ status: 'accepted' }), getBest: async () => 42 }) as never);
    expect(await pending).to.equal(42);
  });

  it('survives an Arcade that throws', async () => {
    const { host, game } = await mount();
    const boom = async () => {
      throw new Error('boom');
    };
    host.provideContext(ARCADE_CONTEXT, new FakeArcade(host, { submit: boom, getBest: boom }) as never);
    const scores = new ArcadeScores(game, 'Pkg.Snake.Game');
    expect(await scores.submit('default', 10)).to.equal(undefined);
    expect(await scores.best('default')).to.equal(undefined);
    expect(await scores.standing('default')).to.equal(undefined);
  });

  it('hands back the accepted result and passes the options through', async () => {
    const { host, game } = await mount();
    const accepted = { status: 'accepted', isPersonalBest: true, rank: 2, rankText: '2nd', value: 310 };
    const arcade = new FakeArcade(host, { submit: async () => accepted, getBest: async () => null });
    host.provideContext(ARCADE_CONTEXT, arcade as never);
    const scores = new ArcadeScores(game, 'Pkg.Snake.Game');
    expect(await scores.submit('default', 310, { showsResult: true })).to.equal(accepted);
    expect(arcade.calls).to.deep.equal([['Pkg.Snake.Game', 'default', 310, { showsResult: true }]]);
  });

  it('answers undefined for a refused score', async () => {
    const { host, game } = await mount();
    host.provideContext(ARCADE_CONTEXT, new FakeArcade(host, { submit: async () => ({ status: 'rejected' }), getBest: async () => null }) as never);
    expect(await new ArcadeScores(game, 'Pkg.Snake.Game').submit('default', 0)).to.equal(undefined);
  });

  it('reads a standing, and says whether the Arcade is there', async () => {
    const { host, game } = await mount();
    const standing = { best: 480, rank: 1, rankText: '1st' };
    host.provideContext(ARCADE_CONTEXT, new FakeArcade(host, { submit: async () => undefined, getBest: async () => 480, getStanding: async () => standing }) as never);
    const scores = new ArcadeScores(game, 'Pkg.Snake.Game');
    expect(await scores.standing('default')).to.equal(standing);
    expect(await scores.reachable()).to.equal(true);
  });

  it('has no standing and is not reachable without the Arcade', async () => {
    const lone = await fixture<Game>(html`<umbradesktop-entertainment-arcade-test-game></umbradesktop-entertainment-arcade-test-game>`);
    const scores = new ArcadeScores(lone, 'Pkg.Snake.Game');
    expect(await scores.standing('default')).to.equal(undefined);
    expect(await scores.reachable()).to.equal(false);
  });
});
