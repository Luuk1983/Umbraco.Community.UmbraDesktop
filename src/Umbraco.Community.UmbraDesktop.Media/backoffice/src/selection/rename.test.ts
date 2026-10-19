import { expect, fixture, html } from '@open-wc/testing';
import { UmbBasicState } from '@umbraco-cms/backoffice/observable-api';
import { cleanName, renameMedia } from './rename.js';
import type { UmbraDesktopMediaDetailStore } from './rename.js';
import './rename-dialog.element.js';
import type { UmbraDesktopMediaRenameDialogElement } from './rename-dialog.element.js';

/** F2 renames through a small dialog of ours (decided 2026-10-17, plan phase 3). */

describe('a new name', () => {
  it('is trimmed', () => {
    expect(cleanName('  Banjo two ', 'Banjo')).to.equal('Banjo two');
  });

  it('is nothing when empty or unchanged', () => {
    expect(cleanName('   ', 'Banjo')).to.equal(undefined);
    expect(cleanName(' Banjo ', 'Banjo')).to.equal(undefined);
  });
});

describe('renaming', () => {
  /**
   * A store holding one item, recording what it is asked to save.
   * @returns The store and the saves.
   */
  function store() {
    const saved: unknown[] = [];
    const item = { unique: 'a', variants: [{ name: 'Banjo', culture: null }], values: [] };
    const detail: UmbraDesktopMediaDetailStore = {
      requestByUnique: async (unique) => ({ data: unique === 'a' ? structuredClone(item) : undefined }),
      save: async (model) => {
        saved.push(model);
        return {};
      },
    };
    return { detail, saved };
  }

  it('saves the item with its new name on every variant', async () => {
    const { detail, saved } = store();
    expect(await renameMedia(detail, 'a', 'Banjo two')).to.equal(true);
    expect(saved).to.deep.equal([{ unique: 'a', variants: [{ name: 'Banjo two', culture: null }], values: [] }]);
  });

  it('saves nothing for an unchanged or empty name, or an item that is gone', async () => {
    const { detail, saved } = store();
    expect(await renameMedia(detail, 'a', 'Banjo')).to.equal(false);
    expect(await renameMedia(detail, 'a', '  ')).to.equal(false);
    expect(await renameMedia(detail, 'gone', 'x')).to.equal(false);
    expect(saved).to.deep.equal([]);
  });

  it('says so when the save fails', async () => {
    const { detail } = store();
    detail.save = async () => ({ error: new Error('no') });
    expect(await renameMedia(detail, 'a', 'Banjo two')).to.equal(false);
  });
});

describe('the Rename dialog', () => {
  /**
   * The dialog with a stand-in modal context, as core's modal manager would mount it.
   * @returns The dialog and what it told its context.
   */
  async function dialog() {
    const told: string[] = [];
    const value = new UmbBasicState<{ name: string }>({ name: 'Banjo' });
    const context = {
      value: value.asObservable(),
      setValue: (next: { name: string }) => value.setValue(next),
      updateValue: (partial: { name: string }) => value.setValue({ ...value.getValue(), ...partial }),
      submit: () => told.push(`submit:${value.getValue().name}`),
      reject: () => told.push('reject'),
    };
    const element = await fixture<UmbraDesktopMediaRenameDialogElement>(
      html`<umbradesktop-media-rename-dialog .data=${{ name: 'Banjo' }} .modalContext=${context as never}></umbradesktop-media-rename-dialog>`,
    );
    await element.updateComplete;
    const input = element.shadowRoot!.querySelector('uui-input') as HTMLElement & { value: string; shadowRoot: ShadowRoot };
    return { element, told, input };
  }

  it('shows the current name, selected, so typing replaces it', async () => {
    const { input } = await dialog();
    await (input as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    expect(input.value).to.equal('Banjo');
    const field = input.shadowRoot.querySelector('input')!;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect([field.selectionStart, field.selectionEnd]).to.deep.equal([0, 5]);
  });

  it('renames on Rename and on Enter, with the name typed', async () => {
    const { element, told, input } = await dialog();
    input.value = 'Banjo two';
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await element.updateComplete;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
    expect(told).to.deep.equal(['submit:Banjo two']);
  });

  it('offers no Rename while the name is empty or unchanged', async () => {
    const { element, input } = await dialog();
    const button = () => element.shadowRoot!.querySelector('uui-button[look="primary"]') as HTMLElement & { disabled: boolean };
    expect(button().disabled).to.equal(true);
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await element.updateComplete;
    expect(button().disabled).to.equal(true);
  });

  it('cancels on Cancel', async () => {
    const { element, told } = await dialog();
    const cancel = element.shadowRoot!.querySelector('uui-button:not([look="primary"])') as HTMLElement & { updateComplete: Promise<unknown> };
    await cancel.updateComplete;
    // Pressed as a person presses it: on the button inside, which is what the browser clicks.
    (cancel.shadowRoot!.querySelector('button') as HTMLElement).click();
    expect(told).to.deep.equal(['reject']);
  });
});
