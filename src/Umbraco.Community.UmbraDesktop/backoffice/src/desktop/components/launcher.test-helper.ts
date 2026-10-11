import './launcher.element.js';
import type { UmbraDesktopLauncherElement } from './launcher.element.js';
import type { UmbraDesktopApp, UmbraDesktopGroup } from '../types.js';
import type { UmbraDesktopLauncherLayout } from '../settings/types.js';
import { UMBRADESKTOP_APP_CATALOGUE_CONTEXT } from '../app-catalogue.context-token.js';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from '../settings/settings.context-token.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { paletteCss } from '../theme/palette-css.js';
import type { UmbraDesktopTheme } from '../theme/types.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { umbLocalizationManager } from '@umbraco-cms/backoffice/localization-api';
import type { UmbLocalizationSetBase } from '@umbraco-cms/backoffice/localization-api';
import en from '../localization/en.js';
import { UmbArrayState, UmbObjectState } from '@umbraco-cms/backoffice/observable-api';
import { css } from '@umbraco-cms/backoffice/external/lit';
import { UMBRADESKTOP_LAUNCHER_DEFAULT_WIDTH } from '../launcher/geometry.js';

/**
 * The box an icon really has, for a runner that never registers the icon element. In the backoffice
 * an umb-icon is a flex box around a uui-icon that is 1.125em square; here it is an unknown element
 * with nothing in it, so it lays out at zero size and every label moves up into the space the icon
 * would have filled, which is exactly where a tile's buttons sit. Adopt it ahead of every other
 * sheet (see {@link adoptIconStandIn}), so the launcher's own rules and the theme's still decide an
 * icon's size wherever they set one.
 */
export const UMBRADESKTOP_ICON_STAND_IN = css`
  umb-icon {
    display: flex;
  }
  umb-icon::before {
    content: '';
    width: 1.125em;
    height: 1.125em;
  }
`;

/**
 * Give a mounted launcher's icons the size they have in the backoffice, for a test that measures
 * anything an icon's box pushes around or could overlap.
 * @param mount The mounted launcher.
 * @returns A promise that settles once the launcher has laid out with the icons sized.
 */
export async function adoptIconStandIn(mount: UmbraDesktopLauncherMount): Promise<void> {
  mount.root.adoptedStyleSheets = [UMBRADESKTOP_ICON_STAND_IN.styleSheet!, ...mount.root.adoptedStyleSheets];
  await mount.settle();
}

/**
 * Mounting a launcher with the three contexts it reads, stubbed to the parts it uses.
 *
 * A plain host appended to the body rather than an open-wc `fixture`, for the reason
 * `launcher-long-names.test.ts` gives: a fixture belongs to mocha's per-test teardown, and a mount
 * made in a `before` hook has to outlive it. Callers remove the mount themselves.
 */

/** One stored write, as the settings context would receive it. */
export interface UmbraDesktopLauncherWrite {
  pinned: string[];
  layout?: UmbraDesktopLauncherLayout;
}

/** A mounted launcher and what it did. */
export interface UmbraDesktopLauncherMount {
  /** The element. */
  launcher: UmbraDesktopLauncherElement;
  /** Its shadow root, for queries. */
  root: ShadowRoot;
  /** Every `setLauncherArrangement` call, in order. The stub applies each one, like the real context. */
  writes: UmbraDesktopLauncherWrite[];
  /** Every app the launcher asked the window manager to open. */
  launched: UmbraDesktopApp[];
  /** Wait for the launcher to render whatever the last action changed. */
  settle(): Promise<void>;
  /** Take the mount out of the page. */
  remove(): void;
}

