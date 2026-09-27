import { expect } from '@open-wc/testing';
import './site-preview.element.js';
import type { UmbraDesktopSettingsSitePreviewElement } from './site-preview.element.js';
import type { DesktopLabelResponseModel } from '../../../../api/types.gen';
import type { UmbraDesktopWallpaperView } from '../../wallpaper-view';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from '../../settings.context-token.js';
import { UMBRADESKTOP_DESKTOP_LABEL_CONTEXT } from '../../../desktop-label/desktop-label.context-token.js';
import { UMBRADESKTOP_THEME_CONTEXT } from '../../../theme/theme.context-token.js';
import type { UmbraDesktopResolvedTheme } from '../../../theme/resolve-variant.js';
import { UMBRADESKTOP_WIN98_THEME } from '../../../theme/themes/win98/index.js';
import { UMBRADESKTOP_PREVIEW_SCENE } from '../../../theme/preview/constants.js';
import type { UmbraDesktopThemePreviewElement } from '../../../theme/preview/theme-preview.element.js';
import type { UmbraDesktopLabelElement } from '../../../desktop-label/desktop-label.element.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbObjectState } from '@umbraco-cms/backoffice/observable-api';

/**
 * The Site screen's preview: the desktop as this user sees it, with the label drawn on it, and the
 * tile the installed app gets. What matters is that it is the user's own desktop — their theme and
 * their wallpaper — because the label's whole job is to read on that ground, and a preview over a
 * stock one would say nothing about whether it does.
 */

const WALLPAPER: UmbraDesktopWallpaperView = {
  ref: { kind: 'builtin', id: 'midnight-wave' } as never,
  background: { url: '/wallpapers/midnight-wave.jpg', averageColour: '#101a3a' },
  thumbUrl: '/wallpapers/midnight-wave.thumb.jpg',
};

const ON: DesktopLabelResponseModel = { name: 'Old name', show: true, corner: 'TopLeft', showDomain: true };

let wrapper: HTMLElement;
let label: UmbObjectState<DesktopLabelResponseModel | null>;

/**
 * Mount the preview under stub contexts, in a box of a given width.
 * @param state What the label context holds.
 * @param width The width the Site screen gives the preview, in px.
 * @returns The preview element.
 */
async function mount(state: DesktopLabelResponseModel | null, width = 400) {
  wrapper = document.createElement('div');
  wrapper.style.width = `${width}px`;
  document.body.append(wrapper);

  label = new UmbObjectState<DesktopLabelResponseModel | null>(state);
  new UmbContextProvider(wrapper, UMBRADESKTOP_SETTINGS_CONTEXT, {
    wallpaper: new UmbObjectState(WALLPAPER).asObservable(),
    getHostElement: () => wrapper,
  } as never).hostConnected();
  new UmbContextProvider(wrapper, UMBRADESKTOP_THEME_CONTEXT, {
    resolved: new UmbObjectState<UmbraDesktopResolvedTheme>({
      theme: UMBRADESKTOP_WIN98_THEME,
      variant: 'dark',
      palette: UMBRADESKTOP_WIN98_THEME.palettes.light,
      highContrast: false,
    }).asObservable(),
    getHostElement: () => wrapper,
  } as never).hostConnected();
  new UmbContextProvider(wrapper, UMBRADESKTOP_DESKTOP_LABEL_CONTEXT, {
    label: label.asObservable(),
    getHostElement: () => wrapper,
  } as never).hostConnected();

  const element = document.createElement('umbradesktop-settings-site-preview') as UmbraDesktopSettingsSitePreviewElement;
  element.name = 'ProudNerds dev';
  element.iconUrl = '/icons/proudnerds.png';
  wrapper.append(element);
  // No wait for a frame: the preview fits itself on its first render, and a frame never comes in a
  // background tab, which is where the runner puts most test files.
  await element.updateComplete;
  return element;
}

/** The miniature desktop inside the preview. */
const miniature = (element: UmbraDesktopSettingsSitePreviewElement) =>
  element.shadowRoot!.querySelector('umbradesktop-theme-preview') as UmbraDesktopThemePreviewElement;

/** The label drawn on the miniature. */
const drawnLabel = (element: UmbraDesktopSettingsSitePreviewElement) =>
  miniature(element).querySelector('umbradesktop-desktop-label') as UmbraDesktopLabelElement | null;

afterEach(() => wrapper?.remove());

it('paints the wallpaper in force behind the miniature', async () => {
  const element = await mount(ON);
  expect(miniature(element).wallpaper).to.deep.equal(WALLPAPER.background);
});

it('paints the theme in force, in the variant in force', async () => {
  const element = await mount(ON);
  expect(miniature(element).theme).to.equal(UMBRADESKTOP_WIN98_THEME);
  expect(miniature(element).variant).to.equal('dark');
});

it('draws the real label on the miniature, under the name the Site screen holds', async () => {
  const element = await mount(ON);
  const drawn = drawnLabel(element);

  // The name comes from the screen, not from the label context: that is the one just typed, and the
  // context holds the name as it was when the label was last read.
  expect(drawn, 'the label, slotted into the miniature').to.exist;
  expect(drawn!.label).to.deep.equal({ ...ON, name: 'ProudNerds dev' });
});

it('keeps the miniature while the label is off, and says the name is not shown', async () => {
  const element = await mount({ ...ON, show: false });
  expect(miniature(element), 'the miniature').to.exist;
  expect(drawnLabel(element)!.label?.show).to.equal(false);
  expect(element.shadowRoot!.querySelector('figcaption')!.textContent).to.contain('umbraDesktop_sitePreviewDesktopHidden');
});

it('follows the label as it changes', async () => {
  const element = await mount(ON);
  label.setValue({ ...ON, corner: 'BottomRight' });
  await element.updateComplete;
  expect(drawnLabel(element)!.label?.corner).to.equal('BottomRight');
});

it('fits the miniature to the width it is given, at the desktop proportions', async () => {
  const element = await mount(ON, 480);
  const figure = element.shadowRoot!.querySelector('figure.desktop')!.getBoundingClientRect();
  const box = miniature(element).getBoundingClientRect();

  expect(box.width).to.be.closeTo(figure.width, 1);
  expect(box.height).to.be.closeTo((figure.width * UMBRADESKTOP_PREVIEW_SCENE.h) / UMBRADESKTOP_PREVIEW_SCENE.w, 1);
});

it('shows the tile the installed app gets: its icon and its name', async () => {
  const element = await mount(ON);
  const tile = element.shadowRoot!.querySelector('.app')!;
  expect(tile.querySelector('img')!.getAttribute('src')).to.equal('/icons/proudnerds.png');
  expect(tile.textContent).to.contain('ProudNerds dev');
});
