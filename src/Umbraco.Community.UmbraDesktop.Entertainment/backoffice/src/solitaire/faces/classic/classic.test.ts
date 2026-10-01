import { expect } from '@open-wc/testing';
import classic, { CORNER } from './classic.js';
import { createDeck } from '../../rules.js';
import { CARD_RADIUS_RATIO } from '../../constants.js';

/** Parse one rendered card. */
function parse(svg: string): Document {
  return new DOMParser().parseFromString(svg, 'image/svg+xml');
}

describe('classic face set', () => {
  const rendered = createDeck().map((card) => ({ card, svg: classic.render(card) }));

  it('renders every card as a well-formed 100 x 140 SVG', () => {
    for (const { card, svg } of rendered) {
      const doc = parse(svg);
      expect(!!doc.querySelector('parsererror'), card.id).to.equal(false);
      expect(doc.documentElement.getAttribute('viewBox'), card.id).to.equal('0 0 100 140');
    }
  });

  it('draws as many pips as a number card is worth', () => {
    for (const { card, svg } of rendered.filter((r) => r.card.rank >= 2 && r.card.rank <= 10)) {
      expect(parse(svg).querySelectorAll('[data-pip]').length, card.id).to.equal(card.rank);
    }
  });

  it('draws the court art on jacks, queens and kings, and the logomark on the ace of spades', () => {
    for (const { card, svg } of rendered.filter((r) => r.card.rank >= 11)) {
      const court = parse(svg).querySelector('[data-court]');
      expect(!!court, card.id).to.equal(true);
      expect(court!.childElementCount, card.id).to.be.greaterThan(0);
    }
    expect(!!parse(rendered.find((r) => r.card.id === '1S')!.svg).querySelector('[data-logomark]')).to.equal(true);
  });

  it('keeps every id unique across the whole deck, since all 52 share a shadow root', () => {
    const ids = rendered.flatMap(({ svg }) => [...parse(svg).querySelectorAll('[id]')].map((el) => el.id));
    expect(new Set(ids).size).to.equal(ids.length);
  });

  it('fails loudly, naming the card, when a court is missing', () => {
    expect(() => classic.render({ suit: 'S', rank: 14 })).to.throw('14S');
  });

  it('rounds its corners by the same ratio the element rounds the card and its back', () => {
    const outline = parse(rendered[0].svg).querySelector('rect')!;
    expect(Number(outline.getAttribute('rx'))).to.be.closeTo(CARD_RADIUS_RATIO * 100, 0.01);
  });

  describe('corners', () => {
    /** Mount a card in the live document so getBBox has geometry; removed by the caller. */
    function mount(svg: string): { svg: SVGSVGElement; remove: () => void } {
      const host = document.createElement('div');
      host.innerHTML = svg;
      document.body.appendChild(host);
      return { svg: host.querySelector('svg')!, remove: () => host.remove() };
    }

    /** The first (top-left) rank and suit of a rendered card, as boxes in card units. */
    function corner(id: string): { rank: DOMRect; suit: DOMRect; frameX: number | null } {
      const { svg, remove } = mount(rendered.find((r) => r.card.id === id)!.svg);
      try {
        const rank = svg.querySelector<SVGGraphicsElement>('[data-rank]')!.getBBox();
        const suit = svg.querySelector<SVGGraphicsElement>('[data-corner-suit]')!.getBBox();
        const frame = svg.querySelector('rect[data-court-frame]');
        return { rank, suit, frameX: frame ? Number(frame.getAttribute('x')) : null };
      } finally {
        remove();
      }
    }

    it('draws ranks as outlines, never as text', () => {
      for (const { card, svg } of rendered) {
        expect(parse(svg).querySelectorAll('text').length, card.id).to.equal(0);
      }
    });

    it('gives every number rank and the ace and king the same cap height and baseline', () => {
      for (const suit of ['S', 'H', 'D', 'C']) {
        for (const rank of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13]) {
          const { rank: box } = corner(`${rank}${suit}`);
          expect(box.y, `${rank}${suit} top`).to.be.closeTo(CORNER.top, 0.01);
          expect(box.height, `${rank}${suit} height`).to.be.closeTo(CORNER.capHeight, 0.01);
        }
      }
    });

    it('lets the jack and queen hang below the baseline but start on the same top line', () => {
      for (const id of ['11S', '12H']) {
        const { rank } = corner(id);
        expect(rank.y, id).to.be.closeTo(CORNER.top, CORNER.capHeight * 0.02);
        expect(rank.height, id).to.be.greaterThan(CORNER.capHeight);
      }
    });

    it('keeps the gap between a rank and its suit identical for all thirteen ranks', () => {
      for (const suit of ['S', 'H', 'D', 'C']) {
        const gaps = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((rank) => {
          const c = corner(`${rank}${suit}`);
          return c.suit.y - (c.rank.y + c.rank.height);
        });
        for (const gap of gaps) expect(gap, suit).to.be.closeTo(gaps[0], 0.01);
        expect(gaps[0], suit).to.be.closeTo(CORNER.gap, 0.4);
      }
    });

    it('fits every rank, the condensed 10 included, inside the corner box', () => {
      for (const { card } of rendered) {
        const { rank } = corner(card.id);
        expect(rank.width, card.id).to.be.at.most(CORNER.boxWidth + 0.01);
        expect(rank.x, card.id).to.be.at.least(CORNER.margin - 0.01);
        expect(rank.x + rank.width, card.id).to.be.at.most(CORNER.margin + CORNER.boxWidth + 0.01);
      }
    });

    it('centres the suit on the rank column', () => {
      const { suit } = corner('7H');
      expect(suit.x + suit.width / 2).to.be.closeTo(CORNER.centreX, 0.05);
    });

    it('keeps the court frame clear of the corner box by the gap', () => {
      for (const id of ['11S', '12H', '13S', '13D']) {
        const { frameX } = corner(id);
        expect(frameX!, id).to.be.at.least(CORNER.margin + CORNER.boxWidth + CORNER.courtGap - 0.01);
      }
    });
  });
  describe('pips and courts', () => {
    /** Mount a card in the live document so getBBox has geometry; removed by the caller. */
    function mount(id: string): { svg: SVGSVGElement; remove: () => void } {
      const host = document.createElement('div');
      host.innerHTML = rendered.find((r) => r.card.id === id)!.svg;
      document.body.appendChild(host);
      return { svg: host.querySelector('svg')!, remove: () => host.remove() };
    }

    /** The distinct rows of pips, top to bottom, as boxes in card units, with the pips' own boxes. */
    function pipRows(svg: SVGSVGElement): { rows: DOMRect[][]; corner: DOMRect; mirrored: DOMRect } {
      const boxes = [...svg.querySelectorAll<SVGGraphicsElement>('[data-pip]')].map((p) => {
        // getBBox is in the element's own space, before its own transform; map the corners through
        // that transform into card units. The scales here are positive and the turns half turns,
        // so the mapped corners' extremes are the box.
        const box = p.getBBox();
        const m = svg.getScreenCTM()!.inverse().multiply(p.getScreenCTM()!);
        const pts = [[box.x, box.y], [box.x + box.width, box.y + box.height]].map(([x, y]) =>
          new DOMPoint(x, y).matrixTransform(m),
        );
        return new DOMRect(
          Math.min(pts[0].x, pts[1].x), Math.min(pts[0].y, pts[1].y),
          Math.abs(pts[1].x - pts[0].x), Math.abs(pts[1].y - pts[0].y),
        );
      });
      boxes.sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2));
      const rows: DOMRect[][] = [];
      for (const box of boxes) {
        const last = rows[rows.length - 1];
        if (last && Math.abs(last[0].y + last[0].height / 2 - (box.y + box.height / 2)) < 1) last.push(box);
        else rows.push([box]);
      }
      const corner = svg.querySelector<SVGGraphicsElement>('[data-corner-suit]')!.getBBox();
      // The second corner is the first rotated 180 degrees about the card's centre (50, 70).
      return { rows, corner, mirrored: new DOMRect(100 - corner.x - corner.width, 140 - corner.y - corner.height, corner.width, corner.height) };
    }

    it('puts the top pip row on the corner suit bottom and the bottom row on its mirrored top', () => {
      for (const suit of ['S', 'H', 'D', 'C']) {
        for (let rank = 2; rank <= 10; rank++) {
          const { svg, remove } = mount(`${rank}${suit}`);
          try {
            const { rows, corner, mirrored } = pipRows(svg);
            const top = Math.min(...rows[0].map((b) => b.y + b.height));
            const bottom = Math.max(...rows[rows.length - 1].map((b) => b.y));
            expect(top, `${rank}${suit} top row bottom`).to.be.closeTo(corner.y + corner.height, 0.05);
            expect(bottom, `${rank}${suit} bottom row top`).to.be.closeTo(mirrored.y, 0.05);
          } finally {
            remove();
          }
        }
      }
    });

    it('spaces the pip rows evenly, as the standard layouts do', () => {
      // Pips in the lower half are rotated, so a heart's box centre sits a little off its row line;
      // a unit of tolerance absorbs that and nothing like a misplaced row.
      const expected: Record<number, number[]> = {
        2: [0, 1], 3: [0, 0.5, 1], 4: [0, 1], 5: [0, 0.5, 1], 6: [0, 0.5, 1],
        7: [0, 0.25, 0.5, 1], 8: [0, 0.25, 0.5, 0.75, 1],
        9: [0, 1 / 3, 0.5, 2 / 3, 1], 10: [0, 1 / 6, 1 / 3, 2 / 3, 5 / 6, 1],
      };
      for (const rank of Object.keys(expected).map(Number)) {
        const { svg, remove } = mount(`${rank}D`);
        try {
          const { rows } = pipRows(svg);
          const centres = rows.map((r) => r[0].y + r[0].height / 2);
          const span = centres[centres.length - 1] - centres[0];
          expect(centres.length, `${rank} rows`).to.equal(expected[rank].length);
          centres.forEach((c, i) => expect((c - centres[0]) / span, `${rank} row ${i}`).to.be.closeTo(expected[rank][i], 1 / span));
        } finally {
          remove();
        }
      }
    });

    it('keeps the left pip column clear of the corner box by the corner gap', () => {
      for (const rank of [4, 5, 6, 7, 8, 9, 10]) {
        const { svg, remove } = mount(`${rank}C`);
        try {
          const { rows } = pipRows(svg);
          const left = Math.min(...rows.flat().map((b) => b.x));
          expect(left, String(rank)).to.be.at.least(CORNER.margin + CORNER.boxWidth + CORNER.gap - 0.01);
        } finally {
          remove();
        }
      }
    });

    it('draws the court in a frame with the artwork aspect, slicing nothing', () => {
      for (const id of ['11S', '12H', '13S', '13D']) {
        const court = new DOMParser()
          .parseFromString(rendered.find((r) => r.card.id === id)!.svg, 'image/svg+xml')
          .querySelector('[data-court]')!;
        const [, , vw, vh] = court.getAttribute('viewBox')!.split(' ').map(Number);
        const width = Number(court.getAttribute('width'));
        const height = Number(court.getAttribute('height'));
        expect(width / height, id).to.be.closeTo(vw / vh, 0.002);
        expect(court.getAttribute('preserveAspectRatio'), id).to.not.contain('slice');
        // Centred on the card, and inside it.
        expect(Number(court.getAttribute('x')) + width / 2, id).to.be.closeTo(50, 0.01);
        expect(Number(court.getAttribute('y')) + height / 2, id).to.be.closeTo(70, 0.01);
        expect(Number(court.getAttribute('x')), id).to.be.at.least(CORNER.margin + CORNER.boxWidth + CORNER.courtGap - 0.01);
      }
    });
  });
});
