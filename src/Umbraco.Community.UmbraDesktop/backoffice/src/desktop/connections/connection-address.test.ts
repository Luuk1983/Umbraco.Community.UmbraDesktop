import { expect } from '@open-wc/testing';
import { isUsableConnectionAddress } from './connection-address';

describe('connection address', () => {
  it('accepts an ordinary web address', () => {
    expect(isUsableConnectionAddress('https://www.example.com')).to.equal(true);
    expect(isUsableConnectionAddress('https://www.example.com/')).to.equal(true);
  });

  it('accepts plain http, because an internal instance may not be on TLS', () => {
    expect(isUsableConnectionAddress('http://intranet.local')).to.equal(true);
  });

  it('accepts a real port', () => {
    expect(isUsableConnectionAddress('https://localhost:44356')).to.equal(true);
  });

  it('ignores surrounding whitespace, which survives a paste', () => {
    expect(isUsableConnectionAddress('  https://www.example.com  ')).to.equal(true);
  });

  it('rejects a port that cannot exist', () => {
    // The address that found the bug this guard exists for. It reads perfectly, and every URL
    // parser rejects it, because a port cannot exceed 65535. An extra digit is an ordinary typo.
    expect(isUsableConnectionAddress('https://localhost:123456')).to.equal(false);
    expect(isUsableConnectionAddress('https://example.com:70000')).to.equal(false);
  });

  it('rejects something that is not a URL', () => {
    expect(isUsableConnectionAddress('random')).to.equal(false);
    expect(isUsableConnectionAddress('www.example.com')).to.equal(false);
    expect(isUsableConnectionAddress('/umbraco')).to.equal(false);
  });

  it('rejects an empty address without calling it invalid', () => {
    // Empty is "not filled in yet" rather than wrong, and the caller tells those apart: Save stays
    // disabled either way, but only one of them deserves an error message under the field.
    expect(isUsableConnectionAddress('')).to.equal(false);
    expect(isUsableConnectionAddress('   ')).to.equal(false);
  });

  it('rejects a scheme that is not http', () => {
    expect(isUsableConnectionAddress('ftp://example.com')).to.equal(false);
    expect(isUsableConnectionAddress('file:///c:/temp')).to.equal(false);
    expect(isUsableConnectionAddress('javascript:alert(1)')).to.equal(false);
  });
});
