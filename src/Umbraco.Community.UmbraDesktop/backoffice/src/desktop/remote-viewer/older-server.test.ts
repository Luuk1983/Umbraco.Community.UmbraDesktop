import { expect } from '@open-wc/testing';
import { olderServerDefaultsFor, withOlderServerDefaults } from './older-server';

const CURRENT_USER = '/umbraco/management/api/v1/user/current';

describe('remote viewer, reading an older Umbraco', () => {
  it('knows what an Umbraco 17 current user lacks that an 18 backoffice reads', () => {
    // Measured, not guessed: an 18 frame showing a 17 site stopped booting in getCurrentUser,
    // mapping elementStartNodeIds, which 17 has no Elements to send (measured on real 17 and 18 instances, #164).
    expect(olderServerDefaultsFor(CURRENT_USER)).to.deep.equal({ elementStartNodeIds: [], hasElementRootAccess: false });
  });

  it('matches the current user with a query string too', () => {
    expect(olderServerDefaultsFor(`${CURRENT_USER}?x=1`)).to.not.equal(undefined);
  });

  it('leaves every other path alone, including the ones below the current user', () => {
    expect(olderServerDefaultsFor(`${CURRENT_USER}/permissions/document?id=1`)).to.equal(undefined);
    expect(olderServerDefaultsFor('/umbraco/management/api/v1/user/1234')).to.equal(undefined);
    expect(olderServerDefaultsFor('/umbraco/management/api/v1/tree/document/root')).to.equal(undefined);
  });

  it('adds only what is missing, so a server that sends the fields keeps its own values', () => {
    const fromEighteen = { id: 'u', elementStartNodeIds: [{ id: 'e1' }], hasElementRootAccess: true };
    expect(withOlderServerDefaults(fromEighteen, { elementStartNodeIds: [], hasElementRootAccess: false })).to.deep.equal(fromEighteen);
    const fromSeventeen = { id: 'u' };
    expect(withOlderServerDefaults(fromSeventeen, { elementStartNodeIds: [], hasElementRootAccess: false })).to.deep.equal({
      id: 'u',
      elementStartNodeIds: [],
      hasElementRootAccess: false,
    });
    expect(fromSeventeen, 'the answer it was given is not changed').to.deep.equal({ id: 'u' });
  });

  it('passes anything that is not an object through untouched', () => {
    expect(withOlderServerDefaults(null, { a: 1 })).to.equal(null);
    expect(withOlderServerDefaults([1, 2], { a: 1 })).to.deep.equal([1, 2]);
  });
});
