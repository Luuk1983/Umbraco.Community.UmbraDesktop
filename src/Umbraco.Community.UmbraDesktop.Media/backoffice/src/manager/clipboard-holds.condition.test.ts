import { expect } from '@open-wc/testing';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbObjectState } from '@umbraco-cms/backoffice/observable-api';
import { UmbraDesktopClipboardHoldsCondition } from './clipboard-holds.condition.js';
import { UMBRADESKTOP_MEDIA_MANAGER_CONTEXT } from '../context/media-manager.context.js';

/** Paste shows only while something is cut or copied (design §5). */

const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

it('permits while something is held, and not otherwise', async () => {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const clipboard = new UmbObjectState<{ mode: string; items: unknown[] } | undefined>(undefined);
  new UmbContextProvider(element, UMBRADESKTOP_MEDIA_MANAGER_CONTEXT, {
    getHostElement: () => element,
    clipboard: clipboard.asObservable(),
  } as never).hostConnected();
  const host = new UmbElementControllerHost(element);
  let permitted = false;
  new UmbraDesktopClipboardHoldsCondition(host, {
    host,
    config: { alias: 'Umbraco.Community.UmbraDesktop.Media.Condition.ClipboardHolds' },
    onChange: (value) => (permitted = value),
  });
  host.hostConnected();
  await tick();
  expect(permitted).to.equal(false);
  clipboard.setValue({ mode: 'copy', items: [{}] });
  await tick();
  expect(permitted).to.equal(true);
  clipboard.setValue(undefined);
  await tick();
  expect(permitted).to.equal(false);
  host.destroy();
  element.remove();
});
