import { expect } from '@open-wc/testing';
import { UMBRADESKTOP_THEMES } from './index.js';
import { UMBRADESKTOP_UMBRACO_THEME } from './umbraco/index.js';
import { UMBRADESKTOP_UMBRACO4_THEME } from './umbraco4/index.js';
import { UMBRADESKTOP_WIN98_THEME } from './win98/index.js';
import { UMBRADESKTOP_MACOS_THEME } from './macos/index.js';
import { UMBRADESKTOP_PINNED_GROUP_ID } from '../../constants.js';
import { UMBRADESKTOP_LAUNCHER_DEFAULT_WIDTH } from '../../launcher/geometry.js';
import { adoptIconStandIn, mountLauncher, stubApp } from '../../components/launcher.test-helper.js';
import type { UmbraDesktopLauncherMount } from '../../components/launcher.test-helper.js';

/**
 * Launcher layout that only a browser sees, under each theme's real palette and sheet, with the
 * English terms so labels have their real length. Each case here is something a measurement of the
 * running backoffice found and the unit tests had passed: text printed over text, a list opened away
 * from the button that opened it, a copy of a row as wide as the row, and a panel that moved under
 * the pointer the moment a drag started.
 *
 * Presence is asserted as a count, never as an element compared with null: a failing assertion on an
 * element inside the launcher hangs the runner while it serialises the element.
 */

/** Mounting a launcher under a theme imports that theme's sheets, which is slow in a busy run. */
const TIMEOUT_MS = 30_000;

/** One catalogue group, enough for a card with tiles. */
const GROUPS = [{ alias: 'editing', label: 'Editing', weight: 10 }];

/** Three apps in it, so the first row of a grid theme is full. */
const APPS = [stubApp('content', 'editing', 10), stubApp('media', 'editing', 20), stubApp('settings', 'editing', 30)];

/** The themes that turn tiles into rows, which is where a list or a copy of a row can go wrong. */
const ROW_THEMES = [UMBRADESKTOP_UMBRACO4_THEME, UMBRADESKTOP_WIN98_THEME];

/** Sub-pixel slack for comparing boxes. */
const EPSILON_PX = 0.5;

/**
 * How far Move to's right edge may sit from its ⋯ button's: the list's border and the rounding of
 * two independently laid out boxes, nothing more.
 */
const ANCHOR_SLACK_PX = 2;

/**
 * A launcher narrow enough that Pinned's heading and its hint cannot share a line in any theme,
 * which is what Dutch does to the narrow themes at their own width.
 */
const NARROW_LAUNCHER_PX = 150;

/**
 * Whether two boxes share any area, allowing for sub-pixel rounding.
 * @param a One box.
 * @param b The other.
 * @returns True when they overlap by more than the slack.
 */
function overlaps(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right - EPSILON_PX && b.left < a.right - EPSILON_PX && a.top < b.bottom - EPSILON_PX && b.top < a.bottom - EPSILON_PX;
}

/**
 * A mouse pointer event with a fixed id.
 * @param type The event type.
 * @param x Its client x.
 * @param y Its client y.
 * @returns The event.
 */
function pointer(type: string, x: number, y: number): PointerEvent {
  return new PointerEvent(type, { clientX: x, clientY: y, pointerId: 21, pointerType: 'mouse', button: 0, bubbles: true, composed: true });
}

/**
 * Press on an element and move past the drag threshold, leaving the drag under way.
 * @param mount The mount, for its `settle`.
 * @param source The element to press on.
 */
async function startDrag(mount: UmbraDesktopLauncherMount, source: Element): Promise<void> {
  const box = source.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  source.dispatchEvent(pointer('pointerdown', x, y));
  window.dispatchEvent(pointer('pointermove', x + 10, y));
  await mount.settle();
}

/**
 * Release a drag over nothing, so it ends without a drop.
 * @param mount The mount, for its `settle`.
 */
async function endDrag(mount: UmbraDesktopLauncherMount): Promise<void> {
  window.dispatchEvent(pointer('pointerup', 0, 0));
  await mount.settle();
}

/**
 * Mount a launcher under a theme and enter arrange mode.
 * @param options Anything to pass to the mount besides the catalogue.
 * @returns The mount, arranging.
 */
