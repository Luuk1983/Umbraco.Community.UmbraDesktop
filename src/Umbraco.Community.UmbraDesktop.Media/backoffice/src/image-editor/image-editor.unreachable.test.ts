import { expect } from '@open-wc/testing';
import { mountEditor } from './image-editor.test-helper.js';
import en from '../localization/en.js';

/**
 * A broken install: the media service is not there, so its File page is not defined. The editor says
 * the media library cannot be reached, keeps every control drawn, and throws nothing. Its own file,
 * because the File page's tag cannot be undefined once another test has defined it.
 */

it('says the media library cannot be reached, without the service or its File page', async () => {
  const errors: unknown[] = [];
  const onError = (event: ErrorEvent) => errors.push(event.error);
  window.addEventListener('error', onError);
  const { editor } = await mountEditor({ media: false });
  await new Promise((resolve) => setTimeout(resolve, 700));
  await editor.updateComplete;
  window.removeEventListener('error', onError);
  expect(editor.shadowRoot!.textContent).to.contain(en.umbraDesktopMedia.unreachable);
  expect((editor.shadowRoot!.querySelector('[data-command="mode-crop"]') as HTMLButtonElement).disabled).to.equal(true);
  expect(errors).to.deep.equal([]);
});
