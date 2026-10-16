import { expect } from '@open-wc/testing';
import { ENGINE_EVENTS } from './engine.js';
import { loadYouTubeApi, YouTubeEngine } from './youtube-engine.js';
import { fakeYouTube } from './test-support.js';

/** How long the tests wait between polls; short so a case does not sit around. */
const POLL_MS = 10;

/** Resolve after a number of milliseconds. */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** An engine wired to a fake YouTube, plus a fresh host element to mount into. */
function setup() {
  const fake = fakeYouTube();
  const engine = new YouTubeEngine({ apiLoader: () => Promise.resolve(fake.yt), pollIntervalMs: POLL_MS });
  const host = document.createElement('div');
  document.body.append(host);
  return { fake, engine, host };
}

describe('youtube engine', () => {
  it('asks for a bare player: our controls only, in the privacy-friendly host, no fullscreen of its own', async () => {
    const { fake, engine, host } = setup();
    await engine.load(host, 'aRkc0fRxQjw', { autoplay: true });
    const player = fake.players[0];
    expect(player.options.videoId).to.equal('aRkc0fRxQjw');
    expect(player.options.host).to.equal('https://www.youtube-nocookie.com');
    expect(player.options.playerVars).to.deep.equal({
      controls: 0,
      rel: 0,
      playsinline: 1,
      modestbranding: 1,
      fs: 0,
      disablekb: 1,
      autoplay: 1,
      origin: location.origin,
    });
    engine.destroy();
    host.remove();
  });

  it('does not autoplay unless asked to', async () => {
    const { fake, engine, host } = setup();
    await engine.load(host, 'abc');
    expect(fake.players[0].options.playerVars?.autoplay).to.equal(0);
    engine.destroy();
    host.remove();
  });

  it('mounts the player inside the host it was given', async () => {
    const { fake, engine, host } = setup();
    await engine.load(host, 'abc');
    expect(host.contains(fake.players[0].target)).to.equal(true);
    engine.destroy();
    host.remove();
  });

  it("maps YouTube's numbers to our states and says so", async () => {
    const { fake, engine, host } = setup();
    await engine.load(host, 'abc');
    const seen: unknown[] = [];
    engine.addEventListener(ENGINE_EVENTS.stateChange, (event) => seen.push((event as CustomEvent).detail));
    for (const n of [3, 1, 3, 2, 0, -1, 5]) fake.players[0].fire(n);
    expect(seen).to.deep.equal(['playing', 'loading', 'paused', 'ended', 'idle']);
    expect(engine.state).to.equal('idle');
    engine.destroy();
    host.remove();
  });

  it('polls the time only while playing', async () => {
    const { fake, engine, host } = setup();
    await engine.load(host, 'abc');
    const player = fake.players[0];
    const times: number[] = [];
    engine.addEventListener(ENGINE_EVENTS.timeUpdate, (event) => times.push((event as CustomEvent).detail));

    player.time = 10;
    await wait(POLL_MS * 4);
    expect(player.timeReads).to.equal(0);

    player.fire(1);
    await wait(POLL_MS * 4);
    expect(engine.time).to.equal(10);
    expect(times).to.include(10);

    player.fire(2);
    const reads = player.timeReads;
    await wait(POLL_MS * 5);
    expect(player.timeReads).to.equal(reads);
    engine.destroy();
    host.remove();
  });

  it('reads how much of the video is loaded on the same poll as the time, and announces a change', async () => {
    const { fake, engine, host } = setup();
    await engine.load(host, 'abc');
    const player = fake.players[0];
    const seen: unknown[] = [];
    engine.addEventListener(ENGINE_EVENTS.bufferedChange, (event) => seen.push((event as CustomEvent).detail));
    expect(engine.buffered).to.equal(0);

    player.loaded = 0.4;
    player.fire(1);
    await wait(POLL_MS * 4);
    expect(engine.buffered).to.equal(0.4);
    expect(seen).to.deep.equal([0.4]);

    player.loaded = 7;
    await wait(POLL_MS * 4);
    expect(engine.buffered, 'kept inside zero to one').to.equal(1);
    expect(seen).to.deep.equal([0.4, 1]);
    engine.destroy();
    host.remove();
  });

  it('stops polling and destroys the player on destroy', async () => {
    const { fake, engine, host } = setup();
    await engine.load(host, 'abc');
    const player = fake.players[0];
    player.fire(1);
    await wait(POLL_MS * 3);
    engine.destroy();
    const reads = player.timeReads;
    await wait(POLL_MS * 5);
    expect(player.timeReads).to.equal(reads);
    expect(player.destroyed).to.equal(true);
    expect(engine.state).to.equal('idle');
    host.remove();
  });

  it('turns a failure to load the API into the error state rather than a throw', async () => {
    const engine = new YouTubeEngine({ apiLoader: () => Promise.reject(new Error('blocked')) });
    const host = document.createElement('div');
    const seen: unknown[] = [];
    engine.addEventListener(ENGINE_EVENTS.stateChange, (event) => seen.push((event as CustomEvent).detail));
    await engine.load(host, 'abc');
    expect(engine.state).to.equal('error');
    expect(seen).to.deep.equal(['loading', 'error']);
  });

  it('goes to the error state when the player itself reports an error', async () => {
    const { fake, engine, host } = setup();
    await engine.load(host, 'abc');
    fake.players[0].fail(150);
    expect(engine.state).to.equal('error');
    engine.destroy();
    host.remove();
  });

  it('reads the duration when the player is ready and says when it changes', async () => {
    const { fake, engine, host } = setup();
    await engine.load(host, 'abc');
    const seen: unknown[] = [];
    engine.addEventListener(ENGINE_EVENTS.durationChange, (event) => seen.push((event as CustomEvent).detail));
    fake.players[0].duration = 3019;
    fake.players[0].ready();
    expect(engine.duration).to.equal(3019);
    expect(seen).to.deep.equal([3019]);
    engine.destroy();
    host.remove();
  });

  it('passes play, pause and seek through and remembers where it seeked to', async () => {
    const { fake, engine, host } = setup();
    await engine.load(host, 'abc');
    const player = fake.players[0];
    engine.play();
    engine.pause();
    engine.seek(95);
    expect(player.calls).to.deep.equal(['playVideo', 'pauseVideo', 'seekTo:95:true']);
    expect(engine.time).to.equal(95);
    engine.destroy();
    host.remove();
  });

  it('keeps volume as zero to one and mute apart from it', async () => {
    const { fake, engine, host } = setup();
    await engine.load(host, 'abc');
    const player = fake.players[0];
    const seen: unknown[] = [];
    engine.addEventListener(ENGINE_EVENTS.volumeChange, () => seen.push(1));
    engine.setVolume(0.4);
    engine.setMuted(true);
    engine.setMuted(false);
    expect(player.calls).to.deep.equal(['setVolume:40', 'mute', 'unMute']);
    expect(engine.volume).to.equal(0.4);
    expect(engine.muted).to.equal(false);
    expect(seen.length).to.equal(3);
    engine.destroy();
    host.remove();
  });

  it('sets the speed through the player and says so', async () => {
    const { fake, engine, host } = setup();
    await engine.load(host, 'abc');
    const seen: unknown[] = [];
    engine.addEventListener(ENGINE_EVENTS.rateChange, (event) => seen.push((event as CustomEvent).detail));
    engine.setPlaybackRate(1.25);
    expect(fake.players[0].calls).to.deep.equal(['setPlaybackRate:1.25']);
    expect(engine.playbackRate).to.equal(1.25);
    expect(seen).to.deep.equal([1.25]);
    engine.destroy();
    host.remove();
  });

  it('follows a speed YouTube changes by itself, and reads it when the player is ready', async () => {
    const { fake, engine, host } = setup();
    await engine.load(host, 'abc');
    fake.players[0].rate = 2;
    fake.players[0].ready();
    expect(engine.playbackRate, 'read on ready').to.equal(2);
    fake.players[0].rateChanged(0.75);
    expect(engine.playbackRate, 'and on its own event').to.equal(0.75);
    engine.destroy();
    expect(engine.playbackRate, 'a destroyed engine is back at normal speed').to.equal(1);
    host.remove();
  });

  it('switches captions through the captions module', async () => {
    const { fake, engine, host } = setup();
    await engine.load(host, 'abc');
    engine.setCaptions(true);
    engine.setCaptions(false);
    expect(fake.players[0].calls).to.deep.equal(['loadModule:captions', 'unloadModule:captions']);
    engine.destroy();
    host.remove();
  });

  /*
   * The owner (2026-10-11) switched from a simulated live episode to a past one and the frame stayed
   * black. A real YT.Player has no methods until onReady, so a switch before then went to
   * cueVideoById, threw, and was swallowed; a player that never becomes ready (an id that is no
   * video, YouTube's sign-in wall) lost every switch after it. Before ready, the switch starts a
   * fresh player with the new video instead.
   */
  it('starts a fresh player for a switch made before the first one is ready', async () => {
    const { fake, engine, host } = setup();
    await engine.load(host, 'never-ready');
    await engine.load(host, 'past-episode');
    expect(fake.players.length, 'a second player, not a call on the first').to.equal(2);
    expect(fake.players[0].destroyed, 'the one that never got ready is let go').to.equal(true);
    expect(fake.players[1].options.videoId).to.equal('past-episode');
    expect(fake.players[0].calls.filter((c) => c.includes('VideoById'))).to.deep.equal([]);
    engine.destroy();
    host.remove();
  });

  it('reuses the player when the same host loads another video', async () => {
    const { fake, engine, host } = setup();
    await engine.load(host, 'one');
    fake.players[0].ready();
    await engine.load(host, 'two', { autoplay: true });
    await engine.load(host, 'three');
    expect(fake.players.length).to.equal(1);
    expect(fake.players[0].calls).to.deep.equal(['loadVideoById:two', 'cueVideoById:three']);
    engine.destroy();
    host.remove();
  });

  it('ignores controls before anything is loaded instead of throwing', () => {
    const engine = new YouTubeEngine({ apiLoader: () => Promise.reject(new Error('never')) });
    expect(() => {
      engine.play();
      engine.pause();
      engine.seek(3);
      engine.setVolume(0.5);
      engine.setMuted(true);
      engine.setCaptions(true);
      engine.setPlaybackRate(2);
      engine.destroy();
    }).not.to.throw();
  });

  it('uses the YT global that is already there rather than adding a script', async () => {
    const fake = fakeYouTube();
    const holder = window as unknown as { YT?: unknown };
    holder.YT = fake.yt;
    try {
      const yt = await loadYouTubeApi();
      expect(yt).to.equal(fake.yt);
      expect(document.querySelector('script[src*="youtube.com"]') === null).to.equal(true);
    } finally {
      delete holder.YT;
    }
  });
});
