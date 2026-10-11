import { expect } from '@open-wc/testing';
import { watchFrameUploads } from './upload-watcher';
import type { UmbraDesktopTask } from './progress';

/**
 * The upload watcher, against a stand-in dropzone rather than a booted backoffice. What is checked
 * is the contract with core it relies on: a media dropzone exposes `progressItems()`, the upload
 * manager's own list, and asks for contexts as it connects with a bubbling, composed
 * `umb:context-request`. The real thing is checked by dropping files into a Media window on a test
 * instance, which is also where the design's first source, the collection's placeholders, was found
 * to be dead in Umbraco 17.7. Design §1.
 */

/** An upload item as core's dropzone manager holds it, reduced to what is read. */
type Item = { unique: string; status: string; progress?: number };

/**
 * A stand-in `umb-dropzone-media`: an element with `progressItems()`, whose observable emits on
 * subscribe as core's states do, and which asks for a context the way core's consumers do.
 * @returns The element and handles on it.
 */
function mountDropzone() {
  const subscribers = new Set<(value: Item[]) => void>();
  let value: Item[] = [];
  const element = Object.assign(document.createElement('div'), {
    progressItems: () => ({
      subscribe(next: (value: Item[]) => void) {
        subscribers.add(next);
        next(value);
        return { unsubscribe: () => void subscribers.delete(next) };
      },
    }),
  });
  // Nested under a shadow root, as the real one is inside the media collection's.
  const host = document.createElement('div');
  document.body.appendChild(host);
  host.attachShadow({ mode: 'open' }).appendChild(element);
  teardown.push(() => host.remove());
  return {
    element,
    /** Ask for a context, as core's consumers do on connect. */
    request: () => element.dispatchEvent(Object.assign(new Event('umb:context-request', { bubbles: true, composed: true }), { contextAlias: 'UmbNotificationContext' })),
    set(next: Item[]) {
      value = next;
      for (const subscriber of [...subscribers]) subscriber(value);
    },
    remove: () => host.remove(),
    get subscriberCount() {
      return subscribers.size;
    },
  };
}

/** Any other element asking for a context, which is what a navigation produces in numbers. */
function somethingElseRequests() {
  const other = document.createElement('div');
  document.body.appendChild(other);
  other.dispatchEvent(Object.assign(new Event('umb:context-request', { bubbles: true, composed: true }), { contextAlias: 'UmbSomething' }));
  other.remove();
}

/** Everything a test needs torn down. */
let teardown: Array<() => void> = [];

afterEach(() => {
  for (const dispose of teardown.reverse()) dispose();
  teardown = [];
});

/**
 * Start the watcher over the test document and collect every report.
 * @returns The reports, in order.
 */
function watch(): Array<ReadonlyArray<UmbraDesktopTask>> {
  const reports: Array<ReadonlyArray<UmbraDesktopTask>> = [];
  teardown.push(watchFrameUploads(document, (tasks) => reports.push(tasks)));
  return reports;
}

/** The last report. */
const last = (reports: Array<ReadonlyArray<UmbraDesktopTask>>) => reports[reports.length - 1];

it('finds a dropzone by its context request and reports its upload', () => {
  const reports = watch();
  const zone = mountDropzone();
  zone.request();
  zone.set([
    { unique: 'a', status: 'complete' },
    { unique: 'b', status: 'waiting', progress: 50 },
  ]);
  expect(last(reports)).to.have.lengthOf(1);
  expect(last(reports)[0].state).to.equal('running');
  expect(last(reports)[0].total).to.equal(2);
  expect(last(reports)[0].completed).to.be.closeTo(1.5, 1e-9);
});

it('says nothing on start for a dropzone with nothing uploading', () => {
  const reports = watch();
  mountDropzone().request();
  expect(reports).to.deep.equal([]);
});

it('ignores an element that asks for a context but uploads nothing', () => {
  const reports = watch();
  somethingElseRequests();
  expect(reports).to.deep.equal([]);
});

it('reports nothing left once the upload finishes, which is what clears the marker', () => {
  const reports = watch();
  const zone = mountDropzone();
  zone.request();
  zone.set([{ unique: 'a', status: 'waiting' }]);
  zone.set([{ unique: 'a', status: 'complete' }]);
  expect(last(reports)).to.deep.equal([]);
});

