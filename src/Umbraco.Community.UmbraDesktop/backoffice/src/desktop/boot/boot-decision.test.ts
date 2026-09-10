import { expect } from '@open-wc/testing';
import {
  desktopSectionPath,
  exitDesktopPath,
  isBackofficeRoot,
  isBootDisabledByUrl,
  isDesktopSectionPath,
  shouldBootIntoDesktop,
  shouldRaiseSplash,
} from './boot-decision';

const BASE = '/umbraco';

it('recognises the backoffice root, with or without a trailing slash', () => {
  expect(isBackofficeRoot('/umbraco', BASE)).to.equal(true);
  expect(isBackofficeRoot('/umbraco/', BASE)).to.equal(true);
  expect(isBackofficeRoot('/umbraco/section/content', BASE)).to.equal(false);
});

it('recognises a non-default backoffice path, since the path is configurable', () => {
  expect(isBackofficeRoot('/manage', '/manage')).to.equal(true);
  expect(isBackofficeRoot('/manage/', '/manage/')).to.equal(true);
  expect(isBackofficeRoot('/manage/section/content', '/manage')).to.equal(false);
  // A path that merely starts the same is not the root.
  expect(isBackofficeRoot('/umbraco-admin', BASE)).to.equal(false);
});

it('builds and recognises the desktop section path', () => {
  expect(desktopSectionPath(BASE)).to.equal('/umbraco/section/umbradesktop');
  expect(desktopSectionPath('/manage/')).to.equal('/manage/section/umbradesktop');
  expect(isDesktopSectionPath('/umbraco/section/umbradesktop', BASE)).to.equal(true);
  expect(isDesktopSectionPath('/umbraco/section/umbradesktop/', BASE)).to.equal(true);
  expect(isDesktopSectionPath('/umbraco/section/umbradesktop/workspace/x', BASE)).to.equal(true);
  expect(isDesktopSectionPath('/umbraco/section/content', BASE)).to.equal(false);
  // A sibling section whose name merely starts the same must not count.
  expect(isDesktopSectionPath('/umbraco/section/umbradesktop-extra', BASE)).to.equal(false);
});

it('leaves the desktop for the Content section, from any route inside it', () => {
  expect(exitDesktopPath('/umbraco/section/umbradesktop')).to.equal('/umbraco/section/content');
  expect(exitDesktopPath('/umbraco/section/umbradesktop/workspace/document/edit/1')).to.equal(
    '/umbraco/section/content',
  );
  // A configured backoffice path is preserved, since only the section part is replaced.
  expect(exitDesktopPath('/manage/section/umbradesktop')).to.equal('/manage/section/content');
});

it('leaves a path with no section segment alone rather than inventing one', () => {
  expect(exitDesktopPath('/umbraco')).to.equal('/umbraco');
});

it('reads the escape flag off the query string', () => {
  expect(isBootDisabledByUrl('?desktop=off')).to.equal(true);
  expect(isBootDisabledByUrl('?foo=1&desktop=off')).to.equal(true);
  expect(isBootDisabledByUrl('?desktop=on')).to.equal(false);
  expect(isBootDisabledByUrl('?desktop=')).to.equal(false);
  expect(isBootDisabledByUrl('')).to.equal(false);
});

const boot = {
  landingPathname: '/umbraco',
  backofficePath: BASE,
  landingSearch: '',
  preference: true,
  exited: false,
  markerPresent: false,
  hasSectionAccess: true,
};

it('boots into the desktop from the root when the preference is on', () => {
  expect(shouldBootIntoDesktop(boot)).to.equal(true);
});

it('does not boot when the preference is off', () => {
  expect(shouldBootIntoDesktop({ ...boot, preference: false })).to.equal(false);
});

it('never boots away from a deep link, because that link is somebody’s bookmark', () => {
  expect(shouldBootIntoDesktop({ ...boot, landingPathname: '/umbraco/section/content' })).to.equal(false);
  expect(
    shouldBootIntoDesktop({ ...boot, landingPathname: '/umbraco/section/content/workspace/document/edit/123' }),
  ).to.equal(false);
});

it('judges the landing path, not wherever the router has since gone', () => {
  // The regression this guards: the caller used to read `location.pathname` live, after awaiting the
  // current user. By then core's router has redirected the root to the first allowed section, so a
  // load that genuinely landed on the root looked like a deep link and the boot silently declined —
  // after the splash had already gone up. A landing path of the root must boot, and the input is
  // named for that so a live read looks wrong at the call site.
  expect(shouldBootIntoDesktop({ ...boot, landingPathname: '/umbraco' })).to.equal(true);
});

it('does not boot a user who has no access to the desktop section', () => {
  // The section route only exists for granted users, so redirecting one without access would land
  // them on Not Found. Access is checked, never trusted from storage.
  expect(shouldBootIntoDesktop({ ...boot, hasSectionAccess: false })).to.equal(false);
});

it('does not boot when the URL says off', () => {
  expect(shouldBootIntoDesktop({ ...boot, landingSearch: '?desktop=off' })).to.equal(false);
});

it('does not boot after the user has exited the desktop in this tab', () => {
  expect(shouldBootIntoDesktop({ ...boot, exited: true })).to.equal(false);
});

it('does not boot when the previous attempt never reported a mounted desktop', () => {
  expect(shouldBootIntoDesktop({ ...boot, markerPresent: true })).to.equal(false);
});

const splash = {
  landingPathname: '/umbraco',
  backofficePath: BASE,
  landingSearch: '',
  hint: true,
  exited: false,
  markerPresent: false,
};

it('raises the splash when this browser expects to boot into the desktop', () => {
  expect(shouldRaiseSplash(splash)).to.equal(true);
});

it('raises the splash when the desktop is opened directly by URL, hint or no hint', () => {
  // Not a boot at all: a fresh load of a desktop URL flashes the classic header and then a desktop
  // wearing the default theme, so it needs the same cover.
  const landingPathname = '/umbraco/section/umbradesktop';
  expect(shouldRaiseSplash({ ...splash, landingPathname, hint: false })).to.equal(true);
  expect(shouldRaiseSplash({ ...splash, landingPathname, hint: false, exited: true })).to.equal(true);
  expect(shouldRaiseSplash({ ...splash, landingPathname, hint: false, landingSearch: '?desktop=off' })).to.equal(true);
});

it('does not raise the splash on the root unless a boot is actually expected', () => {
  expect(shouldRaiseSplash({ ...splash, hint: false })).to.equal(false);
  expect(shouldRaiseSplash({ ...splash, landingSearch: '?desktop=off' })).to.equal(false);
  expect(shouldRaiseSplash({ ...splash, exited: true })).to.equal(false);
  expect(shouldRaiseSplash({ ...splash, markerPresent: true })).to.equal(false);
});

it('does not raise the splash anywhere else in the backoffice', () => {
  // In-app navigation into the desktop needs no cover: the user is already loaded and the settings
  // read is synchronous, so there is no gap, and a splash would just be noise.
  expect(shouldRaiseSplash({ ...splash, landingPathname: '/umbraco/section/content' })).to.equal(false);
});

it('agrees with the boot decision on every path it covers', () => {
  // The two are separate because they run at different moments with different knowledge, which
  // makes it easy for them to drift. On the root, with the hint matching the preference and nothing
  // else in the way, they must reach the same answer.
  for (const on of [true, false]) {
    expect(shouldRaiseSplash({ ...splash, hint: on })).to.equal(
      shouldBootIntoDesktop({ ...boot, preference: on }),
    );
  }
});
