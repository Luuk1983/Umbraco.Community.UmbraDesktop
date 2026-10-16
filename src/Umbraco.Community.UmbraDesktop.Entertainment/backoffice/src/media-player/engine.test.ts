import { expect } from '@open-wc/testing';
import { ENGINE_EVENTS } from './engine.js';
import { FakeEngine } from './test-support.js';

/** Collect the detail of every event of one type an engine fires. */
function record(engine: FakeEngine, type: string): unknown[] {
  const seen: unknown[] = [];
  engine.addEventListener(type, (event) => seen.push((event as CustomEvent).detail));
  return seen;
}

describe('player engine contract (as the fake keeps it)', () => {
  it('names the six events the control bar listens for', () => {
    expect(ENGINE_EVENTS).to.deep.equal({
      stateChange: 'statechange',
      timeUpdate: 'timeupdate',
      volumeChange: 'volumechange',
      durationChange: 'durationchange',
      rateChange: 'ratechange',
      bufferedChange: 'bufferedchange',
    });
  });

  it('starts idle, at zero, at full volume and unmuted', () => {
    const engine = new FakeEngine();
    expect(engine.state).to.equal('idle');
    expect(engine.time).to.equal(0);
    expect(engine.duration).to.equal(0);
    expect(engine.volume).to.equal(1);
    expect(engine.muted).to.equal(false);
    expect(engine.playbackRate, 'at normal speed').to.equal(1);
    expect(engine.buffered, 'nothing loaded ahead yet').to.equal(0);
  });

  it('reports a state change to whoever listens, carrying the new state', () => {
    const engine = new FakeEngine();
    const seen = record(engine, ENGINE_EVENTS.stateChange);
    engine.play();
    engine.pause();
    expect(seen).to.deep.equal(['playing', 'paused']);
  });

  it('reports seeks, volume and mute as events too', () => {
    const engine = new FakeEngine();
    const times = record(engine, ENGINE_EVENTS.timeUpdate);
    const volumes = record(engine, ENGINE_EVENTS.volumeChange);
    engine.seek(42);
    engine.setVolume(0.25);
    engine.setMuted(true);
    expect(times).to.deep.equal([42]);
    expect(volumes.length).to.equal(2);
    expect(engine.volume).to.equal(0.25);
    expect(engine.muted).to.equal(true);
  });

  it('reports a change of speed, carrying the new rate', () => {
    const engine = new FakeEngine();
    const rates = record(engine, ENGINE_EVENTS.rateChange);
    engine.setPlaybackRate(1.5);
    expect(rates).to.deep.equal([1.5]);
    expect(engine.playbackRate).to.equal(1.5);
  });

  it('forgets everything on destroy', () => {
    const engine = new FakeEngine();
    engine.play();
    engine.destroy();
    expect(engine.state).to.equal('idle');
    expect(engine.destroyCalls).to.equal(1);
  });
});
