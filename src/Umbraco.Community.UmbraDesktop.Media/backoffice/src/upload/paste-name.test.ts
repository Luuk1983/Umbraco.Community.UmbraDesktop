import { expect } from '@open-wc/testing';
import { nameForPaste, pastedImageName } from './paste-name.js';

/** The name of a picture pasted from the OS clipboard (design §5, plan task 6.1). */

const AT = new Date(2026, 9, 17, 14, 3, 7);

describe('the name of a pasted picture', () => {
  it('is the prefix with the date and time, sortable and without a colon', () => {
    expect(pastedImageName(AT, 'Pasted image')).to.equal('Pasted image 2026.10.17 14.03.07');
  });

  it('replaces the name the browser gives every pasted picture, keeping the extension', () => {
    const renamed = nameForPaste(new File(['x'], 'image.png', { type: 'image/png' }), AT, 'Pasted image');
    expect([renamed.name, renamed.type]).to.deep.equal(['Pasted image 2026.10.17 14.03.07.png', 'image/png']);
  });

  it('names a picture without a name, from its type', () => {
    expect(nameForPaste(new File(['x'], '', { type: 'image/jpeg' }), AT, 'Pasted image').name).to.equal('Pasted image 2026.10.17 14.03.07.jpg');
  });

  it('leaves a file with a real name as it is', () => {
    const file = new File(['x'], 'holiday.jpg', { type: 'image/jpeg' });
    expect(nameForPaste(file, AT, 'Pasted image') === file).to.equal(true);
  });
});