async function arranging(options: Partial<Parameters<typeof mountLauncher>[0]>): Promise<UmbraDesktopLauncherMount> {
  const mount = await mountLauncher({ apps: APPS, groups: GROUPS, ...options });
  await adoptIconStandIn(mount);
  mount.root.querySelector<HTMLElement>('.ctl.arrange')!.click();
  await mount.settle();
  return mount;
}

/**
 * What the backoffice's UUI light theme sets its spacing tokens to (`@umbraco-ui/uui`,
 * `dist/themes/light.css`). Tests load no UUI stylesheet, so without these every padding and gap
 * that reads them is dropped, and tiles lay out wider than a user ever sees them.
 */
const UUI_SPACING: Record<string, string> = {
  '--uui-size-space-1': '3px',
  '--uui-size-space-2': '6px',
  '--uui-size-space-3': '9px',
  '--uui-size-space-4': '12px',
  '--uui-size-space-5': '18px',
  '--uui-size-space-6': '24px',
};

/**
 * The default launcher width on a 1920px screen, where the default theme's group tiles came out
 * narrower than an icon between its two buttons. Read from the launcher's own default rather than
 * typed, so this keeps measuring what a wide screen shows if that default changes.
 */
const WIDE_SCREEN_LAUNCHER_PX = UMBRADESKTOP_LAUNCHER_DEFAULT_WIDTH;

/** The themes that keep tiles as a grid, with − and ⋯ in the top corners of each. */
const GRID_THEMES = UMBRADESKTOP_THEMES.filter((theme) => !ROW_THEMES.includes(theme));

afterEach(() => window.scrollTo(0, 0));

for (const theme of GRID_THEMES) {
  it(`${theme.name}: an arrange tile's − and ⋯ keep clear of its icon, however narrow the tile`, async function () {
    this.timeout(TIMEOUT_MS);
    const mount = await mountLauncher({ apps: APPS, groups: GROUPS, theme, launcherWidth: WIDE_SCREEN_LAUNCHER_PX });
    for (const [token, value] of Object.entries(UUI_SPACING)) mount.launcher.style.setProperty(token, value);
    await adoptIconStandIn(mount);
    mount.root.querySelector<HTMLElement>('.ctl.arrange')!.click();
    await mount.settle();
    try {
      const tiles = [...mount.root.querySelectorAll<HTMLElement>('.cards .tile.arr')];
      expect(tiles.length, 'arrange mode draws the group tiles').to.equal(APPS.length);
      for (const tile of tiles) {
        const icon = tile.querySelector('umb-icon')!.getBoundingClientRect();
        for (const button of tile.querySelectorAll('.edit')) {
          expect(overlaps(button.getBoundingClientRect(), icon), `${tile.dataset.alias}: ${button.className} keeps clear of the icon`).to.equal(false);
        }
      }
    } finally {
      mount.remove();
    }
  });
}

for (const theme of [UMBRADESKTOP_UMBRACO_THEME, ...ROW_THEMES]) {
  it(`${theme.name}: Pinned's heading and its hint share a line only when both fit`, async function () {
    this.timeout(TIMEOUT_MS);
    const mount = await arranging({ theme, launcherWidth: NARROW_LAUNCHER_PX });
    try {
      const name = mount.root.querySelector<HTMLElement>('.card.fav .gname')!;
      const hint = mount.root.querySelector<HTMLElement>('.card.fav .hint')!;
      expect(overlaps(name.getBoundingClientRect(), hint.getBoundingClientRect()), 'the heading and the hint do not print over each other').to.equal(
        false,
      );
      expect(name.scrollWidth, 'the heading keeps its text inside its box').to.be.at.most(name.clientWidth + 1);
      expect(hint.scrollWidth, 'the hint keeps its text inside its box').to.be.at.most(hint.clientWidth + 1);
    } finally {
      mount.remove();
    }
  });
}

