import { expect } from '@open-wc/testing';
import { manifests, UMBRADESKTOP_ADD_ONS_APP_ALIAS } from './manifest.js';
import type { ManifestUmbraDesktopApp } from '../app.extension.js';

describe('the Add-ons app manifest', () => {
  const app = manifests.find((manifest) => manifest.alias === UMBRADESKTOP_ADD_ONS_APP_ALIAS) as ManifestUmbraDesktopApp;

  it('is a desktop app in the System group', () => {
    expect(app.type).to.equal('umbraDesktopApp');
    expect(app.meta.group).to.equal('system');
    expect(app.meta.label).to.equal('#umbraDesktop_appAddOns');
  });

  it('has no conditions, so every user can open it', () => {
    expect(app.conditions ?? []).to.deep.equal([]);
  });

  it('opens one window, since a second would only show the same list again', () => {
    expect(app.meta.allowMultiple).to.equal(false);
  });
});
