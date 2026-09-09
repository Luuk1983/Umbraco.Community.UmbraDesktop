import { expect } from '@open-wc/testing';
import '../../../components/window-notices.element.js';
import type { UmbraDesktopWindowNoticesElement } from '../../../components/window-notices.element.js';
import type { UmbraDesktopWindow } from '../../../types.js';
import { UMBRADESKTOP_THEME_TEST_TIMEOUT_MS } from '../mount-themed.js';
import { UMBRADESKTOP_THEME_CONTEXT } from '../../theme.context-token.js';
import type { UmbraDesktopThemeContext } from '../../theme.context.js';
import type { UmbraDesktopAdoptedSheets } from '../../types.js';
import { UMBRADESKTOP_WIN98_THEME } from './index.js';
import { customElement } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbBasicState } from '@umbraco-cms/backoffice/observable-api';

/**
 * `theme/notice.test.ts` proves every theme's `.notice` CSS *text* says the right thing and never
 * removes the surface — but it never mounts anything, so it cannot catch the bug this file exists
 * for: `umbradesktop-window-notices` had its own shadow root and nothing ever adopted a theme's
 * `window` stylesheet into it, which left every `.notice` rule in every theme valid, parsed CSS
 * that no banner ever painted.
 *
 * Deliberately **not** built on `mount-themed.ts`'s `mountThemedWith`. That helper (rightly, for
 * what the per-theme geometry tests need) pushes the theme's sheet onto the mounted element's
 * `adoptedStyleSheets` *by hand*, bypassing `UMBRADESKTOP_THEME_CONTEXT` and this element's own
 * `UmbraDesktopThemeStyles` controller entirely — so it would keep passing even with the
 * constructor line this fix adds deleted again. This file provides the real context instead (the
 * same shape `window-body.test.ts`'s stub does for `resolved`, extended with the `sheets`
 * observable `UmbraDesktopThemeStyles` actually consumes) and lets the component adopt the sheet
 * itself, which is the one path capable of failing the way this bug did.
 *
 * Win98 is the clearest theme to prove it with, per design §8.4: its banner is a bevelled sunken
 * well (`box-shadow`, see `window.css.ts`'s `.notice` rule), which the base component's own CSS
 * never sets at all — so a `box-shadow` on a mounted `.notice` can only have arrived from the
 * adopted sheet, unlike a colour or a border, which the base CSS also declares and a passing
 * assertion could satisfy by accident.
 */

/**
 * Stands in for `UmbraDesktopThemeContext`, publishing only `sheets` — the one member
 * `UmbraDesktopThemeStyles` reads — built from a real theme's real stylesheets rather than a
 * fabricated shape, so the path under test is "does the component adopt what it is handed" and
 * nothing about the stub's own honesty is in question.
 */
@customElement('umbradesktop-win98-notice-theme-host-probe')
class NoticeThemeHost extends UmbLitElement {
  #sheets = new UmbBasicState<UmbraDesktopAdoptedSheets>({});

  /** The one observable a theme-styled component consumes. */
  public readonly sheets = this.#sheets.asObservable();

  constructor() {
    super();
    // Cast for the same reason `window-body.test.ts`'s stub does: this implements only the slice
    // of the contract `UmbraDesktopThemeStyles` reads, not the whole context class.
    this.provideContext(UMBRADESKTOP_THEME_CONTEXT, this as unknown as UmbraDesktopThemeContext);
  }

  /** Light DOM, so an appended element is a real descendant a context request can bubble past. */
  override createRenderRoot() {
    return this;
  }

  /** Publish a theme's built stylesheets, as `UmbraDesktopThemeContext` would once its import resolves. */
  public setSheets(sheets: UmbraDesktopAdoptedSheets): void {
    this.#sheets.setValue(sheets);
  }
}

/** A window carrying a trashed-and-dirty notice, the plainest one-banner case. */
const NOTICE_WINDOW: UmbraDesktopWindow = {
  id: 'w1',
  app: {
    alias: 'win98-notice-probe',
    name: 'Probe',
    icon: 'icon-umbraco',
    chromeProfile: 'bare',
    content: { kind: 'iframe', url: 'about:blank' },
  },
  rect: { x: 0, y: 0, w: 400, h: 300 },
  z: 1,
  active: true,
  state: 'normal',
  dirty: true,
  trashed: true,
};

/**
 * Poll until the box-shadow is no longer `none`, so a failure reports the deadline running out
 * rather than racing the context resolution and observable plumbing between the host and the
 * component's own controller.
 * @param notice The mounted `.notice` element.
 * @returns The settled `box-shadow`, whatever it ends up being.
 */
async function settledBoxShadow(notice: HTMLElement): Promise<string> {
  let value = getComputedStyle(notice).boxShadow;
  for (let i = 0; i < 200 && value === 'none'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    value = getComputedStyle(notice).boxShadow;
  }
  return value;
}

it('adopts the active theme\'s window stylesheet, so a themed notice actually paints', async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);

  const themeHost = document.createElement('umbradesktop-win98-notice-theme-host-probe') as NoticeThemeHost;
  document.body.appendChild(themeHost);
  const sheets = await UMBRADESKTOP_WIN98_THEME.sheets!();
  const windowSheet = sheets.window!.styleSheet!;
  themeHost.setSheets({ window: windowSheet });

  const element = document.createElement('umbradesktop-window-notices') as UmbraDesktopWindowNoticesElement;
  element.window = NOTICE_WINDOW;
  themeHost.appendChild(element);
  await element.updateComplete;

  try {
    const notice = element.renderRoot.querySelector('.notice') as HTMLElement | null;
    expect(notice, 'the trashed notice should render a banner').to.not.equal(null);

    const boxShadow = await settledBoxShadow(notice!);
    // The base component CSS never sets '.notice's box-shadow at all (it uses 'border-bottom'
    // instead), so any box-shadow here — let alone Win98's four-layer inset bevel — is only
    // explicable by the theme's own sheet having reached this element's own shadow root, through
    // its own `UmbraDesktopThemeStyles` controller and the real context contract.
    expect(boxShadow, "Win98 should paint its sunken-well bevel on the notice, not 'none'").to.not.equal('none');
    expect(boxShadow, "the bevel is drawn with layered 'inset' shadows").to.contain('inset');
  } finally {
    themeHost.remove();
  }
});
