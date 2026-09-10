import { expect } from '@open-wc/testing';
import { bootLanding } from './landing';

it('records where the load landed', () => {
  // Captured when this module was first imported, which in a test run is the runner's own URL.
  expect(bootLanding().pathname).to.equal(window.location.pathname);
});

it('does not follow the URL once the router moves on', async () => {
  // The property the whole boot rests on. Core redirects the backoffice root to the first allowed
  // section within a few hundred milliseconds, so a reader that consults `location` gets the wrong
  // answer no matter how early it runs — which is exactly how this went wrong twice.
  const landed = bootLanding().pathname;
  const moved = `${landed}${landed.endsWith('/') ? '' : '/'}moved-on`;

  window.history.pushState(null, '', moved);
  try {
    expect(window.location.pathname, 'the URL really did change').to.equal(moved);
    expect(bootLanding().pathname, 'the landing path must not have changed').to.equal(landed);
  } finally {
    window.history.pushState(null, '', landed);
  }
});

it('hands out the same frozen record every time', () => {
  // One record, shared by the bundle module, the entrypoint and anything else that asks, so they
  // cannot disagree about where the load began.
  expect(bootLanding()).to.equal(bootLanding());
  expect(Object.isFrozen(bootLanding())).to.equal(true);
});
