import { expect } from '@open-wc/testing';
import './launcher.element.js';
import type { UmbraDesktopLauncherElement } from './launcher.element.js';
import type { UmbraDesktopApp, UmbraDesktopLauncherGroup } from '../types.js';
import { UMBRADESKTOP_APP_CATALOGUE_CONTEXT } from '../app-catalogue.context-token.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbArrayState } from '@umbraco-cms/backoffice/observable-api';

/**
 * What a long app name does to the grid it sits in.
 *
 * Found in Dutch, but it is not a Dutch problem: "Documenttype-machtigingen" and
 * "Gezondheidscontrole" are simply longer than "Document Type permissions" and "Health Check", and
 * German, Finnish and Hungarian will all be worse. Any language can produce a word wider than a
 * tile, and English will too the moment a package registers an app with a long name.
 *
 * Two failures, and the second is the one that looks broken rather than merely clipped. A grid item
 * defaults to `min-width: auto`, which means its column cannot be narrower than its longest
 * unbreakable word, so `repeat(3, 1fr)` quietly stops being three equal thirds and grows past the
 * card — the label then paints over the card beside it, and the whole panel gains a horizontal
 * scrollbar. Measuring geometry rather than asserting on CSS text is what tells a rule that applies
 * from a rule that merely exists.
 */

/** A name with no break opportunity, longer than any tile can be. */
const LONG_NAME = 'Documenttypemachtigingenoverzicht';

/**
 * Mounting a launcher costs a couple of seconds, so it happens once for the file, in a `before`
 * hook, exactly as the themes' rendered-geometry tests do.
 *
 * **Do not mount it with `@open-wc/testing`'s `fixture` here**, which cost an hour to find. A
 * fixture is owned by mocha's per-test teardown, and from a `before` hook that combination hangs:
 * the hook never resolves and all three tests fail as bare timeouts. It passes when the file runs
 * alone and fails whenever the suite runs with it, which is the worst shape a flake can have. A
 * plain host element appended to the body is what `theme/themes/mount-themed.ts` uses, and for this
 * reason.
 */
const MOUNT_TIMEOUT_MS = 20_000;

/** The launcher under test, mounted once for the whole file. */
let launcher: UmbraDesktopLauncherElement;

/**
 * One app for the grid.
 * @param alias Stable id.
 * @param name Display name.
 * @returns The app.
 */
function appNamed(alias: string, name: string): UmbraDesktopApp {
  return {
    alias,
    name,
    icon: 'icon-document',
    content: { kind: 'iframe', url: '/umbraco' },
    chromeProfile: 'full',
    size: { width: 800, height: 600 },
  } as unknown as UmbraDesktopApp;
}

/**
 * A launcher holding one group of three apps, the middle one impossible to break.
 * @returns The mounted launcher.
 */
async function launcherWithLongName(): Promise<UmbraDesktopLauncherElement> {
  // A plain host appended to the body rather than an open-wc fixture, which is what
  // `mount-themed.ts` does and for the same reason: a fixture is owned by mocha's per-test
  // teardown, and this mount has to outlive it.
  const wrapper = document.createElement('div');
  wrapper.style.width = '1180px';
  document.body.appendChild(wrapper);
  const groups = new UmbArrayState<UmbraDesktopLauncherGroup>([], (g) => g.group.alias);
  groups.setValue([
    {
      group: { alias: 'diagnostics', label: 'Diagnostics' },
      apps: [appNamed('short', 'Logs'), appNamed('long', LONG_NAME), appNamed('other', 'Profiling')],
    },
  ]);
  const apps = new UmbArrayState<UmbraDesktopApp>([], (a) => a.alias);
  apps.setValue([appNamed('short', 'Logs'), appNamed('long', LONG_NAME), appNamed('other', 'Profiling')]);
  new UmbContextProvider(wrapper, UMBRADESKTOP_APP_CATALOGUE_CONTEXT, {
    apps: apps.asObservable(),
    groups: groups.asObservable(),
    isRefRegistered: () => true,
    getHostElement: () => wrapper,
  } as never).hostConnected();

  const element = document.createElement('umbradesktop-launcher') as UmbraDesktopLauncherElement;
  wrapper.appendChild(element);
  await element.updateComplete;
  return element;
}

before(async function () {
  this.timeout(MOUNT_TIMEOUT_MS);
  launcher = await launcherWithLongName();
});

it('keeps a long name inside its own tile', () => {
  const tiles = [...(launcher.shadowRoot?.querySelectorAll<HTMLElement>('.grid .tile') ?? [])];
  expect(tiles.length, 'the group should render its tiles').to.be.greaterThan(1);

  const card = launcher.shadowRoot?.querySelector<HTMLElement>('.card');
  expect(card, 'the group should render a card').to.not.equal(null);
  const cardRight = card!.getBoundingClientRect().right;

  for (const tile of tiles) {
    const label = tile.querySelector<HTMLElement>('.tlb')!;
    // The label may be clipped, it may wrap, it may end in an ellipsis. What it may not do is paint
    // outside the card, which is what puts it on top of the group beside it.
    expect(
      Math.round(label.getBoundingClientRect().right),
      `"${label.textContent?.trim()}" paints past its card`,
    ).to.be.at.most(Math.ceil(cardRight));
  }
});

it('keeps every tile in a row the same width, however long one name is', () => {
  // repeat(3, 1fr) means three equal thirds. A column that grew to fit one word is the tell that
  // min-width: auto is still in force, and it is what pushes the grid past its card.
  const tiles = [...(launcher.shadowRoot?.querySelectorAll<HTMLElement>('.grid .tile') ?? [])];
  const widths = tiles.map((tile) => Math.round(tile.getBoundingClientRect().width));

  expect(new Set(widths).size, `tile widths differ: ${widths.join(', ')}`).to.equal(1);
});

it('does not make the launcher scroll sideways', () => {
  // The symptom a user actually reports: a horizontal scrollbar under the whole panel.
  const cards = launcher.shadowRoot?.querySelector<HTMLElement>('.cards');
  expect(cards, 'the launcher should render its cards region').to.not.equal(null);

  expect(cards!.scrollWidth, 'the cards region scrolls sideways').to.be.at.most(cards!.clientWidth);
});
