import { expect } from '@open-wc/testing';
import { isSectionRoutePath, waitForSectionRoute } from './router-ready';

it('recognises a rendered section route by its path', () => {
  expect(isSectionRoutePath('/umbraco/section/content')).to.equal(true);
  expect(isSectionRoutePath('/umbraco/section/content/workspace/document/edit/1')).to.equal(true);
  expect(isSectionRoutePath('/manage/section/umbradesktop')).to.equal(true);
  // The backoffice root is where the app-level router finishes *before* any section exists, which
  // is precisely the moment this must not mistake for a live section router.
  expect(isSectionRoutePath('/umbraco')).to.equal(false);
  expect(isSectionRoutePath('/umbraco/')).to.equal(false);
  expect(isSectionRoutePath('/umbraco/login')).to.equal(false);
});

it('resolves when a navigation ends on a section route', async () => {
  const target = new EventTarget();
  const waiting = waitForSectionRoute({ target, getPath: () => '/umbraco/section/content' });
  target.dispatchEvent(new CustomEvent('navigationend'));
  await waiting;
});

it('resolves immediately when a section route is already showing', async () => {
  // A typed desktop URL, or a backoffice that got there before the decision was made.
  await waitForSectionRoute({ target: new EventTarget(), getPath: () => '/umbraco/section/umbradesktop' });
});

it('ignores a navigation that ended on the backoffice root, and waits for the next one', async () => {
  // The app-level router slot renders the backoffice itself and dispatches this event while the URL
  // is still the root. Treating that as "the section router is live" would put the boot back in the
  // window where its navigation is silently lost, which is the whole reason this is not simply
  // "the first navigationend".
  const target = new EventTarget();
  let path = '/umbraco';
  let resolved = false;
  const waiting = waitForSectionRoute({ target, getPath: () => path }).then(() => (resolved = true));

  target.dispatchEvent(new CustomEvent('navigationend'));
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(resolved, 'a root navigation must not count').to.equal(false);

  path = '/umbraco/section/content';
  target.dispatchEvent(new CustomEvent('navigationend'));
  await waiting;
  expect(resolved).to.equal(true);
});

it('stops listening once it has resolved', async () => {
  const target = new EventTarget();
  const waiting = waitForSectionRoute({ target, getPath: () => '/umbraco/section/content' });
  target.dispatchEvent(new CustomEvent('navigationend'));
  await waiting;
  // A second event after resolution must not throw or re-resolve; nothing should still be attached.
  expect(() => target.dispatchEvent(new CustomEvent('navigationend'))).to.not.throw();
});
