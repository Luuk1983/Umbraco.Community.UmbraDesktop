import { expect, fixture, html, waitUntil } from '@open-wc/testing';
import './profile.element.js';
import { arcadeHarness } from './harness.test-helper.js';

const profile = { displayName: 'Ada', isPublic: false, notifyWhenBeaten: true, askedAboutPublic: true };

it('does not let the display name be saved empty or blank, and trims it', async () => {
  const { wrapper, calls } = await arcadeHarness({ profile });
  const el = await fixture(html`<umbradesktop-arcade-profile></umbradesktop-arcade-profile>`, { parentNode: wrapper });
  await waitUntil(() => el.shadowRoot!.querySelector('uui-input'), 'drawn');
  const input = el.shadowRoot!.querySelector('uui-input') as unknown as HTMLInputElement;
  const save = el.shadowRoot!.querySelector('[data-action="save-name"]') as HTMLElement;
  input.value = '   ';
  input.dispatchEvent(new Event('input'));
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  expect(save.hasAttribute('disabled')).to.equal(true);
  input.value = '  Ace ';
  input.dispatchEvent(new Event('input'));
  await waitUntil(() => !save.hasAttribute('disabled'), 'save enabled');
  save.click();
  await waitUntil(() => calls.some((c) => c.startsWith('updateProfile')), 'saved');
  expect(calls).to.include('updateProfile:{"displayName":"Ace"}');
});

it('says so when saving the name or deleting the scores fails', async () => {
  const { wrapper } = await arcadeHarness({ profile, failWrites: true });
  const el = await fixture(html`<umbradesktop-arcade-profile></umbradesktop-arcade-profile>`, { parentNode: wrapper });
  await waitUntil(() => el.shadowRoot!.querySelector('uui-input'), 'drawn');
  const input = el.shadowRoot!.querySelector('uui-input') as unknown as HTMLInputElement;
  input.value = 'Ace';
  input.dispatchEvent(new Event('input'));
  await waitUntil(() => !el.shadowRoot!.querySelector('[data-action="save-name"]')!.hasAttribute('disabled'), 'save enabled');
  (el.shadowRoot!.querySelector('[data-action="save-name"]') as HTMLElement).click();
  await waitUntil(() => el.shadowRoot!.querySelector('[role="alert"]'), 'save failure shown');
  (el.shadowRoot!.querySelector('[data-action="delete"]') as HTMLElement).click();
  await waitUntil(() => el.shadowRoot!.querySelector('[role="alert"]')?.textContent?.includes('delete'), 'delete failure shown');
});
