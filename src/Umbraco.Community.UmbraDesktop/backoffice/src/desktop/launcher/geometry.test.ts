import { expect } from '@open-wc/testing';
import {
  UMBRADESKTOP_LAUNCHER_BODY_PADDING,
  UMBRADESKTOP_LAUNCHER_CARD_MIN_WIDTH,
  UMBRADESKTOP_LAUNCHER_PALETTE_WIDTH,
  UMBRADESKTOP_LAUNCHER_SPLIT_MIN,
  arrangeWidthFor,
} from './geometry';
import { mountLauncher, stubApp } from '../components/launcher.test-helper.js';

/** Well above Mocha's 5s default: mounting a launcher is slow when a full run shares one browser. */
const TIMEOUT_MS = 20_000;

/**
 * What the backoffice's UUI light theme sets `--uui-size-space-4` to (`@umbraco-ui/uui`,
 * `dist/themes/light.css`). Tests load no UUI stylesheet, so the launcher is given this by hand.
 */
const UUI_SIZE_SPACE_4 = '12px';

it('splits only where one card column fits beside the palette', () => {
  expect(UMBRADESKTOP_LAUNCHER_SPLIT_MIN).to.equal(
    UMBRADESKTOP_LAUNCHER_CARD_MIN_WIDTH + 2 * UMBRADESKTOP_LAUNCHER_BODY_PADDING + UMBRADESKTOP_LAUNCHER_PALETTE_WIDTH,
  );
});

it("states the body padding the launcher's CSS really draws under the backoffice's spacing", async function () {
  this.timeout(TIMEOUT_MS);
  // Measured on the rendered launcher rather than on a probe of the token, so the check fails if
  // the body stops reading --uui-size-space-4 as well as if the constant drifts from UUI's value.
  const mount = await mountLauncher({ apps: [stubApp('content', 'editing')], groups: [{ alias: 'editing', label: 'Editing', weight: 0 }] });
  try {
    mount.launcher.style.setProperty('--uui-size-space-4', UUI_SIZE_SPACE_4);
    const body = mount.root.querySelector<HTMLElement>('.body');
    expect(body, 'the launcher should render a body').to.not.equal(null);
    expect(parseFloat(getComputedStyle(body!).paddingLeft)).to.equal(UMBRADESKTOP_LAUNCHER_BODY_PADDING);
  } finally {
    mount.remove();
  }
});

it('widens a narrow theme in arrange mode by the palette, and never short of the split', () => {
  // Umbraco 4: its own width plus the palette's is already past the split, border and all.
  expect(arrangeWidthFor(320, 2)).to.equal(320 + UMBRADESKTOP_LAUNCHER_PALETTE_WIDTH);
  // Windows 98: its own width plus the palette's falls short, so the split and its bevel decide.
  expect(arrangeWidthFor(224, 6)).to.equal(UMBRADESKTOP_LAUNCHER_SPLIT_MIN + 6);
});
