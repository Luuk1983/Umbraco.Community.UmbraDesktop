import { expect } from '@open-wc/testing';
import './site.element.js';
import type { UmbraDesktopSettingsSiteElement } from './site.element.js';
import type { UmbraDesktopSettingsSitePreviewElement } from './site-preview.element.js';
import type { AppIdentityRequestModel, AppIdentityResponseModel } from '../../../../api/types.gen';
import { UmbraDesktopService } from '../../../../api/sdk.gen';
import { UMBRADESKTOP_DESKTOP_LABEL_CONTEXT } from '../../../desktop-label/desktop-label.context-token.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbObjectState } from '@umbraco-cms/backoffice/observable-api';

/**
 * The Site screen as a whole: how it is grouped, and that nothing on it appears or disappears as a
 * setting changes. The controls inside each group have tests of their own; these are about the
 * screen holding its shape.
 */

/** The generated client's two calls, kept so each test can put them back. */
const real = { get: UmbraDesktopService.getAppIdentity, set: UmbraDesktopService.setAppIdentity };

const DEFAULT: AppIdentityResponseModel = {
  mode: 'Default',
  mediaKey: null,
  name: 'ProudNerds dev',
  iconLockedByConfiguration: false,
  nameLockedByConfiguration: false,
  previewUrl: '/umbraco/umbradesktop/icon.png',
};

let wrapper: HTMLElement;
let writes: AppIdentityRequestModel[];
let labelReads: number;

/** Let pending promise callbacks run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/**
 * Mount the Site screen against a stand-in server holding the given identity.
 * @param identity What the server reports.
 * @returns The screen, once it has loaded.
 */
async function mount(identity: AppIdentityResponseModel) {
  writes = [];
  labelReads = 0;
  UmbraDesktopService.getAppIdentity = (() => Promise.resolve({ data: identity })) as never;
  UmbraDesktopService.setAppIdentity = ((options: { body: AppIdentityRequestModel }) => {
    writes.push(options.body);
    return Promise.resolve({ data: undefined });
  }) as never;

  wrapper = document.createElement('div');
  document.body.append(wrapper);
  new UmbContextProvider(wrapper, UMBRADESKTOP_DESKTOP_LABEL_CONTEXT, {
    label: new UmbObjectState(null).asObservable(),
    load: async () => void labelReads++,
    getHostElement: () => wrapper,
  } as never).hostConnected();

  const element = document.createElement('umbradesktop-settings-site') as UmbraDesktopSettingsSiteElement;
  wrapper.append(element);
  await settle();
  await element.updateComplete;
  return element;
}

afterEach(() => {
  UmbraDesktopService.getAppIdentity = real.get;
  UmbraDesktopService.setAppIdentity = real.set;
  wrapper?.remove();
});

it('groups the screen into a preview and one box per thing you set', async () => {
  const element = await mount(DEFAULT);
  const headlines = [...element.shadowRoot!.querySelectorAll('uui-box')].map((box) => box.getAttribute('headline'));
  expect(headlines).to.deep.equal([
    'umbraDesktop_siteGroupPreview',
    'umbraDesktop_siteGroupName',
    'umbraDesktop_siteGroupDesktopLabel',
    'umbraDesktop_siteGroupInstalledApp',
  ]);
});

it('keeps the image button while the icon is the default one, disabled', async () => {
  const element = await mount(DEFAULT);
  const button = element.shadowRoot!.querySelector('uui-button.choose');
  expect(button, 'the image button').to.exist;
  expect(button!.hasAttribute('disabled')).to.equal(true);
});

it('enables the image button once the icon is your own image', async () => {
  const element = await mount({ ...DEFAULT, mode: 'Custom', mediaKey: 'a1b2', previewUrl: '/media/a1b2.png' });
  expect(element.shadowRoot!.querySelector('uui-button.choose')!.hasAttribute('disabled')).to.equal(false);
});

it('disables the image button when configuration owns the icon, even with an image chosen', async () => {
  const element = await mount({ ...DEFAULT, mode: 'Custom', mediaKey: 'a1b2', iconLockedByConfiguration: true });
  expect(element.shadowRoot!.querySelector('uui-button.choose')!.hasAttribute('disabled')).to.equal(true);
});

it('hands the preview the name and the icon the server reports', async () => {
  const element = await mount(DEFAULT);
  const preview = element.shadowRoot!.querySelector('umbradesktop-settings-site-preview') as UmbraDesktopSettingsSitePreviewElement;
  expect(preview.name).to.equal('ProudNerds dev');
  expect(preview.iconUrl).to.equal('/umbraco/umbradesktop/icon.png');
});

it('reads the desktop label again after the name changes, so the desktop draws the new one', async () => {
  const element = await mount(DEFAULT);
  const before = labelReads;
  const input = element.shadowRoot!.querySelector('uui-input') as unknown as HTMLInputElement;
  input.value = 'ProudNerds staging';
  input.dispatchEvent(new Event('change'));
  await settle();
  await settle();

  expect(writes.map((write) => write.name)).to.deep.equal(['ProudNerds staging']);
  expect(labelReads).to.be.greaterThan(before);
});
