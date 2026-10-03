import { expect, fixture, html, waitUntil } from '@open-wc/testing';
import './profile.element.js';
import { arcadeHarness } from './harness.test-helper.js';

const profile = { displayName: 'Ada', isPublic: false, notifyWhenBeaten: true, askedAboutPublic: true };

it('shows the settings and saves a new display name', async () => {
  const { wrapper, calls } = await arcadeHarness({ profile });
  const el = await fixture(html`<umbradesktop-arcade-profile></umbradesktop-arcade-profile>`, { parentNode: wrapper });
  await waitUntil(() => el.shadowRoot!.querySelector('uui-input'), 'drawn');
  const input = el.shadowRoot!.querySelector('uui-input') as unknown as HTMLInputElement;
  expect(input.value).to.equal('Ada');
  input.value = 'Ace';
  input.dispatchEvent(new Event('input'));
  await waitUntil(() => !el.shadowRoot!.querySelector('[data-action="save-name"]')!.hasAttribute('disabled'),'save enabled');
  (el.shadowRoot!.querySelector('[data-action="save-name"]') as HTMLElement).click();
  await waitUntil(() => calls.some((c) => c.startsWith('updateProfile')), 'saved');
  expect(calls).to.include('updateProfile:{"displayName":"Ace"}');
});

it('toggles showing scores', async () => {
  const { wrapper, calls } = await arcadeHarness({ profile });
  const el = await fixture(html`<umbradesktop-arcade-profile></umbradesktop-arcade-profile>`, { parentNode: wrapper });
  await waitUntil(() => el.shadowRoot!.querySelector('[data-setting="public"]'), 'drawn');
  (el.shadowRoot!.querySelector('[data-setting="public"]') as HTMLElement).dispatchEvent(new Event('change'));
  await waitUntil(() => calls.some((c) => c.startsWith('updateProfile')), 'saved');
  expect(calls).to.include('updateProfile:{"isPublic":true}');
});
