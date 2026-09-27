import { expect } from '@open-wc/testing';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import type { DesktopLabelRequestModel, DesktopLabelResponseModel } from '../../api/types.gen';
import { UmbraDesktopLabelContext } from './desktop-label.context.js';
import type { UmbraDesktopLabelSource } from './desktop-label.context.js';

/**
 * The context is the label's one line to the server. What matters is what the desktop is left
 * holding: the label once it has read it, the server's own answer after a save rather than what was
 * sent, and nothing at all when the server cannot be reached. The label is an extra, and the
 * desktop must never fail to paint because of it.
 */

const LABEL: DesktopLabelResponseModel = { name: 'Contoso Staging', show: true, corner: 'TopRight', showDomain: false };

/** A stand-in server that records what it was asked and answers as told. */
class StandInSource implements UmbraDesktopLabelSource {
  /** How many times the label was read. */
  reads = 0;
  /** Every set of switches written, in order. */
  writes: DesktopLabelRequestModel[] = [];
  /** What the next read answers. */
  answer: () => Promise<DesktopLabelResponseModel | undefined> = async () => LABEL;
  /** Whether a write is accepted. */
  accept = true;

  /** @returns What {@link answer} says. */
  async read() {
    this.reads++;
    return this.answer();
  }

  /**
   * @param switches The switches to store.
   * @returns Whether they were accepted.
   */
  async write(switches: DesktopLabelRequestModel) {
    this.writes.push(switches);
    return this.accept;
  }
}

/** Let pending promise callbacks run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/**
 * The label the context holds right now.
 * @param context The context to ask.
 * @returns Its current label.
 */
function current(context: UmbraDesktopLabelContext): DesktopLabelResponseModel | null | undefined {
  let value: DesktopLabelResponseModel | null | undefined;
  context.label.subscribe((label) => (value = label)).unsubscribe();
  return value;
}

let host: UmbElementControllerHost;

beforeEach(() => {
  host = new UmbElementControllerHost(document.createElement('div'));
});

afterEach(() => host.destroy());

describe('the desktop label context', () => {
  it('reads the label as soon as it is created', async () => {
    const source = new StandInSource();
    const context = new UmbraDesktopLabelContext(host, source);
    await settle();

    expect(source.reads).to.equal(1);
    expect(current(context)).to.deep.equal(LABEL);
  });

  it('holds no label when the server has none to give', async () => {
    const source = new StandInSource();
    source.answer = async () => undefined;
    const context = new UmbraDesktopLabelContext(host, source);
    await settle();

    expect(current(context)).to.equal(null);
  });

  it('holds no label, and throws nothing, when the read fails outright', async () => {
    const source = new StandInSource();
    source.answer = () => Promise.reject(new Error('offline'));
    const context = new UmbraDesktopLabelContext(host, source);
    await settle();

    expect(current(context)).to.equal(null);
  });

  it('stores the switches, then holds what the server kept rather than what was sent', async () => {
    const source = new StandInSource();
    const context = new UmbraDesktopLabelContext(host, source);
    await settle();

    const kept: DesktopLabelResponseModel = { ...LABEL, corner: 'BottomLeft' };
    source.answer = async () => kept;
    const accepted = await context.save({ show: true, corner: 'BottomLeft', showDomain: false });

    expect(accepted).to.equal(true);
    expect(source.writes).to.deep.equal([{ show: true, corner: 'BottomLeft', showDomain: false }]);
    expect(source.reads).to.equal(2);
    expect(current(context)).to.deep.equal(kept);
  });

  it('reports a save the server refused, and still reads back what it has', async () => {
    const source = new StandInSource();
    source.accept = false;
    const context = new UmbraDesktopLabelContext(host, source);
    await settle();

    expect(await context.save({ show: false, corner: 'TopRight', showDomain: false })).to.equal(false);
    expect(source.reads).to.equal(2);
  });
});
