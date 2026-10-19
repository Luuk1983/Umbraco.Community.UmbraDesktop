import { expect } from '@open-wc/testing';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UMBRADESKTOP_MEDIA_MANAGER_CONTEXT } from '../../context/media-manager.context.js';
import type { UmbraDesktopMediaRef } from '../../operations/media-api.js';
import { UmbraDesktopCutAction } from './cut.action.js';
import { UmbraDesktopCopyAction } from './copy.action.js';
import { UmbraDesktopPasteAction } from './paste.action.js';
import { UmbraDesktopBulkCutAction } from './bulk-cut.action.js';
import { UmbraDesktopBulkCopyAction } from './bulk-copy.action.js';
import { UmbraDesktopCopyToAction } from './copy-to.action.js';

/** Cut, Copy, Paste and Copy to, ours, inside a manager window only (design §5, plan task 4.6). */

const ref = (unique: string): UmbraDesktopMediaRef => ({ unique, name: unique, parent: 'products', mediaType: 'image', isFolder: false });

/**
 * A stand-in desktop context and collection, provided on an element an action runs on.
 * @param selection What core's collection has selected.
 * @returns The host to run actions on, and what the context was asked.
 */
function stage(selection: string[] = []) {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const asked: string[] = [];
  new UmbContextProvider(element, UMBRADESKTOP_MEDIA_MANAGER_CONTEXT, {
    getHostElement: () => element,
    api: { item: async (unique: string) => ({ data: ref(unique) }) },
    hold: (mode: string, items: UmbraDesktopMediaRef[]) => asked.push(`${mode} ${items.map((each) => each.unique).join(',')}`),
    paste: async (target: string | null) => asked.push(`paste into ${target}`),
    copyTo: async (items: UmbraDesktopMediaRef[], target: string | null) => asked.push(`copy ${items.map((each) => each.unique).join(',')} to ${target}`),
  } as never).hostConnected();
  new UmbContextProvider(element, 'UmbCollectionContext', {
    getHostElement: () => element,
    selection: { getSelection: () => selection },
  } as never).hostConnected();
  const host = new UmbElementControllerHost(element);
  host.hostConnected();
  return {
    host,
    asked,
    done: () => {
      host.destroy();
      element.remove();
    },
  };
}

describe('Cut and Copy on an item’s menu', () => {
  it('cut the item', async () => {
    const { host, asked, done } = stage();
    await new UmbraDesktopCutAction(host, { entityType: 'media', unique: 'banjo', meta: {} } as never).execute();
    expect(asked).to.deep.equal(['cut banjo']);
    done();
  });

  it('copy the whole selection when the item is part of it, as an OS does', async () => {
    const { host, asked, done } = stage(['banjo', 'unicorn']);
    await new UmbraDesktopCopyAction(host, { entityType: 'media', unique: 'banjo', meta: {} } as never).execute();
    expect(asked).to.deep.equal(['copy banjo,unicorn']);
    done();
  });

  it('take only the item when it is not selected', async () => {
    const { host, asked, done } = stage(['unicorn']);
    await new UmbraDesktopCutAction(host, { entityType: 'media', unique: 'banjo', meta: {} } as never).execute();
    expect(asked).to.deep.equal(['cut banjo']);
    done();
  });
});

describe('Paste on a folder’s menu', () => {
  it('pastes into the folder', async () => {
    const { host, asked, done } = stage();
    await new UmbraDesktopPasteAction(host, { entityType: 'media', unique: 'people', meta: {} } as never).execute();
    expect(asked).to.deep.equal(['paste into people']);
    done();
  });

  it('pastes into the root from the Media root', async () => {
    const { host, asked, done } = stage();
    await new UmbraDesktopPasteAction(host, { entityType: 'media-root', unique: null, meta: {} } as never).execute();
    expect(asked).to.deep.equal(['paste into null']);
    done();
  });
});

describe('the selection bar', () => {
  it('cuts and copies the selection', async () => {
    const { host, asked, done } = stage();
    const cut = new UmbraDesktopBulkCutAction(host, { meta: {} } as never);
    cut.selection = ['a', 'b'];
    await cut.execute();
    const copy = new UmbraDesktopBulkCopyAction(host, { meta: {} } as never);
    copy.selection = ['c'];
    await copy.execute();
    expect(asked).to.deep.equal(['cut a,b', 'copy c']);
    done();
  });

  it('copies the selection to the folder picked in core’s folder picker', async () => {
    const { host, asked, done } = stage();
    class Picking extends UmbraDesktopCopyToAction {
      protected override async _pickFolder(): Promise<string | null | undefined> {
        return 'people';
      }
    }
    const action = new Picking(host, { meta: {} } as never);
    action.selection = ['a', 'b'];
    await action.execute();
    expect(asked).to.deep.equal(['copy a,b to people']);
    done();
  });

  it('copies nothing when the picker is closed', async () => {
    const { host, asked, done } = stage();
    class Closing extends UmbraDesktopCopyToAction {
      protected override async _pickFolder(): Promise<string | null | undefined> {
        return undefined;
      }
    }
    const action = new Closing(host, { meta: {} } as never);
    action.selection = ['a'];
    await action.execute();
    expect(asked).to.deep.equal([]);
    done();
  });
});