/** What to mount. */
export interface UmbraDesktopLauncherMountOptions {
  apps: UmbraDesktopApp[];
  groups: UmbraDesktopGroup[];
  pinned?: string[];
  layout?: UmbraDesktopLauncherLayout;
  /**
   * The wrapper's width in px, the launcher's default width when omitted; the launcher's own width
   * token still applies inside it.
   */
  width?: number;
  /**
   * The launcher's own width in px, set through `--umbradesktop-launcher-width` the way a theme
   * does, and through `--umbradesktop-launcher-arrange-width` too, so a test that asks for a width
   * gets it in arrange mode as well, whatever the theme widens to there. The wrapper's width does
   * not size the launcher; this does.
   */
  launcherWidth?: number;
  /**
   * Mount under a theme: its light palette on the wrapper and its launcher sheet adopted after the
   * launcher's own styles, the way the theme context and the theme styles controller do it at
   * runtime, with the English terms registered so labels are drawn at their real length. Omitted,
   * the launcher renders on the base look alone, with its terms as raw keys.
   */
  theme?: UmbraDesktopTheme;
}

/** Whether this page has the English terms registered yet; they only need registering once. */
let englishRegistered = false;

/**
 * Register the package's English terms with the backoffice's localization manager, flattened to the
 * area_key form the launcher looks them up by, which is what the backoffice's own localization
 * extension does with a file of this shape at runtime.
 *
 * Only for a themed mount. What a themed mount is for is checking what a user would see, and a
 * control labelled with a term key three times the length of its English text overflows, wraps or
 * squeezes its neighbours for reasons no user will ever meet. The unthemed mounts keep raw keys,
 * because their assertions identify things by key and would stop meaning anything under a
 * translation. Registered before the launcher is created, so its first render already has them.
 */
function registerEnglish(): void {
  if (englishRegistered) return;
  englishRegistered = true;
  const terms: Record<string, unknown> = { $code: 'en', $dir: 'ltr' };
  for (const [area, entries] of Object.entries(en)) {
    for (const [key, value] of Object.entries(entries)) terms[`${area}_${key}`] = value;
  }
  umbLocalizationManager.registerLocalization(terms as unknown as UmbLocalizationSetBase);
}

/**
 * Mount a launcher.
 * @param options The catalogue and the stored arrangement.
 * @returns The mount.
 */
export async function mountLauncher(options: UmbraDesktopLauncherMountOptions): Promise<UmbraDesktopLauncherMount> {
  if (options.theme) registerEnglish();
  const wrapper = document.createElement('div');
  // One style attribute for both, because the palette is a string of declarations and setting it
  // after the width would wipe the width out.
  wrapper.setAttribute('style', `${options.theme ? paletteCss(options.theme.palettes.light) : ''} width: ${options.width ?? UMBRADESKTOP_LAUNCHER_DEFAULT_WIDTH}px;`);
  document.body.appendChild(wrapper);

  const apps = new UmbArrayState<UmbraDesktopApp>(options.apps, (a) => a.alias);
  const catalogueGroups = new UmbArrayState<UmbraDesktopGroup>(options.groups, (g) => g.alias);
  new UmbContextProvider(wrapper, UMBRADESKTOP_APP_CATALOGUE_CONTEXT, {
    apps: apps.asObservable(),
    catalogueGroups: catalogueGroups.asObservable(),
    isRefRegistered: () => true,
    getEntryRef: () => undefined,
    getHostElement: () => wrapper,
  } as never).hostConnected();

  const settings = new UmbObjectState<UmbraDesktopLauncherWrite>({ pinned: options.pinned ?? [], layout: options.layout });
  const writes: UmbraDesktopLauncherWrite[] = [];
  new UmbContextProvider(wrapper, UMBRADESKTOP_SETTINGS_CONTEXT, {
    pinned: settings.asObservablePart((s) => s.pinned),
    layout: settings.asObservablePart((s) => s.layout),
    setLauncherArrangement: (pinned: ReadonlyArray<string>, layout?: UmbraDesktopLauncherLayout) => {
      const write = { pinned: [...pinned], layout };
      writes.push(write);
      settings.setValue(write);
    },
    getHostElement: () => wrapper,
  } as never).hostConnected();

  const launched: UmbraDesktopApp[] = [];
  new UmbContextProvider(wrapper, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, {
    open: (app: UmbraDesktopApp) => launched.push(app),
    getHostElement: () => wrapper,
  } as never).hostConnected();

  const launcher = document.createElement('umbradesktop-launcher') as UmbraDesktopLauncherElement;
  if (options.launcherWidth !== undefined) {
    launcher.style.setProperty('--umbradesktop-launcher-width', `${options.launcherWidth}px`);
    launcher.style.setProperty('--umbradesktop-launcher-arrange-width', `${options.launcherWidth}px`);
  }
  wrapper.appendChild(launcher);
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await launcher.updateComplete;
  };
  await settle();
  if (options.theme?.sheets) {
    const sheet = (await options.theme.sheets()).launcher?.styleSheet;
    if (sheet) launcher.shadowRoot!.adoptedStyleSheets = [...launcher.shadowRoot!.adoptedStyleSheets, sheet];
    await settle();
  }
  return { launcher, root: launcher.shadowRoot!, writes, launched, settle, remove: () => wrapper.remove() };
}

