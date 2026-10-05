import { expect, fixture, html, waitUntil } from '@open-wc/testing';
import { sendKeys } from '@web/test-runner-commands';
import { ARCADE_NAME_MAX_LENGTH } from '../shared/display-name.js';
import { arcadeHarness } from '../shared/harness.test-helper.js';
import './profile.element.js';

const profile = { displayName: 'Luuk Peters', isPublic: true, notifyWhenBeaten: true, askedAboutPublic: true };

/**
 * Wait for something to appear and hand it back. `waitUntil` resolves with nothing, whatever its
 * predicate returned, so a test that wants the element it waited for asks again once it is there.
 * @param query Finds the thing, or null while it is not there yet.
 * @param message What timed out.
 * @returns The thing.
 */
async function found<T>(query: () => T | null | undefined, message: string): Promise<T> {
  await waitUntil(() => query(), message);
  return query()!;
}

/**
 * The profile under a fake Arcade, once drawn. The profile is the element that localizes, so `lang`
 * is pinned on it: the localizer reads its own host's `lang`, never an ancestor's, and this machine's
 * browser may not be English.
 */
async function mount(options: Parameters<typeof arcadeHarness>[0] = {}) {
  const harness = await arcadeHarness({ profile, ...options });
  const el = await fixture(html`<umbradesktop-arcade-profile lang="en"></umbradesktop-arcade-profile>`, { parentNode: harness.wrapper });
  await waitUntil(() => el.shadowRoot!.querySelector('[data-setting="show"]'), 'drawn');
  return { el, root: el.shadowRoot!, ...harness };
}

/** A switch by its setting. */
const sw = (root: ShadowRoot, setting: 'show' | 'notify') => root.querySelector(`[data-setting="${setting}"]`) as HTMLInputElement;

