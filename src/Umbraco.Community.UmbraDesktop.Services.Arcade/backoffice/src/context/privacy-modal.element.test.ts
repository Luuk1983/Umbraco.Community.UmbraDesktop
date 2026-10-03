import { expect } from '@open-wc/testing';
import { UmbObjectState } from '@umbraco-cms/backoffice/observable-api';
import './privacy-modal.element.js';
import type { UmbraDesktopArcadePrivacyModalElement } from './privacy-modal.element.js';
import type { ArcadePrivacyModalValue } from './privacy-modal.token.js';

/**
 * The question's whole job is to hand back one of two answers with the name as it stood. How the
 * modal manager shows it, and what a close without an answer does, is Umbraco's; what is worth
 * testing is what this element puts in the modal's value before it submits.
 */

/**
 * Mount the modal with a stand-in for the modal context.
 *
 * Mounted by hand rather than with `fixture()`, which waits on the whole rendered tree and so never
 * settles when `uui-*` elements are not registered in a bare test page. The stand-in has the three
 * things `UmbModalBaseElement` touches: an observable `value`, `setValue` (what `this.value = ...`
 * calls) and `submit`. `submitted` records the value at the moment of submitting, so a test can
 * tell "set it, then submit" from "submit, then set it".
 * @param displayName The name the modal is opened with.
 * @returns The element and what it submitted.
 */
async function modal(displayName = 'Ada Lovelace') {
  const element = document.createElement('umbradesktop-arcade-privacy-modal') as UmbraDesktopArcadePrivacyModalElement;
  const state = new UmbObjectState<ArcadePrivacyModalValue>({ isPublic: false, displayName: '' });
  const submitted: ArcadePrivacyModalValue[] = [];
  element.data = { displayName };
  element.modalContext = {
    value: state.asObservable(),
    setValue: (value: ArcadePrivacyModalValue) => state.setValue(value),
    submit: () => submitted.push(state.getValue()),
    reject: () => {},
  } as never;
  document.body.append(element);
  after(() => element.remove());
  await element.updateComplete;
  const input = element.shadowRoot!.querySelector('uui-input') as unknown as HTMLInputElement;
  const answer = async (which: 'public' | 'private') => {
    (element.shadowRoot!.querySelector(`[data-answer="${which}"]`) as HTMLElement).click();
    // uui-button hands its click on after a tick, so the answer lands just after click() returns.
    await new Promise((resolve) => setTimeout(resolve));
  };
  return { element, input, answer, submitted };
}

it('prefills the display name', async () => {
  const { input } = await modal();

  expect(input.value).to.equal('Ada Lovelace');
});

it('answers "show them" with the name as typed', async () => {
  const { input, answer, submitted } = await modal();

  input.value = 'Ace';
  input.dispatchEvent(new Event('input'));
  await answer('public');

  expect(submitted).to.deep.equal([{ isPublic: true, displayName: 'Ace' }]);
});

it('answers "keep them private" with the name it came in with when it was not touched', async () => {
  const { answer, submitted } = await modal();

  await answer('private');

  expect(submitted).to.deep.equal([{ isPublic: false, displayName: 'Ada Lovelace' }]);
});

it('submits exactly once per click', async () => {
  const { answer, submitted } = await modal();

  await answer('public');

  expect(submitted).to.have.length(1);
});

it('never answers with an empty name: a cleared box falls back to the name it came in with', async () => {
  const { input, answer, submitted } = await modal();

  input.value = '   ';
  input.dispatchEvent(new Event('input'));
  await answer('public');

  expect(submitted[0].displayName).to.equal('Ada Lovelace');
});
