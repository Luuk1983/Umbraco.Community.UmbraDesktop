import { expect } from '@open-wc/testing';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import './desktop-label-settings.element.js';
import type { UmbraDesktopSettingsDesktopLabelElement } from './desktop-label-settings.element.js';
import type { DesktopLabelRequestModel, DesktopLabelResponseModel } from '../../../../api/types.gen';
import { UmbraDesktopLabelContext } from '../../../desktop-label/desktop-label.context.js';
import type { UmbraDesktopLabelSource } from '../../../desktop-label/desktop-label.context.js';

/**
 * The three controls behind the desktop label, driven through a real label context over a stand-in
 * server. Each control changes one switch, and what matters is that the save carries the other two
 * as they were: the server stores all three at once, so a control that sent only its own would
 * quietly reset the rest.
 */

/** A stand-in server that answers with a given label and records every save. */
class StandInSource implements UmbraDesktopLabelSource {
  /** Every set of switches written, in order. */
  writes: DesktopLabelRequestModel[] = [];

  /**
   * @param answer What every read answers.
   */
  constructor(public answer: () => Promise<DesktopLabelResponseModel | undefined>) {}

  /** @returns What {@link answer} says. */
  read() {
    return this.answer();
  }

  /**
   * @param switches The switches to store.
   * @returns Always accepted.
   */
  async write(switches: DesktopLabelRequestModel) {
    this.writes.push(switches);
    return true;
  }
}

/** Let pending promise callbacks run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

let wrapper: HTMLElement;
let host: UmbElementControllerHost;

afterEach(() => {
  host?.destroy();
  wrapper?.remove();
});

/**
 * Mount the controls under a label context that reads the given label.
 * @param label What the stand-in server holds, or a promise that never settles for "not loaded".
 * @returns The controls, and the stand-in server behind them.
 */
async function mount(label: DesktopLabelResponseModel | 'never') {
  wrapper = document.createElement('div');
  document.body.appendChild(wrapper);
  host = new UmbElementControllerHost(wrapper);

  const source = new StandInSource(() =>
    label === 'never' ? new Promise<undefined>(() => {}) : Promise.resolve(label),
  );
  // Provided on the wrapper, as the desktop provides it to the settings modal at runtime. A bare
  // controller host does not connect its controllers by itself, so the provider is connected by
  // hand, as `desktop-chrome.test.ts` connects its own.
  new UmbraDesktopLabelContext(host, source);
  host.hostConnected();

  const element = document.createElement('umbradesktop-settings-desktop-label') as UmbraDesktopSettingsDesktopLabelElement;
  wrapper.appendChild(element);
  await settle();
  await element.updateComplete;
  return { element, source };
}

/**
 * Flip a toggle as a person would, and let the save go through.
 * @param toggle The toggle to flip.
 * @param checked Its new state.
 */
async function flip(toggle: Element, checked: boolean): Promise<void> {
  (toggle as HTMLInputElement).checked = checked;
  toggle.dispatchEvent(new Event('change'));
  await settle();
}

const OFF: DesktopLabelResponseModel = { name: 'Contoso Staging', show: false, corner: 'BottomLeft', showDomain: true };
const ON: DesktopLabelResponseModel = { ...OFF, show: true };

describe('the desktop label controls', () => {
  it('show nothing before the label has loaded', async () => {
    const { element } = await mount('never');
    expect(element.renderRoot.querySelector('uui-toggle')).to.equal(null);
  });

  it('keep the corner and the domain in place while the label is off, disabled', async () => {
    const { element } = await mount(OFF);
    // Disabled rather than hidden, so turning the label on does not rearrange the screen under the
    // pointer, and an admin can see what else there is to set before switching it on.
    const select = element.renderRoot.querySelector('uui-select');
    const domain = element.renderRoot.querySelectorAll('uui-toggle')[1];
    expect(select).to.not.equal(null);
    expect(select!.hasAttribute('disabled'), 'corner disabled').to.equal(true);
    expect(domain, 'domain switch').to.exist;
    expect(domain.hasAttribute('disabled'), 'domain disabled').to.equal(true);
    expect(element.renderRoot.querySelectorAll('uui-toggle')[0].hasAttribute('disabled'), 'the switch itself').to.equal(false);
  });

  it('turn the label on, keeping the corner and the domain as they were', async () => {
    const { element, source } = await mount(OFF);
    await flip(element.renderRoot.querySelector('uui-toggle')!, true);
    expect(source.writes).to.deep.equal([{ show: true, corner: 'BottomLeft', showDomain: true }]);
  });

  it('enable the corner and the domain once the label is on', async () => {
    const { element } = await mount(ON);
    expect(element.renderRoot.querySelector('uui-select')!.hasAttribute('disabled')).to.equal(false);
    expect(element.renderRoot.querySelectorAll('uui-toggle')[1].hasAttribute('disabled')).to.equal(false);
  });

  it('mark the stored corner as the chosen one', async () => {
    const { element } = await mount(ON);
    const options = (element.renderRoot.querySelector('uui-select') as unknown as { options: { value: string; selected?: boolean }[] }).options;
    expect(options.map((option) => option.value)).to.deep.equal(['TopRight', 'TopLeft', 'BottomLeft', 'BottomRight']);
    expect(options.filter((option) => option.selected).map((option) => option.value)).to.deep.equal(['BottomLeft']);
  });

  it('store a new corner, keeping the rest', async () => {
    const { element, source } = await mount(ON);
    const select = element.renderRoot.querySelector('uui-select') as unknown as HTMLSelectElement;
    select.value = 'TopLeft';
    select.dispatchEvent(new Event('change'));
    await settle();
    expect(source.writes).to.deep.equal([{ show: true, corner: 'TopLeft', showDomain: true }]);
  });

  it('store the domain switch, keeping the rest', async () => {
    const { element, source } = await mount(ON);
    await flip(element.renderRoot.querySelectorAll('uui-toggle')[1], false);
    expect(source.writes).to.deep.equal([{ show: true, corner: 'BottomLeft', showDomain: false }]);
  });
});
