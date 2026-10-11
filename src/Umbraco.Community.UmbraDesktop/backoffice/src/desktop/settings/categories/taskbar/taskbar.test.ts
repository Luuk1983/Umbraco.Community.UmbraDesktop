import { expect, fixture, html } from '@open-wc/testing';
import './taskbar.element.js';
import type { UmbraDesktopSettingsTaskbarElement } from './taskbar.element.js';
import { UMBRADESKTOP_TASKBAR_REGIONS, taskbarFeaturesIn } from '../../../taskbar/features/index.js';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from '../../settings.context-token.js';
import { UMBRADESKTOP_TRAY_CONTEXT } from '../../../taskbar/tray/tray.context-token.js';
import type { UmbraDesktopTrayItem } from '../../../taskbar/tray/tray-items.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { umbLocalizationManager } from '@umbraco-cms/backoffice/localization-api';
import { UmbObjectState } from '@umbraco-cms/backoffice/observable-api';

/**
 * The Taskbar screen, mounted with no contexts at all.
 *
 * That is not a shortcut, it is the case worth testing: with no app catalogue there are no apps and
 * no registered refs, which is exactly what a site without Umbraco AI looks like to this screen. So
 * the AI chat row comes up unavailable, and everything below is about what an unavailable row has
 * to say.
 */

/** Mount the screen. */
const screen = () =>
  fixture<UmbraDesktopSettingsTaskbarElement>(html`<umbradesktop-settings-taskbar></umbradesktop-settings-taskbar>`);

/**
 * The rows on screen, each with its switch and the lines under it.
 * @param element The mounted screen.
 * @returns One entry per feature row.
 */
function rows(element: UmbraDesktopSettingsTaskbarElement) {
  return [...element.renderRoot.querySelectorAll('.feature')].map((row) => ({
    toggle: row.querySelector('uui-toggle'),
    lines: [...row.querySelectorAll('p')].map((line) => line.textContent?.trim() ?? ''),
  }));
}

/**
 * One feature's row, found by the label on its switch rather than by where it sits, so a case about
 * the AI chat stays about the AI chat when the order of the row changes. No localization is
 * registered in this mount, so the label is the raw key.
 * @param element The mounted screen.
 * @param labelKey The feature's label key.
 * @returns That feature's row.
 */
function rowFor(element: UmbraDesktopSettingsTaskbarElement, labelKey: string) {
  const row = rows(element).find((candidate) => candidate.toggle?.getAttribute('label') === labelKey);
  expect(row, `no row for ${labelKey}`).to.not.equal(undefined);
  return row!;
}

it('lists the switches in the order the taskbar draws them', async () => {
  // Settings is where a user reads what the row holds, so a switch listed anywhere but its button's
  // place sends them looking in the wrong spot. Compared with the registry the row is drawn from
  // rather than restated here, because pinning the order down is `features.test.ts`'s job.
  const element = await screen();
  const labels = rows(element).map((row) => row.toggle?.getAttribute('label'));
  expect(labels).to.deep.equal(taskbarFeaturesIn('launcher').map((feature) => feature.labelKey));
});

it('says what a feature is even when it cannot be switched on', async () => {
  // The bug this is the guard for: the screen showed the reason *instead of* the description, so a
  // site without the AI package got "Umbraco AI is not installed" under a switch labelled AI chat
  // and was never told what the chat would have put on the taskbar. Why-not is not a substitute for
  // what-is, because the person reading a disabled switch is usually deciding whether to go and
  // install the thing.
  const element = await screen();
  const chat = rowFor(element, 'umbraDesktop_taskbarAiChat');

  expect(chat.toggle?.hasAttribute('disabled'), 'the AI chat switch should be disabled here').to.equal(true);
  expect(chat.lines.length, 'a disabled row needs both what it is and why not').to.equal(2);
  expect(chat.lines[0]).to.contain('umbraDesktop_taskbarAiChatAbout');
  expect(chat.lines[1]).to.contain('umbraDesktop_taskbarAiChatNotInstalled');
});

it('says only what a feature is when it can be switched on', async () => {
  // Pinned apps is always available, so there is no reason to give and a second line would be an
  // empty paragraph under every switch that works.
  const element = await screen();
  const pinned = rowFor(element, 'umbraDesktop_taskbarPinnedApps');

  expect(pinned.toggle?.hasAttribute('disabled')).to.equal(false);
  expect(pinned.lines.length).to.equal(1);
  expect(pinned.lines[0]).to.contain('umbraDesktop_taskbarPinnedAppsAbout');
});

it('groups the switches under a heading that says what that part of the taskbar is', async () => {
  // A screen that opens on a bare "AI chat" switch reads as a setting from nowhere. The heading is
  // what makes it a feature of the taskbar, and it is the seam the system tray's own settings drop
  // into rather than a second screen.
  const element = await screen();
  const headings = [...element.renderRoot.querySelectorAll('h4')].map((h) => h.textContent?.trim());
  expect(headings).to.deep.equal(['umbraDesktop_taskbarRegionLauncher']);
});

it('leaves out a region that has nothing in it', async () => {
  // The system tray is a declared region with no host features, and this mount has no tray context,
  // so no package items either. A heading with no switches under it is worse than no heading; the
  // cases below cover the heading appearing once a package brings an item.
  const empty = UMBRADESKTOP_TASKBAR_REGIONS.filter((region) => taskbarFeaturesIn(region.id).length === 0);
  expect(empty.map((region) => region.id), 'this test is about the tray being empty').to.deep.equal(['tray']);

  const element = await screen();
  const headings = [...element.renderRoot.querySelectorAll('h4')].map((h) => h.textContent?.trim());
  for (const region of empty) {
    expect(headings, `${region.id} should not have a heading yet`).to.not.contain(region.labelKey);
  }
});

