import { expect } from '@open-wc/testing';
import { desktopLabelText } from './desktop-label-text.js';

/**
 * The label's text is decided here and nowhere else, so the element only draws what it is handed.
 * The rules are few, but each one is something a site sees on every desktop: the name when there
 * is one, the domain standing in when there is not, and never the domain twice.
 */

const DOMAIN = 'staging.contoso.com';

describe('desktopLabelText', () => {
  it('shows the name alone when the domain line is off', () => {
    expect(desktopLabelText('Contoso Staging', DOMAIN, false)).to.deep.equal({
      name: 'Contoso Staging',
      domain: null,
    });
  });

  it('puts the domain under the name when the domain line is on', () => {
    expect(desktopLabelText('Contoso Staging', DOMAIN, true)).to.deep.equal({
      name: 'Contoso Staging',
      domain: DOMAIN,
    });
  });

  it('shows the domain in place of a missing name', () => {
    // The installed app falls back to "Umbraco" here, which on a desktop says nothing. The domain
    // at least says which site this is.
    expect(desktopLabelText(null, DOMAIN, false)).to.deep.equal({ name: DOMAIN, domain: null });
    expect(desktopLabelText(undefined, DOMAIN, false)).to.deep.equal({ name: DOMAIN, domain: null });
  });

  it('never shows the domain twice', () => {
    expect(desktopLabelText(null, DOMAIN, true)).to.deep.equal({ name: DOMAIN, domain: null });
  });

  it('treats a blank name as missing', () => {
    expect(desktopLabelText('   ', DOMAIN, true)).to.deep.equal({ name: DOMAIN, domain: null });
  });

  it('trims the name', () => {
    expect(desktopLabelText('  Contoso Staging  ', DOMAIN, false).name).to.equal('Contoso Staging');
  });
});
