import { expect } from '@open-wc/testing';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbraDesktopThemeContext } from './theme.context.js';
import type { UmbraDesktopAdoptedSheets } from './types';

/**
 * The theme context, on its own: the one behaviour `theme-adoption.test.ts` cannot reach, because
 * that file always starts from a theme the user has *chosen*.
 *
 * The context starts resolved on the default theme, and it used to load a theme's stylesheets only
 * when the theme in force *changed*. That was invisible for as long as the default theme had no
 * stylesheets, and it is not now: the Umbraco theme is the default and ships a window and a taskbar
 * sheet, so a load triggered only by a change would leave every user who never opens the settings
 * panel on a navy caption with no round buttons, no coral line and no hover tile.
 */

/**
 * How long a case may take, well above Mocha's default: the theme's sheets are a dynamic import
 * served by the test runner, which a full run has every other file competing for.
 */
const TIMEOUT_MS = 20_000;

it('loads the default theme\'s stylesheets without any change of theme', async function () {
  this.timeout(TIMEOUT_MS);
  const host = new UmbElementControllerHost(document.createElement('div'));
  const context = new UmbraDesktopThemeContext(host);

  const sheets = await new Promise<UmbraDesktopAdoptedSheets>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no stylesheets were ever published for the default theme')), 10_000);
    context.sheets.subscribe((published) => {
      if (published.window) {
        clearTimeout(timer);
        resolve(published);
      }
    });
  });

  expect(sheets.window, 'the default theme styles the window').to.be.instanceOf(CSSStyleSheet);
  expect(sheets.taskbar, 'and the taskbar').to.be.instanceOf(CSSStyleSheet);
  host.destroy();
});
