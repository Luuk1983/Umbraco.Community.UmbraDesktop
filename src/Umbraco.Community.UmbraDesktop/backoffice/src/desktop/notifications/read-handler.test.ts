import { expect } from '@open-wc/testing';
import { UmbNotificationHandler } from '@umbraco-cms/backoffice/notification';
import { readNotificationHandler } from './read-handler.js';

/**
 * These build core's own handler rather than a stand-in, and that is the point of the file. The
 * reader takes the message out of a private field, `_data`, exactly as core's own container does,
 * and a stand-in would go on passing after an Umbraco upgrade renamed it. Against the real class, a
 * rename fails here, loudly, instead of every desktop toast quietly going blank.
 */

it('reads the message, headline, severity and duration off a real handler', () => {
  const handler = new UmbNotificationHandler({
    color: 'warning',
    duration: 4000,
    data: { headline: 'Deploy', message: 'The license is invalid' },
  });

  const read = readNotificationHandler(handler);

  expect(read, 'a handler core builds must be readable; if this fails, core changed _data').to.deep.include({
    key: handler.key,
    color: 'warning',
    duration: 4000,
    headline: 'Deploy',
    message: 'The license is invalid',
  });
  expect(read?.element, 'the default layout carries nothing worth raising again').to.equal(undefined);
});

it('reads a staying notification as having no duration', () => {
  const handler = new UmbNotificationHandler({ color: 'danger', duration: null, data: { message: 'Stays' } });
  expect(readNotificationHandler(handler)?.duration).to.equal(null);
});

it("takes core's default duration when the sender named none", () => {
  const handler = new UmbNotificationHandler({ data: { message: 'Saved' } });
  const read = readNotificationHandler(handler);
  expect(read?.duration, 'core defaults an unnamed duration to six seconds').to.equal(6000);
  expect(read?.color, "core's blank colour is its default one").to.equal('default');
});

it('carries a custom element and its data, so the notification can be raised again where it came from', () => {
  const data = { message: 'Could not save', headline: 'Error', errors: { name: ['Required'] } };
  const handler = new UmbNotificationHandler({ color: 'danger', elementName: 'umb-peek-error-notification', data });

  const read = readNotificationHandler(handler);

  expect(read?.message, 'shown on the desktop as its plain message').to.equal('Could not save');
  expect(read?.element).to.deep.equal({ name: 'umb-peek-error-notification', data });
  expect(read?.element?.data, 'a copy, so nothing held here reaches back into the frame').to.not.equal(data);
});

it('keeps the message but drops the element when its data cannot be copied', () => {
  const data: Record<string, unknown> = { message: 'Circular' };
  data.self = data;
  const handler = new UmbNotificationHandler({ elementName: 'my-element', data: data as { message: string } });

  const read = readNotificationHandler(handler);

  expect(read?.message).to.equal('Circular');
  expect(read?.element, 'data that cannot be copied cannot be raised again safely').to.equal(undefined);
});

it('reads a message that is not a string as empty rather than throwing', () => {
  const handler = new UmbNotificationHandler({ data: { message: 42 as unknown as string } });
  expect(readNotificationHandler(handler)?.message).to.equal('');
});

it('reads something that is not a handler as nothing', () => {
  expect(readNotificationHandler(undefined)).to.equal(undefined);
  expect(readNotificationHandler({})).to.equal(undefined);
});
