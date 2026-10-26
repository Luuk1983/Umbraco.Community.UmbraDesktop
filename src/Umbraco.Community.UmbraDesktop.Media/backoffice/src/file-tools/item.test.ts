import { expect } from '@open-wc/testing';
import { itemOf } from './item.js';

/** The item a file tool acts on (#176), read from the media workspace the tool sits in. */
describe('itemOf', () => {
  it("is the workspace's item, with its name", () => {
    expect(itemOf({ getUnique: () => 'k1', getName: () => 'Beach' })).to.deep.equal({ unique: 'k1', name: 'Beach' });
  });

  it('is nothing for an item not saved yet', () => {
    expect(itemOf({ getUnique: () => null, getName: () => 'New' })).to.equal(undefined);
  });

  it('has an empty name when the workspace has none', () => {
    expect(itemOf({ getUnique: () => 'k1', getName: () => undefined })).to.deep.equal({ unique: 'k1', name: '' });
  });
});