for (const theme of ROW_THEMES) {
  it(`${theme.name}: Move to opens under the ⋯ button that opened it`, async function () {
    this.timeout(TIMEOUT_MS);
    const mount = await arranging({ theme });
    try {
      const tile = mount.root.querySelector<HTMLElement>('.cards .tile.arr[data-alias="content"]')!;
      const button = tile.querySelector<HTMLElement>('.mv')!;
      button.click();
      await mount.settle();
      await mount.settle();
      const menu = mount.root.querySelector<HTMLElement>('.movemenu')!.getBoundingClientRect();
      const pane = mount.root.querySelector<HTMLElement>('.layout-pane')!.getBoundingClientRect();
      expect(menu.right, "the list's right edge lines up with the button's").to.be.closeTo(button.getBoundingClientRect().right, ANCHOR_SLACK_PX);
      expect(menu.left, 'and it is still inside the pane').to.be.at.least(pane.left);
    } finally {
      mount.remove();
    }
  });

  it(`${theme.name}: a lifted row follows the pointer as a compact row, not a copy as wide as the list`, async function () {
    this.timeout(TIMEOUT_MS);
    const mount = await mountLauncher({ apps: APPS, groups: GROUPS, theme });
    await adoptIconStandIn(mount);
    try {
      const source = mount.root.querySelector<HTMLElement>('.cards .tile[data-alias="content"]')!;
      const row = source.getBoundingClientRect();
      await startDrag(mount, source);
      const ghosts = mount.root.querySelectorAll<HTMLElement>('.drag-ghost');
      expect(ghosts.length, 'the drag draws its copy').to.equal(1);
      const label = ghosts[0].querySelector<HTMLElement>('.tlb')!;
      expect(ghosts[0].getBoundingClientRect().width, 'the copy is narrower than the row it was lifted from').to.be.below(row.width / 2);
      expect(label.scrollWidth, 'and still shows the whole name').to.be.at.most(label.clientWidth + 1);
      await endDrag(mount);
    } finally {
      mount.remove();
    }
  });
}

for (const theme of UMBRADESKTOP_THEMES) {
  it(`${theme.name}: starting a drag moves nothing under the pointer`, async function () {
    this.timeout(TIMEOUT_MS);
    const mount = await mountLauncher({ apps: APPS, groups: GROUPS, theme });
    await adoptIconStandIn(mount);
    // macOS's panel is a fixed-height overlay whose box the taskbar sets; this mount has no taskbar,
    // so it is given a height the way the taskbar would.
    if (theme === UMBRADESKTOP_MACOS_THEME) {
      mount.launcher.style.height = '560px';
      await mount.settle();
    }
    try {
      const firstCard = () => mount.root.querySelector<HTMLElement>('.cards .card')!.getBoundingClientRect();
      const source = mount.root.querySelector<HTMLElement>('.cards .tile[data-alias="media"]')!;
      const cardBefore = firstCard();
      const tileBefore = source.getBoundingClientRect();
      const panelBefore = mount.launcher.getBoundingClientRect();
      await startDrag(mount, source);
      expect(firstCard().top, 'the first group stays put').to.be.closeTo(cardBefore.top, 1);
      expect(source.getBoundingClientRect().top, 'the pressed tile stays put').to.be.closeTo(tileBefore.top, 1);
      expect(mount.launcher.getBoundingClientRect().height, 'the panel keeps its height').to.be.closeTo(panelBefore.height, 1);

      // Both targets are there to be seen, and the empty Pinned says what it is for.
      const pinned = mount.root.querySelector<HTMLElement>(`[data-group="${UMBRADESKTOP_PINNED_GROUP_ID}"]`)!;
      const pinnedBox = pinned.getBoundingClientRect();
      expect(pinnedBox.height, 'the empty Pinned target is drawn').to.be.above(0);
      // Nor does it cover a group: laid over the top of the body, it took drops meant for the first
      // group's tiles.
      expect(overlaps(pinnedBox, firstCard()), 'the empty Pinned target leaves the groups uncovered').to.equal(false);
      expect(pinned.querySelector('.hint')?.textContent?.trim(), 'with its hint').to.equal('Drop here to pin');
      const pane = mount.root.querySelector<HTMLElement>('.removepane')!;
      const title = pane.querySelector<HTMLElement>('.remove-title')!.getBoundingClientRect();
      const paneBox = pane.getBoundingClientRect();
      expect(title.height, 'the remove pane shows its title').to.be.above(0);
      expect(title.top, 'the title is not clipped at the top of the pane').to.be.at.least(paneBox.top - EPSILON_PX);
      expect(title.bottom, 'nor at its bottom').to.be.at.most(paneBox.bottom + EPSILON_PX);

      // Both take the pointer: the drag finds a target by hit-testing, which skips anything a theme
      // has made transparent to the pointer, as macOS does to its footer so the header row can be
      // pressed through it.
      for (const [name, target] of [
        ['the empty Pinned target', pinned],
        ['the remove pane', pane],
      ] as const) {
        const box = target.getBoundingClientRect();
        const hit = mount.root.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        expect(!!hit && target.contains(hit), `${name} is what the pointer finds over it`).to.equal(true);
      }
      await endDrag(mount);
    } finally {
      mount.remove();
    }
  });
}