it('counts only the batch in progress, not everything since the page loaded', () => {
  // The dropzone manager keeps every item it has ever handled, so a second drop of 2 after a first
  // of 3 would otherwise read "3 of 5" before it had started.
  const reports = watch();
  const zone = mountDropzone();
  zone.request();
  const first = ['a', 'b', 'c'].map((unique) => ({ unique, status: 'complete' }));
  zone.set([...first]);
  zone.set([...first, { unique: 'd', status: 'waiting' }, { unique: 'e', status: 'waiting' }]);
  expect(last(reports)[0].total).to.equal(2);
  expect(last(reports)[0].completed).to.equal(0);
});

it('keeps a failure until the next batch starts, then counts only that batch', () => {
  const reports = watch();
  const zone = mountDropzone();
  zone.request();
  const failedBatch = [{ unique: 'a', status: 'complete' }, { unique: 'b', status: 'error' }];
  zone.set(failedBatch.map((i) => ({ ...i, status: 'waiting' })));
  zone.set(failedBatch);
  expect(last(reports)[0].state).to.equal('failed');
  zone.set([...failedBatch, { unique: 'c', status: 'waiting' }]);
  expect(last(reports)[0].state).to.equal('running');
  expect(last(reports)[0].total).to.equal(1);
  expect(last(reports)[0].failed).to.equal(0);
});

it('does not report again when a change leaves the task where it was', () => {
  const reports = watch();
  const zone = mountDropzone();
  zone.request();
  zone.set([{ unique: 'a', status: 'waiting', progress: 10 }]);
  zone.set([{ unique: 'a', status: 'waiting', progress: 10 }]);
  expect(reports).to.have.lengthOf(1);
});

it('drops a dropzone that has gone once anything else asks for a context, so navigating away clears it', () => {
  const reports = watch();
  const zone = mountDropzone();
  zone.request();
  zone.set([{ unique: 'a', status: 'error' }]);
  zone.remove();
  somethingElseRequests();
  expect(last(reports)).to.deep.equal([]);
  expect(zone.subscriberCount).to.equal(0);
});

it('sums two dropzones in one frame as two tasks', () => {
  const reports = watch();
  const first = mountDropzone();
  const second = mountDropzone();
  first.request();
  second.request();
  first.set([{ unique: 'a', status: 'waiting' }]);
  second.set([{ unique: 'b', status: 'waiting' }]);
  expect(last(reports)).to.have.lengthOf(2);
  expect(new Set(last(reports).map((task) => task.id)).size, 'ids stay distinct').to.equal(2);
});

it('lets go of every subscription and stops listening when stopped', () => {
  const zone = mountDropzone();
  const reports: unknown[] = [];
  const stop = watchFrameUploads(document, (tasks) => reports.push(tasks));
  zone.request();
  expect(zone.subscriberCount).to.equal(1);
  stop();
  expect(zone.subscriberCount).to.equal(0);
  const later = mountDropzone();
  later.request();
  later.set([{ unique: 'a', status: 'waiting' }]);
  expect(reports).to.deep.equal([]);
});

it('finds a dropzone in another realm, as every real one is: the window is an iframe', async () => {
  // A same-origin frame has its own globals, so its elements are not instances of this document's
  // `Element`. The first version asked `instanceof Element`, passed every test above, and found
  // nothing at all in a real backoffice.
  const frame = document.createElement('iframe');
  document.body.appendChild(frame);
  teardown.push(() => frame.remove());
  const doc = frame.contentDocument!;
  const reports: Array<ReadonlyArray<UmbraDesktopTask>> = [];
  teardown.push(watchFrameUploads(doc, (tasks) => reports.push(tasks)));
  let emit: (items: Item[]) => void = () => {};
  const zone = Object.assign(doc.createElement('div'), {
    progressItems: () => ({
      subscribe(next: (value: Item[]) => void) {
        emit = next;
        next([]);
        return { unsubscribe: () => {} };
      },
    }),
  });
  doc.body.appendChild(zone);
  zone.dispatchEvent(Object.assign(new (frame.contentWindow as typeof window).Event('umb:context-request', { bubbles: true, composed: true }), { contextAlias: 'UmbNotificationContext' }));
  emit([{ unique: 'a', status: 'waiting' }]);
  expect(last(reports)).to.have.lengthOf(1);
});
