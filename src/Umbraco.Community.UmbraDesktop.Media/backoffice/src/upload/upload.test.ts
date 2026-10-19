import { expect } from '@open-wc/testing';
import { mediaUploadManagerClass } from './upload.js';

/** Core's media upload, reached for uploads into a folder a window does not show (plan task 6.7). */

describe('core\'s media upload', () => {
  it('is reached through core\'s dropzone element, which the media package exports, once', () => {
    const manager = mediaUploadManagerClass();
    expect(typeof manager.prototype.createMediaItems).to.equal('function');
    expect(mediaUploadManagerClass() === manager).to.equal(true);
  });
});
