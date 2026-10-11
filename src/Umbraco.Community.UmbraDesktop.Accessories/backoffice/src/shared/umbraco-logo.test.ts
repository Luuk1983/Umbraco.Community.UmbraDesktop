import { expect } from '@open-wc/testing';
import { UMBRACO_LOGO_PATH, UMBRACO_LOGO_VIEWBOX } from './umbraco-logo.js';
// Umbraco's own icon, read from the installed backoffice package. Only a test can reach it this
// way: at runtime the backoffice exposes its public entry points and not this file, which is why
// the logo module holds a copy at all.
import iconUmbraco from '../../../node_modules/@umbraco-cms/backoffice/dist-cms/packages/core/icon-registry/icons/icon-umbraco.js';

/**
 * The logo is Umbraco's, not a drawing of it.
 *
 * System Information and Flying Umbraco both drew a homemade U, a rounded stroke on a disc, and it
 * was reported as not looking like the Umbraco logo, which it did not. The module now carries the
 * path from Umbraco's own `icon-umbraco`, and this pins the copy to the original so an Umbraco
 * upgrade that redraws the mark fails here instead of quietly leaving the old one behind.
 */
describe('umbraco logo', () => {
  it("is exactly the path in Umbraco's own icon-umbraco", () => {
    const svg = new DOMParser().parseFromString(iconUmbraco, 'image/svg+xml').documentElement;
    expect(svg.getAttribute('viewBox')).to.equal(UMBRACO_LOGO_VIEWBOX);
    expect(svg.querySelector('path')!.getAttribute('d')).to.equal(UMBRACO_LOGO_PATH);
  });
});