describe('package tray items', () => {
  /** A tray item's element; never drawn here, since settings shows the switch and not the item. */
  class SettingsTrayItem extends HTMLElement {}
  customElements.define('umbradesktop-settings-tray-item', SettingsTrayItem);

  /**
   * One validated tray item with a literal label and description, as a package without its own
   * localization would register it. Literal on purpose: a host feature's label is a bare key and a
   * package's is a `#token` or plain text, and the screen must read each the right way.
   */
  const ITEM: UmbraDesktopTrayItem = {
    alias: 'My.Tray',
    label: 'Cup',
    description: 'About the cup',
    defaultEnabled: true,
    manifest: {
      type: 'umbraDesktopTrayItem',
      alias: 'My.Tray',
      name: 'Cup',
      element: SettingsTrayItem,
      meta: { label: 'Cup', description: 'About the cup' },
    },
  };

  /**
   * Mount the screen under a stand-in settings context and a stand-in tray context, provided by hand
   * as `taskbar-tray-items.test.ts` does. Each stub carries only what the screen reads, plus
   * `getHostElement` because the consumer calls it. The wrapper is the fixture's parent, which
   * open-wc's cleanup removes after each case, so no context outlives its case.
   * @param stored The user's stored switches.
   * @param items What the tray context lists; the one item unless a case needs otherwise.
   * @returns The screen, and every `setTaskbarFeature` call it made.
   */
  async function mount(stored: Record<string, boolean> = {}, items: ReadonlyArray<UmbraDesktopTrayItem> = [ITEM]) {
    const writes: Array<[string, boolean]> = [];
    const wrapper = document.createElement('div');
    document.body.appendChild(wrapper);
    new UmbContextProvider(wrapper, UMBRADESKTOP_SETTINGS_CONTEXT, {
      taskbarFeatures: new UmbObjectState<Record<string, boolean>>(stored).asObservable(),
      setTaskbarFeature: (id: string, enabled: boolean) => writes.push([id, enabled]),
      getHostElement: () => wrapper,
    } as never).hostConnected();
    new UmbContextProvider(wrapper, UMBRADESKTOP_TRAY_CONTEXT, {
      items: new UmbObjectState<ReadonlyArray<UmbraDesktopTrayItem>>(items).asObservable(),
      getHostElement: () => wrapper,
    } as never).hostConnected();
    const element = await fixture<UmbraDesktopSettingsTaskbarElement>(
      html`<umbradesktop-settings-taskbar></umbradesktop-settings-taskbar>`,
      { parentNode: wrapper },
    );
    await element.updateComplete;
    return { element, writes };
  }

  it('lists a package item under the tray heading, switched on by default', async () => {
    // The whole of the tray's settings (design §7, D8): the item's own switch under the heading the
    // tray has had all along, named and explained in the package's words.
    const { element } = await mount();
    const headings = [...element.renderRoot.querySelectorAll('h4')].map((h) => h.textContent?.trim());
    expect(headings).to.contain('umbraDesktop_taskbarRegionTray');

    const cup = rowFor(element, 'Cup');
    expect(cup.lines).to.deep.equal(['About the cup']);
    expect(cup.toggle?.checked, 'on until the user says otherwise').to.equal(true);
    expect(cup.toggle?.hasAttribute('disabled'), 'a package item has no availability to fail').to.equal(false);
  });

  it('localises a package label written as a #token', async () => {
    // A package names its switch with a `#token`, not the bare key a host feature uses, so it has to
    // go through `localize.string`. Through `localize.term` the lookup would be for the key with the
    // `#` still on it, which never matches, and the switch would read "#umbraDesktopTest_cupLabel".
    // Registered into the fallback culture so it resolves whatever the page's language is; the keys
    // are this file's own, so nothing else in the run can depend on them.
    umbLocalizationManager.registerLocalization({
      $code: 'en',
      $dir: 'ltr',
      umbraDesktopTest_cupLabel: 'Coffee cup',
      umbraDesktopTest_cupAbout: 'Shows the cup in the tray',
    } as never);
    const tokenised: UmbraDesktopTrayItem = {
      ...ITEM,
      label: '#umbraDesktopTest_cupLabel',
      description: '#umbraDesktopTest_cupAbout',
    };
    const { element } = await mount({}, [tokenised]);
    expect(rowFor(element, 'Coffee cup').lines).to.deep.equal(['Shows the cup in the tray']);
  });

  it('leaves the tray heading out when the tray context lists no items', async () => {
    // A tray context is always provided on the desktop, including on an install with no package
    // tray items, and there the tray still has nothing to switch, so no heading either.
    const { element } = await mount({}, []);
    const headings = [...element.renderRoot.querySelectorAll('h4')].map((h) => h.textContent?.trim());
    expect(headings).to.not.contain('umbraDesktop_taskbarRegionTray');
  });

  it('shows the stored choice rather than the default', async () => {
    // Read through the same `isFeatureEnabled` the taskbar uses, so the switch and the tray agree.
    const { element } = await mount({ 'My.Tray': false });
    expect(rowFor(element, 'Cup').toggle?.checked).to.equal(false);
  });

  it('stores the switch under the item alias', async () => {
    // The same stored map the host features use, keyed by the alias, which is what the taskbar
    // reads when it decides whether to draw the item.
    const { element, writes } = await mount();
    const toggle = rowFor(element, 'Cup').toggle!;
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    expect(writes).to.deep.equal([['My.Tray', false]]);
  });
});