/**
 * A stand-in app.
 * @param alias The alias, also used as the name.
 * @param group Its catalogue group.
 * @param weight Its weight within the group.
 * @returns The app.
 */
export function stubApp(alias: string, group?: string, weight = 0): UmbraDesktopApp {
  return { alias, name: alias, icon: 'icon-box', content: { kind: 'iframe', url: '/umbraco' }, chromeProfile: 'bare', group, weight };
}

/**
 * The aliases a launcher shows per card, keyed by the card's group id (the Pinned id for Pinned),
 * for compact assertions. Keyed by id rather than heading because tests do not load the
 * localization files, so a heading drawn from a term would read as its raw key.
 * @param root The launcher's shadow root.
 * @returns `[group id, aliases]` per card, in order.
 */
export function cardsOf(root: ShadowRoot): Array<[string, string[]]> {
  return [...root.querySelectorAll<HTMLElement>('.body .card[data-group]')].map((card) => [
    card.dataset.group ?? '',
    [...card.querySelectorAll<HTMLElement>('.tile[data-alias]')].map((tile) => tile.dataset.alias!),
  ]);
}

/**
 * The group headings in normal mode, for the cases about names rather than contents.
 * @param root The launcher's shadow root.
 * @returns The heading texts, in order.
 */
export function headingsOf(root: ShadowRoot): string[] {
  return [...root.querySelectorAll<HTMLElement>('.body .card .ch')].map((heading) => heading.textContent?.trim() ?? '');
}

/**
 * Drive a mouse drag through the launcher's drag controller: press on the source, move past the
 * threshold, let the launcher render (Pinned and the remove pane only appear once a drag starts),
 * then move onto the target and release there.
 * @param mount The mounted launcher, for its `settle`.
 * @param source The element to press on.
 * @param target Finds the element to release over, after the drag has started.
 */
export async function dragOnto(mount: UmbraDesktopLauncherMount, source: Element, target: () => Element | null): Promise<void> {
  const at = (type: string, x: number, y: number, on: EventTarget) =>
    on.dispatchEvent(
      new PointerEvent(type, { clientX: x, clientY: y, pointerId: 11, pointerType: 'mouse', button: 0, bubbles: true, composed: true }),
    );
  const from = source.getBoundingClientRect();
  const x0 = from.left + from.width / 2;
  const y0 = from.top + from.height / 2;
  at('pointerdown', x0, y0, source);
  at('pointermove', x0 + 10, y0, window);
  await mount.settle();
  const element = target();
  if (!element) throw new Error('The drop target did not render once the drag started.');
  const to = element.getBoundingClientRect();
  const x1 = to.left + Math.min(to.width / 2, 20);
  const y1 = to.top + to.height / 2;
  at('pointermove', x1, y1, window);
  at('pointerup', x1, y1, window);
  await mount.settle();
}
