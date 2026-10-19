import { expect } from '@open-wc/testing';
import { hasPrimaryModifier, isMacPlatform } from './platform-keys.js';

/** Modifier keys follow the platform (plan, global constraints): Cmd on a Mac, Ctrl elsewhere. */

describe('the platform', () => {
  it('is a Mac on macOS and iOS platforms', () => {
    expect(isMacPlatform('MacIntel')).to.equal(true);
    expect(isMacPlatform('iPhone')).to.equal(true);
    expect(isMacPlatform('iPad')).to.equal(true);
  });

  it('is not a Mac on Windows or Linux', () => {
    expect(isMacPlatform('Win32')).to.equal(false);
    expect(isMacPlatform('Linux x86_64')).to.equal(false);
    expect(isMacPlatform('')).to.equal(false);
  });
});

describe('the primary modifier', () => {
  it('is Cmd on a Mac, and Ctrl is not', () => {
    expect(hasPrimaryModifier({ metaKey: true, ctrlKey: false }, true)).to.equal(true);
    expect(hasPrimaryModifier({ metaKey: false, ctrlKey: true }, true)).to.equal(false);
  });

  it('is Ctrl elsewhere, and the Windows key is not', () => {
    expect(hasPrimaryModifier({ metaKey: false, ctrlKey: true }, false)).to.equal(true);
    expect(hasPrimaryModifier({ metaKey: true, ctrlKey: false }, false)).to.equal(false);
  });
});
