import { expect } from '@open-wc/testing';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UMB_ACTION_EVENT_CONTEXT } from '@umbraco-cms/backoffice/action';
import { UMB_MANAGEMENT_API_SERVER_EVENT_CONTEXT } from '@umbraco-cms/backoffice/management-api';
import {
  UmbEntityUpdatedEvent,
  UmbRequestReloadChildrenOfEntityEvent,
  UmbRequestReloadStructureForEntityEvent,
} from '@umbraco-cms/backoffice/entity-action';
import { UmbBasicState } from '@umbraco-cms/backoffice/observable-api';
import { filter } from '@umbraco-cms/backoffice/external/rxjs';
import { UmbraDesktopMediaChangeController } from './media-change.controller.js';
import type { UmbraDesktopMediaChangeDeps } from './media-change.controller.js';

/**
 * A media item changed on the server, by this desktop or anyone else: every thumbnail and list on
 * this page that shows it loads it again (#137). Core's own lists only do that for a change made in
 * the same page, so a Media section window kept the old picture after the Image Editor saved over
 * it; this runs in each such page, in its own realm, so the events are the page's own classes.
 *
 * What it must not do is reload an item page open in the same page: core's media workspace reloads
 * on `UmbEntityUpdatedEvent` and throws away unsaved edits, which the desktop's server-event router
 * protects with its "changed elsewhere" banner. So that page is left to the router (found by the
 * reviewer of #137).
 */

/** How long the tests let a burst gather; the controller's own wait is shortened to this. */
const WAIT = 5;

let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const dispose of cleanup) dispose();
  cleanup = [];
});

/** One server event as the hub delivers it. */
const event = (eventSource: string, eventType: string, key = 'k1') => ({ eventSource, eventType, key, clientTimestamp: 't' });

/**
 * The controller on a page with a server-event feed and an action event context.
 * @param showing The keys of item pages open in this page.
 * @returns A way to deliver server events, what the page heard, what was cleared, and what was asked of the feed.
 */
function setup(showing: string[] = []) {
  const page = document.createElement('div');
  const inner = document.createElement('div');
  page.appendChild(inner);
  document.body.appendChild(page);
  const feed = new UmbBasicState<ReturnType<typeof event> | undefined>(undefined);
  const asked: Array<[string[], string[]]> = [];
  const server = {
    getHostElement: () => page,
    byEventSourcesAndEventTypes: (sources: string[], types: string[]) => {
      asked.push([sources, types]);
      return feed.asObservable().pipe(filter((e) => !!e && sources.includes(e.eventSource) && types.includes(e.eventType)));
    },
  };
  const actions = Object.assign(new EventTarget(), { getHostElement: () => page });
  const heard: Event[] = [];
  for (const type of [UmbEntityUpdatedEvent.TYPE, UmbRequestReloadStructureForEntityEvent.TYPE, UmbRequestReloadChildrenOfEntityEvent.TYPE]) {
    actions.addEventListener(type, (e) => heard.push(e));
  }
  const providers = [
    new UmbContextProvider(page, UMB_ACTION_EVENT_CONTEXT, actions as never),
    new UmbContextProvider(page, UMB_MANAGEMENT_API_SERVER_EVENT_CONTEXT, server as never),
  ];
  for (const provider of providers) provider.hostConnected();
  const host = new UmbElementControllerHost(inner);
  const cleared: string[] = [];
  const deps: UmbraDesktopMediaChangeDeps = {
    clear: (unique) => cleared.push(unique),
    showsItem: (unique) => showing.includes(unique),
    wait: WAIT,
  };
  new UmbraDesktopMediaChangeController(host, deps);
  host.hostConnected();
  cleanup.push(() => {
    host.destroy();
    for (const provider of providers) provider.destroy();
    page.remove();
  });
  return { send: (e: ReturnType<typeof event>) => feed.setValue(e), heard, cleared, asked };
}

/** Let a burst's wait pass. */
const settle = () => new Promise((resolve) => setTimeout(resolve, WAIT * 4));

/** What was heard, as class, entity type and key. */
const summary = (heard: Event[]) =>
  heard.map((e) => {
    const entity = e as Event & { getEntityType(): string; getUnique(): string | null };
    const kind = e instanceof UmbEntityUpdatedEvent ? 'updated' : e instanceof UmbRequestReloadStructureForEntityEvent ? 'reload-structure' : 'other';
    return [kind, entity.getEntityType(), entity.getUnique()];
  });

describe('the media change controller', () => {
  it("asks core's feed for media changes only", () => {
    const { asked } = setup();
    expect(asked).to.deep.equal([[['Umbraco:CMS:Media'], ['Updated', 'Trashed', 'Deleted']]]);
  });

  it("clears an updated item's thumbnails and says it changed, so they load again", async () => {
    const { send, heard, cleared } = setup();
    send(event('Umbraco:CMS:Media', 'Updated'));
    await settle();
    expect(cleared).to.deep.equal(['k1']);
    expect(summary(heard)).to.deep.equal([['updated', 'media', 'k1']]);
  });

  it('reloads the lists showing an item binned or deleted, so it leaves them', async () => {
    const { send, heard } = setup();
    send(event('Umbraco:CMS:Media', 'Trashed', 'k2'));
    send(event('Umbraco:CMS:Media', 'Deleted', 'k3'));
    await settle();
    expect(summary(heard)).to.deep.equal([
      ['reload-structure', 'media', 'k2'],
      ['reload-structure', 'media', 'k3'],
    ]);
  });

  /** Umbraco sends one event per item, so sorting a folder of fifty is fifty events at once. */
  it('acts once per item in a burst, after the burst', async () => {
    const { send, heard, cleared } = setup();
    send(event('Umbraco:CMS:Media', 'Updated', 'a'));
    send(event('Umbraco:CMS:Media', 'Updated', 'a'));
    send(event('Umbraco:CMS:Media', 'Updated', 'b'));
    expect(heard.length, 'nothing before the burst is over').to.equal(0);
    await settle();
    expect(cleared).to.deep.equal(['a', 'b']);
    expect(summary(heard)).to.deep.equal([
      ['updated', 'media', 'a'],
      ['updated', 'media', 'b'],
    ]);
  });

  /** Reloading it would replace unsaved edits; the desktop's router owns that page. */
  it('leaves an item page open in this page alone, and still clears its thumbnails', async () => {
    const { send, heard, cleared } = setup(['k1']);
    send(event('Umbraco:CMS:Media', 'Updated'));
    await settle();
    expect(cleared).to.deep.equal(['k1']);
    expect(heard.length).to.equal(0);
  });
});
