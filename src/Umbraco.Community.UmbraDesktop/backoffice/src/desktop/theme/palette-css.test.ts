import { expect } from '@open-wc/testing';
import { paletteCss } from './palette-css';

it('renders each token as a declaration', () => {
  expect(
    paletteCss({
      '--umbradesktop-window-radius': '10px',
      '--umbradesktop-taskbar-height': '44px',
    }),
  ).to.equal('--umbradesktop-window-radius:10px;--umbradesktop-taskbar-height:44px;');
});

it('renders an empty palette as an empty string, so the identity theme sets nothing', () => {
  expect(paletteCss({})).to.equal('');
});

it('skips a token whose value is undefined rather than emitting "undefined"', () => {
  expect(paletteCss({ '--umbradesktop-window-radius': undefined })).to.equal('');
});
