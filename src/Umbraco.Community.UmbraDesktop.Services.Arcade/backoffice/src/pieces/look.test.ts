import { expect, fixture, html } from '@open-wc/testing';
import { LitElement, customElement } from '@umbraco-cms/backoffice/external/lit';
import { arcadeLook, arcadeTheme } from './look.js';

/**
 * A bare piece wearing the shared look, with a button and a podium both on a panel (`.glass`) and on
 * the felt, so a theme's values can be read where the real pieces put them.
 */
@customElement('umbradesktop-arcade-look-test')
class LookTest extends LitElement {
  static override styles = [arcadeTheme, arcadeLook];

  /** @returns A button and a podium step on a panel, and the same on the felt. */
  override render() {
    return html`<div class="felt">
      <button class="btn" data-on="felt">Play</button>
      <button class="link" data-on="felt">‹ All games</button>
      <div class="step s2" data-on="felt">2</div>
      <div class="glass">
        <button class="link" data-on="glass">Leaderboard ›</button>
        <button class="btn sm" data-on="glass">Play again</button>
        <button class="btn ghost sm" data-on="glass">Yes, show my scores</button>
        <div class="podium"><div class="step s1" data-on="glass">1</div><div class="step s2" data-on="glass">2</div><div class="step s3" data-on="glass">3</div></div>
      </div>
    </div>`;
  }
}

/**
 * Relative luminance of a computed `rgb()` colour, per WCAG.
 * @param rgb A computed colour such as `rgb(0, 0, 128)`.
 * @returns Its luminance, 0 to 1.
 */
function luminance(rgb: string): number {
  const [r, g, b] = rgb.match(/[\d.]+/g)!.slice(0, 3).map((n) => {
    const c = Number(n) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The contrast ratio between two computed colours.
 * @param a One colour.
 * @param b The other.
 * @returns The ratio, 1 to 21.
 */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('the Arcade look under Windows 98', () => {
  /**
   * Measured in a real desktop: inside a panel the accent is navy, so the accent-gradient button drew
   * black text on navy ("Play again", "Save", the overview's Play), and the podium's light step
   * numbers sat on silver where nobody could read them. Windows 98 buttons and steps are solid
   * bevelled blocks with black text.
   */
  it('draws every button as a solid silver bevel with black text, on a panel or on the felt', async () => {
    const el = await fixture<LookTest>(html`<umbradesktop-arcade-look-test data-umbradesktop-theme="win98"></umbradesktop-arcade-look-test>`);
    for (const button of el.shadowRoot!.querySelectorAll<HTMLElement>('.btn')) {
      const style = getComputedStyle(button);
      const where = `${button.textContent} on the ${button.dataset.on}`;
      expect(style.backgroundImage, `${where}: no accent gradient`).to.equal('none');
      expect(style.backgroundColor, `${where}: silver`).to.equal('rgb(192, 192, 192)');
      expect(style.color, `${where}: black text`).to.equal('rgb(0, 0, 0)');
      expect(style.boxShadow, `${where}: bevelled`).to.contain('inset');
    }
  });

  it('gives the podium steps solid grounds their numbers can be read on', async () => {
    const el = await fixture<LookTest>(html`<umbradesktop-arcade-look-test data-umbradesktop-theme="win98"></umbradesktop-arcade-look-test>`);
    for (const step of el.shadowRoot!.querySelectorAll<HTMLElement>('.step')) {
      const style = getComputedStyle(step);
      const where = `step ${step.textContent} on the ${step.dataset.on}`;
      expect(style.backgroundImage, `${where}: solid`).to.equal('none');
      expect(contrast(style.color, style.backgroundColor) >= 4.5, `${where}: ${style.color} on ${style.backgroundColor}`).to.equal(true);
    }
  });

  /**
   * The accent is the links' colour. On the teal felt it was silver, 2.6:1 ("‹ All games" in the
   * hub); in a panel it is navy on silver.
   */
  it('draws links readable on the felt and in a panel', async () => {
    const el = await fixture<LookTest>(html`<umbradesktop-arcade-look-test data-umbradesktop-theme="win98"></umbradesktop-arcade-look-test>`);
    const root = el.shadowRoot!;
    const felt = getComputedStyle(root.querySelector('.felt')!).backgroundColor;
    const panel = getComputedStyle(root.querySelector('.glass')!).backgroundColor;
    const onFelt = getComputedStyle(root.querySelector('.link[data-on="felt"]')!).color;
    const onPanel = getComputedStyle(root.querySelector('.link[data-on="glass"]')!).color;
    expect(contrast(onFelt, felt) >= 4.5, `on the felt: ${onFelt} on ${felt}`).to.equal(true);
    expect(contrast(onPanel, panel) >= 4.5, `in a panel: ${onPanel} on ${panel}`).to.equal(true);
  });

  /**
   * The leaderboard panel shrinks the steps (its third is 18px high with a 15px number and 4px on
   * top), so the number ran 4px past the step's bottom. On the other themes' fading gradients that
   * hardly shows; on a solid bevel the edge cut through the "3".
   */
  it('keeps each step\'s number inside its bevel at the panel\'s sizes', async () => {
    // The desktop's line height and Windows 98's app font, as the real panel inherits them.
    const el = await fixture<LookTest>(html`<umbradesktop-arcade-look-test data-umbradesktop-theme="win98"
      style="line-height: 1.4; --umbradesktop-app-font: 'MS Sans Serif', 'Microsoft Sans Serif', Tahoma, Verdana, sans-serif"></umbradesktop-arcade-look-test>`);
    const sheet = new CSSStyleSheet();
    sheet.replaceSync('.podium .step { font-size: 15px; padding-top: 4px; } .podium .step.s1 { height: 34px; } .podium .step.s2 { height: 24px; } .podium .step.s3 { height: 18px; }');
    el.shadowRoot!.adoptedStyleSheets = [...el.shadowRoot!.adoptedStyleSheets, sheet];
    for (const step of el.shadowRoot!.querySelectorAll<HTMLElement>('.podium .step')) {
      const box = step.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(step);
      const text = range.getBoundingClientRect();
      // The bevel is 2px deep on each side; the number must clear it.
      expect(text.top >= box.top + 2 && text.bottom <= box.bottom - 2, `step ${step.textContent}: text ${text.top}-${text.bottom} in ${box.top}-${box.bottom}`).to.equal(true);
    }
  });

  it('leaves the other themes their accent buttons', async () => {
    const el = await fixture<LookTest>(html`<umbradesktop-arcade-look-test data-umbradesktop-theme="macos"></umbradesktop-arcade-look-test>`);
    expect(getComputedStyle(el.shadowRoot!.querySelector('.btn')!).backgroundImage).to.contain('gradient');
  });
});