/** Type into the name field as a person would, and let the profile draw the result. */
async function type(root: ShadowRoot, value: string): Promise<void> {
  const input = root.querySelector('input#name') as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await (root.host as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;
}

it('says what each setting does, in the leaderboard words', async () => {
  const { root } = await mount();
  const text = root.textContent!;
  expect(text).to.contain('Your name on the leaderboards').and.contain('Show my scores on the leaderboards')
    .and.contain("Off: colleagues don't see them; you still see your own rank.")
    .and.contain('Tell me when someone takes first place from me').and.contain('Delete my scores');
  expect(text).not.to.match(/private|public|name for this/i);
});

it('reflects the settings in its switches', async () => {
  const { root } = await mount({ profile: { ...profile, isPublic: false } });
  expect(sw(root, 'show').checked).to.equal(false);
  expect(sw(root, 'show').getAttribute('role')).to.equal('switch');
  expect(sw(root, 'notify').getAttribute('role')).to.equal('switch');
  expect(sw(root, 'notify').checked).to.equal(true);
});

it('names each switch by its label, so a screen reader says what it does', async () => {
  const { root } = await mount();
  for (const setting of ['show', 'notify'] as const) {
    const box = sw(root, setting);
    expect(box.type).to.equal('checkbox');
    expect(box.labels!.length).to.equal(1);
  }
  expect(sw(root, 'show').labels![0].textContent).to.contain('Show my scores on the leaderboards');
  expect(sw(root, 'notify').labels![0].textContent).to.contain('Tell me when someone takes first place from me');
});

it('shows or hides the scores through the Arcade, and reflects what was saved', async () => {
  const { root, calls } = await mount();
  sw(root, 'show').click();
  await waitUntil(() => calls.includes('shown:false'), JSON.stringify(calls));
  await (root.host as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;
  expect(sw(root, 'show').checked).to.equal(false);
  expect(root.querySelector('[role="alert"]') === null).to.equal(true);
});

it('toggles a switch from the keyboard', async () => {
  const { root, calls } = await mount();
  sw(root, 'show').focus();
  await sendKeys({ press: 'Space' });
  await waitUntil(() => calls.includes('shown:false'), JSON.stringify(calls));
});

it('outlines a switch reached by the keyboard', async () => {
  const { root } = await mount();
  (root.querySelector('input#name') as HTMLInputElement).focus();
  // The save button is disabled while the name is untouched, so the next stop is the first switch.
  await sendKeys({ press: 'Tab' });
  await waitUntil(() => root.activeElement === sw(root, 'show'), 'switch focused');
  expect(getComputedStyle(sw(root, 'show')).outlineStyle).to.equal('solid');
});

it('saves the notification setting', async () => {
  const { root, calls } = await mount();
  sw(root, 'notify').click();
  await waitUntil(() => calls.includes('updateProfile:{"notifyWhenBeaten":false}'), JSON.stringify(calls));
});

it('says so when showing the scores cannot be saved, and puts the switch back', async () => {
  const { root, calls } = await mount({ failWrites: true });
  sw(root, 'show').click();
  const alert = await found(() => root.querySelector('[role="alert"]'), 'error shown');
  expect(calls).to.include('shown:false');
  expect(alert.textContent).to.contain('Your changes could not be saved.');
  expect(sw(root, 'show').checked).to.equal(true);
});

it('says so when a change cannot be saved, and puts the switch back', async () => {
  const { root } = await mount({ failWrites: true });
  sw(root, 'notify').click();
  const alert = await found(() => root.querySelector('[role="alert"]'), 'error shown');
  expect(alert.textContent).to.contain('Your changes could not be saved.');
  expect(sw(root, 'notify').checked).to.equal(true);
});

it('saves a trimmed name, and never a blank one', async () => {
  const { root, calls } = await mount();
  const input = root.querySelector('input#name') as HTMLInputElement;
  const save = root.querySelector('[data-action="save-name"]') as HTMLButtonElement;
  expect(input.value).to.equal('Luuk Peters');
  expect(input.maxLength).to.equal(ARCADE_NAME_MAX_LENGTH);
  expect(save.disabled).to.equal(true);
  await type(root, '');
  expect(save.disabled).to.equal(true);
  await type(root, '   ');
  expect(save.disabled).to.equal(true);
  await type(root, '  Luuk  ');
  expect(save.disabled).to.equal(false);
  save.click();
  await waitUntil(() => calls.includes('updateProfile:{"displayName":"Luuk"}'), JSON.stringify(calls));
});

it('keeps a typed, unsaved name when a switch saves', async () => {
  const { root, calls } = await mount();
  await type(root, 'Ace');
  sw(root, 'notify').click();
  await waitUntil(() => calls.includes('updateProfile:{"notifyWhenBeaten":false}'), JSON.stringify(calls));
  await (root.host as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;
  expect((root.querySelector('input#name') as HTMLInputElement).value).to.equal('Ace');
  expect((root.querySelector('[data-action="save-name"]') as HTMLButtonElement).disabled, 'still saveable').to.equal(false);
});

it('settles after saving the name it already has, leaving no Save to press', async () => {
  const { root, calls } = await mount();
  await type(root, '  Luuk Peters ');
  const save = root.querySelector('[data-action="save-name"]') as HTMLButtonElement;
  save.click();
  await waitUntil(() => calls.includes('updateProfile:{"displayName":"Luuk Peters"}'), JSON.stringify(calls));
  await waitUntil(() => save.disabled, 'Save disabled again');
  expect((root.querySelector('input#name') as HTMLInputElement).value).to.equal('Luuk Peters');
});

it('keeps the typed name when it cannot be saved', async () => {
  const { root } = await mount({ failWrites: true });
  await type(root, 'Ace');
  (root.querySelector('[data-action="save-name"]') as HTMLButtonElement).click();
  await found(() => root.querySelector('[role="alert"]'), 'error shown');
  expect((root.querySelector('input#name') as HTMLInputElement).value).to.equal('Ace');
});

it('says so when the name cannot be saved', async () => {
  const { root } = await mount({ failWrites: true });
  await type(root, 'Ace');
  (root.querySelector('[data-action="save-name"]') as HTMLButtonElement).click();
  const alert = await found(() => root.querySelector('[role="alert"]'), 'error shown');
  expect(alert.textContent).to.contain('Your changes could not be saved.');
});

it('deletes the scores after confirming', async () => {
  const { root, calls } = await mount();
  (root.querySelector('[data-action="delete"]') as HTMLElement).click();
  await waitUntil(() => calls.includes('deleteMyScores'), JSON.stringify(calls));
  expect(calls).to.include('confirm:Delete your scores?');
});

it('keeps the scores when the confirmation is cancelled', async () => {
  const { root, calls } = await mount({ confirmAnswer: 'cancel' });
  (root.querySelector('[data-action="delete"]') as HTMLElement).click();
  await waitUntil(() => calls.includes('confirm:Delete your scores?'), JSON.stringify(calls));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(calls.includes('deleteMyScores')).to.equal(false);
});

it('says so when the scores cannot be deleted', async () => {
  const { root } = await mount({ failWrites: true });
  (root.querySelector('[data-action="delete"]') as HTMLElement).click();
  const alert = await found(() => root.querySelector('[role="alert"]'), 'error shown');
  expect(alert.textContent).to.contain('Your scores could not be deleted.');
});

it('stamps the theme on itself, since the hub stamp does not reach its own shadow root', async () => {
  const { el } = await mount({ theme: 'macos' });
  await waitUntil(() => el.getAttribute('data-umbradesktop-theme') === 'macos', 'stamped');
});

it('keeps its switches visible and working under Windows 98, as system checkboxes', async () => {
  const { el, root, calls } = await mount({ theme: 'win98' });
  await waitUntil(() => el.getAttribute('data-umbradesktop-theme') === 'win98', 'stamped');
  const box = sw(root, 'show');
  const style = getComputedStyle(box);
  expect(style.appearance).to.not.equal('none');
  expect(style.display).to.not.equal('none');
  expect(style.visibility).to.equal('visible');
  const rect = box.getBoundingClientRect();
  expect(rect.width > 0 && rect.height > 0).to.equal(true);
  box.click();
  await waitUntil(() => calls.includes('shown:false'), JSON.stringify(calls));
});
