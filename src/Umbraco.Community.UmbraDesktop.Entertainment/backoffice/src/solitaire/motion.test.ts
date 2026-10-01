import { expect, fixtureCleanup, fixtureSync, html } from '@open-wc/testing';
import { playFlip, snapshot } from './motion.js';

describe('solitaire motion', () => {
  afterEach(() => fixtureCleanup());

  /**
   * One positioned card in a positioned box.
   *
   * `fixtureSync`, not `fixture`: for a plain element `fixture` waits for an animation frame, and the
   * runner's background tabs never deliver one, so every case timed out in a full run while passing
   * on its own. Nothing here needs a frame, since layout is read synchronously.
   * @returns The card.
   */
  function box(): HTMLElement {
    const root = fixtureSync<HTMLElement>(
      html`<div style="position:relative;width:400px;height:400px">
        <div data-id="a" style="position:absolute;left:0;top:0;width:10px;height:10px"></div>
      </div>`,
    );
    return root.querySelector<HTMLElement>('[data-id="a"]')!;
  }

  it('animates a card from where it was to where it is', async () => {
    const card = box();
    const before = snapshot([card]);
    card.style.left = '100px';
    const animations = playFlip([card], before, { duration: 200, stagger: 0, reduced: false });
    expect(animations.length).to.equal(1);
    const first = (animations[0].effect as KeyframeEffect).getKeyframes()[0].transform;
    expect(first).to.include('translate(-100px');
  });

  it('does not animate a card that did not move', async () => {
    const card = box();
    expect(playFlip([card], snapshot([card]), { duration: 200, stagger: 0, reduced: false }).length).to.equal(0);
  });

  it('does nothing with reduced motion', async () => {
    const card = box();
    const before = snapshot([card]);
    card.style.left = '100px';
    expect(playFlip([card], before, { duration: 200, stagger: 0, reduced: true }).length).to.equal(0);
    expect(card.getAnimations().length).to.equal(0);
  });
  /**
   * Several cards in one positioned box, for stagger and snapshot-membership cases.
   * @param ids The `data-id` of each card; an empty string makes an id-less card.
   * @returns The cards in order.
   */
  function row(ids: string[]): HTMLElement[] {
    const cards = ids.map(
      (id, i) =>
        `<div ${id ? `data-id="${id}"` : ''} ` +
        `style="position:absolute;left:${i * 20}px;top:0;width:10px;height:10px"></div>`,
    );
    const root = fixtureSync<HTMLElement>(
      html`<div style="position:relative;width:400px;height:400px"></div>`,
    );
    root.innerHTML = cards.join('');
    return [...root.children] as HTMLElement[];
  }

  it('ignores a card without a data-id', () => {
    const [card] = row(['']);
    const before = snapshot([card]);
    expect(before.size).to.equal(0);
    card.style.left = '100px';
    expect(playFlip([card], before, { duration: 200, stagger: 0, reduced: false }).length).to.equal(0);
  });

  it('does not animate a card that was not in the snapshot', () => {
    const cards = row(['a', 'b']);
    const before = snapshot([cards[0]]);
    cards.forEach((c) => (c.style.top = '50px'));
    const animations = playFlip(cards, before, { duration: 200, stagger: 0, reduced: false });
    expect(animations.length).to.equal(1);
    expect(cards[1].getAnimations().length).to.equal(0);
  });

  it('delays each moving card a little more than the one before', () => {
    const cards = row(['a', 'b', 'c']);
    const before = snapshot(cards);
    cards.forEach((c) => (c.style.top = '50px'));
    const animations = playFlip(cards, before, { duration: 200, stagger: 35, reduced: false });
    expect(animations.map((a) => a.effect!.getTiming().delay)).to.deep.equal([0, 35, 70]);
  });

  /**
   * Auto-finish starts a move before the previous one lands. The snapshot must hold where the card
   * is seen, mid-flight, and the flip must then measure its layout position, so the card carries on
   * from where it is rather than jumping to either end.
   */
  it('continues a card that is still in flight from where it is seen', () => {
    const card = box();
    card.animate([{ transform: 'translate(300px, 300px)' }, { transform: 'translate(300px, 300px)' }], {
      duration: 100_000,
    });
    const seen = card.getBoundingClientRect();
    const before = snapshot([card]);
    expect(before.get('a')).to.deep.equal({ x: seen.left, y: seen.top });
    const [flip] = playFlip([card], before, { duration: 200, stagger: 0, reduced: false });
    expect(flip, 'the card has not arrived, so it must keep moving').to.not.equal(undefined);
    const first = (flip.effect as KeyframeEffect).getKeyframes()[0].transform;
    expect(first).to.include('translate(300px');
    expect(card.getAnimations().length, 'the old flight was replaced, not stacked').to.equal(1);
  });
});
