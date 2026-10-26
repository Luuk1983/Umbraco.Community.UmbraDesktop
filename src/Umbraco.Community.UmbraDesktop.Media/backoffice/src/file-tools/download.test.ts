import { expect } from '@open-wc/testing';
import { downloadFile, downloadName } from './download.js';

/** Download on a media item (#176): the saved file, under the person's own file name. */
describe('downloadName', () => {
  it('is the last part of the address', () => {
    expect(downloadName('/media/abc123/beach.jpg')).to.equal('beach.jpg');
  });

  it('drops the marker a save over the item added', () => {
    expect(downloadName('/media/abc123/beach-ud3f9a1c07.jpg')).to.equal('beach.jpg');
  });

  it('decodes the address', () => {
    expect(downloadName('/media/abc123/summer%20beach.jpg')).to.equal('summer beach.jpg');
  });

  it('leaves out a query and a hash', () => {
    expect(downloadName('https://site.test/media/abc123/beach.jpg?v=2#x')).to.equal('beach.jpg');
  });

  it('keeps a name without an extension', () => {
    expect(downloadName('/media/abc123/README-ud0badf00d')).to.equal('README');
  });
});

describe('downloadFile', () => {
  it("clicks a link to the item's file, and takes it away again", async () => {
    const clicked: HTMLAnchorElement[] = [];
    const listener = (event: Event) => {
      clicked.push(event.target as HTMLAnchorElement);
      event.preventDefault();
    };
    document.addEventListener('click', listener, true);
    try {
      const done = await downloadFile(document, { unique: 'k1', name: 'Beach' }, { urlOf: async () => '/media/abc/beach-ud3f9a1c07.jpg', notify: () => undefined });
      expect(done).to.equal(true);
      expect(clicked.length).to.equal(1);
      expect(clicked[0].getAttribute('href')).to.equal('/media/abc/beach-ud3f9a1c07.jpg');
      expect(clicked[0].getAttribute('download')).to.equal('beach.jpg');
      expect(clicked[0].getAttribute('data-router-slot')).to.equal('disabled');
      expect(clicked[0].isConnected).to.equal(false);
    } finally {
      document.removeEventListener('click', listener, true);
    }
  });

  it('says so when the item has no file, and clicks nothing', async () => {
    const said: string[] = [];
    let clicks = 0;
    const listener = () => clicks++;
    document.addEventListener('click', listener, true);
    try {
      const done = await downloadFile(document, { unique: 'k1', name: 'Beach' }, { urlOf: async () => undefined, notify: (name) => said.push(name) });
      expect(done).to.equal(false);
      expect(said).to.deep.equal(['Beach']);
      expect(clicks).to.equal(0);
    } finally {
      document.removeEventListener('click', listener, true);
    }
  });
});
