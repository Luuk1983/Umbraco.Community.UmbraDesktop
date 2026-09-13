import { expect, fixture, html } from '@open-wc/testing';
import './taskbar.element.js';
import type { UmbraDesktopSettingsTaskbarElement } from './taskbar.element.js';
import { UMBRADESKTOP_TASKBAR_REGIONS, taskbarFeaturesIn } from '../../../taskbar/features/index.js';

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

it('says what a feature is even when it cannot be switched on', async () => {
  // The bug this is the guard for: the screen showed the reason *instead of* the description, so a
  // site without the AI package got "Umbraco AI is not installed" under a switch labelled AI chat
  // and was never told what the chat would have put on the taskbar. Why-not is not a substitute for
  // what-is, because the person reading a disabled switch is usually deciding whether to go and
  // install the thing.
  const element = await screen();
  const chat = rows(element)[0];

  expect(chat.toggle?.hasAttribute('disabled'), 'the AI chat switch should be disabled here').to.equal(true);
  expect(chat.lines.length, 'a disabled row needs both what it is and why not').to.equal(2);
  expect(chat.lines[0]).to.contain('umbraDesktop_taskbarAiChatAbout');
  expect(chat.lines[1]).to.contain('umbraDesktop_taskbarAiChatNotInstalled');
});

it('says only what a feature is when it can be switched on', async () => {
  // Pinned apps is always available, so there is no reason to give and a second line would be an
  // empty paragraph under every switch that works.
  const element = await screen();
  const pinned = rows(element)[1];

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
  // The system tray is a declared region with no features yet. A heading with no switches under it
  // is worse than no heading, and this is what keeps the first tray feature from needing a change
  // here to become visible.
  const empty = UMBRADESKTOP_TASKBAR_REGIONS.filter((region) => taskbarFeaturesIn(region.id).length === 0);
  expect(empty.map((region) => region.id), 'this test is about the tray being empty').to.deep.equal(['tray']);

  const element = await screen();
  const headings = [...element.renderRoot.querySelectorAll('h4')].map((h) => h.textContent?.trim());
  for (const region of empty) {
    expect(headings, `${region.id} should not have a heading yet`).to.not.contain(region.labelKey);
  }
});
