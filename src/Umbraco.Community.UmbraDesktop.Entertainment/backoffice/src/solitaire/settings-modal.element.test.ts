import { expect, fixture, html, oneEvent } from '@open-wc/testing';
import './settings-modal.element.js';
import type { SolitaireSettingsModalElement } from './settings-modal.element.js';

describe('solitaire settings modal', () => {
  async function modal(): Promise<SolitaireSettingsModalElement> {
    return fixture<SolitaireSettingsModalElement>(html`<umbradesktop-solitaire-settings
      .drawCount=${1}
      .backs=${[
        { alias: 'a', label: 'A', image: '/a.avif' },
        { alias: 'b', label: 'B', image: '/b.avif' },
      ]}
      .faces=${[
        {
          alias: 'f',
          label: 'F',
          preview: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140"></svg>',
        },
      ]}
      .selectedBack=${'a'}
      .selectedFaces=${'f'}
    ></umbradesktop-solitaire-settings>`);
  }

  const q = (el: Element, s: string) => el.shadowRoot!.querySelector<HTMLElement>(s)!;

  /**
   * The Leaderboard section is the Arcade's way in from Solitaire (design P6), so it is there only
   * when the game says the Arcade answered, and pressing it asks the game rather than opening anything.
   */
  it('offers Leaderboard only when told the Arcade is there, and asks for it', async () => {
    const without = await modal();
    expect(without.shadowRoot!.querySelector('[data-action="leaderboard"]') === null, 'no Leaderboard without the Arcade').to.equal(true);
    expect(without.shadowRoot!.querySelectorAll('section').length, 'the three sections it always had').to.equal(3);
    const el = await modal();
    el.showLeaderboard = true;
    await el.updateComplete;
    const sections = el.shadowRoot!.querySelectorAll('section');
    expect(sections.length, 'a fourth section').to.equal(4);
    expect(sections[3].querySelector('h3')!.textContent!.trim()).to.equal('Leaderboard');
    const button = q(el, '[data-action="leaderboard"]');
    expect(button.textContent!.trim()).to.equal('Show the leaderboard');
    setTimeout(() => button.click());
    await oneEvent(el, 'solitaire-settings-leaderboard');
  });

  it('is a dialog that says what it is', async () => {
    const el = await modal();
    expect(q(el, '[role="dialog"]').getAttribute('aria-modal')).to.equal('true');
  });

  it('marks the current choices', async () => {
    const el = await modal();
    expect(q(el, '[data-draw="1"]').getAttribute('aria-pressed')).to.equal('true');
    expect(q(el, '[data-back="a"]').getAttribute('aria-pressed')).to.equal('true');
    expect(q(el, '[data-back="b"]').getAttribute('aria-pressed')).to.equal('false');
  });

  it('reports each change as it is made', async () => {
    const el = await modal();
    setTimeout(() => q(el, '[data-draw="3"]').click());
    expect((await oneEvent(el, 'solitaire-settings-change')).detail).to.deep.equal({ drawCount: 3 });
    setTimeout(() => q(el, '[data-back="b"]').click());
    expect((await oneEvent(el, 'solitaire-settings-change')).detail).to.deep.equal({ back: 'b' });
  });

  it('closes on Done and on Escape', async () => {
    const el = await modal();
    setTimeout(() => q(el, '.done').click());
    await oneEvent(el, 'solitaire-settings-close');
    setTimeout(() =>
      q(el, '[role="dialog"]').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
      ),
    );
    await oneEvent(el, 'solitaire-settings-close');
  });

  it('keeps Tab inside the dialog', async () => {
    const el = await modal();
    const buttons = Array.from(el.shadowRoot!.querySelectorAll<HTMLElement>('button'));
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    const press = (shiftKey: boolean) => {
      const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, composed: true, cancelable: true });
      q(el, '[role="dialog"]').dispatchEvent(event);
      return event;
    };
    last.focus();
    expect(press(false).defaultPrevented, 'Tab from the last is taken over').to.equal(true);
    expect(el.shadowRoot!.activeElement).to.equal(first);
    expect(press(true).defaultPrevented, 'Shift+Tab from the first is taken over').to.equal(true);
    expect(el.shadowRoot!.activeElement).to.equal(last);
    buttons[1].focus();
    expect(press(false).defaultPrevented, 'Tab in the middle is left to the browser').to.equal(false);
  });

  it('puts focus inside when it opens', async () => {
    const el = await modal();
    // `activeElement` is null, not undefined, when nothing inside has focus; compare to a real control.
    expect(el.shadowRoot!.activeElement?.tagName, 'a control inside the dialog has focus').to.equal('BUTTON');
  });

  it('gives each section a bordered box with a sentence-case headline, as Umbraco does', async () => {
    const el = await modal();
    const boxes = Array.from(el.shadowRoot!.querySelectorAll<HTMLElement>('section'));
    expect(boxes.length).to.equal(3);
    for (const box of boxes) {
      expect(parseFloat(getComputedStyle(box).borderTopWidth), 'box border').to.be.greaterThan(0);
      expect(parseFloat(getComputedStyle(box).borderTopLeftRadius), 'box radius').to.be.greaterThan(0);
      const headline = getComputedStyle(box.querySelector('h3')!);
      expect(headline.textTransform, 'not uppercase').to.equal('none');
      expect(headline.letterSpacing, 'no tracking').to.equal('normal');
      expect(headline.fontSize).to.equal('15px');
      expect(Number(headline.fontWeight), 'semibold').to.equal(600);
    }
  });

  it('draws the boxes as Windows 98 group boxes, headline on a grooved border', async () => {
    const el = await modal();
    el.setAttribute('data-umbradesktop-theme', 'win98');
    await el.updateComplete;
    const box = el.shadowRoot!.querySelector('section')!;
    expect(getComputedStyle(box).borderTopStyle).to.equal('groove');
    expect(parseFloat(getComputedStyle(box).borderTopWidth)).to.equal(2);
    const headline = box.querySelector('h3')!.getBoundingClientRect();
    const edge = box.getBoundingClientRect();
    expect(headline.top + headline.height / 2, 'legend sits on the top border').to.be.closeTo(edge.top + 1, 2);
  });
  /**
   * The close control is the desktop's window close, not a form button: flat at rest with the
   * titlebar's cross glyph, and a traffic light under macOS.
   */
  it('draws its close control like a window close, not a raised button', async () => {
    const el = await modal();
    const x = q(el, '.x');
    expect(!!x.querySelector('svg.glyph'), 'the titlebar cross glyph').to.equal(true);
    expect(x.textContent?.trim(), 'no text multiplication sign').to.equal('');
    expect(getComputedStyle(x).backgroundColor, 'flat at rest').to.equal('rgba(0, 0, 0, 0)');
    expect(getComputedStyle(x).borderTopStyle).to.equal('none');
    el.setAttribute('data-umbradesktop-theme', 'macos');
    await el.updateComplete;
    expect(getComputedStyle(x).borderTopLeftRadius, 'a round traffic light').to.equal('50%');
  });
});