/**
 * A display name longer than any narrow theme's footer, which is the case that has to truncate
 * rather than push the footer's buttons out of the panel.
 */
const LONG_USER_NAME = 'Maximiliana Wilhelmina van der Heijden-Oosterhout';

/**
 * Whether one box lies within another horizontally, allowing a pixel for rounding.
 * @param inner The box that should be inside.
 * @param outer The box it should be inside.
 * @returns True when it is.
 */
function withinX(inner: DOMRect, outer: DOMRect): boolean {
  return inner.left >= outer.left - 1 && inner.right <= outer.right + 1;
}

for (const theme of UMBRADESKTOP_THEMES) {
  it(`${theme.name}: the footer and the remove pane fit the panel, however long the user's name`, async function () {
    this.timeout(TIMEOUT_MS);
    const mount = await mountLauncher({ apps: APPS, groups: GROUPS, theme });
    await adoptIconStandIn(mount);
    // This mount has no current-user context, so the user the footer draws is set directly.
    (mount.launcher as unknown as { _currentUser: unknown })._currentUser = { name: LONG_USER_NAME, avatarUrls: [] };
    await mount.settle();
    try {
      const panel = mount.launcher.getBoundingClientRect();
      const footer = mount.root.querySelector<HTMLElement>('.footer')!;
      expect(withinX(footer.getBoundingClientRect(), panel), 'the footer lies within the panel').to.equal(true);
      const buttons = [...mount.root.querySelectorAll<HTMLElement>('.footer .fbtn')];
      expect(buttons.length, 'the footer draws settings, log out and exit').to.equal(3);
      for (const button of buttons) {
        expect(withinX(button.getBoundingClientRect(), panel), `${button.getAttribute('aria-label')} lies within the panel`).to.equal(true);
      }

      await startDrag(mount, mount.root.querySelector<HTMLElement>('.cards .tile[data-alias="media"]')!);
      const panes = mount.root.querySelectorAll<HTMLElement>('.removepane');
      expect(panes.length, 'the drag shows the remove pane').to.equal(1);
      expect(withinX(panes[0].getBoundingClientRect(), panel), 'the remove pane lies within the panel').to.equal(true);
      await endDrag(mount);
    } finally {
      mount.remove();
    }
  });
}

for (const theme of UMBRADESKTOP_THEMES) {
  it(`${theme.name}: the arrange banner takes the header row's place, so the top row does not move`, async function () {
    this.timeout(TIMEOUT_MS);
    const mount = await mountLauncher({ apps: APPS, groups: GROUPS, theme });
    await adoptIconStandIn(mount);
    try {
      const row = mount.root.querySelector<HTMLElement>('.hdr')!.getBoundingClientRect();
      mount.root.querySelector<HTMLElement>('.ctl.arrange')!.click();
      await mount.settle();
      const banner = mount.root.querySelector<HTMLElement>('.banner')!.getBoundingClientRect();
      expect(banner.top, 'the banner starts where the header row did').to.be.closeTo(row.top, EPSILON_PX);
      expect(banner.left, 'at the same inset from the left').to.be.closeTo(row.left, EPSILON_PX);
      expect(banner.right, 'and from the right').to.be.closeTo(row.right, EPSILON_PX);
    } finally {
      mount.remove();
    }
  });
}
