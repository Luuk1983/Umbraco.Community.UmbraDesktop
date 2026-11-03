import { css, customElement, html, nothing, property, svg, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/** The ring's outer edge, in CSS pixels: the SVG's viewBox and the element's box both read it. */
export const RING_SIZE = 150;

/** The ring's stroke, in CSS pixels, so the circle's radius is derived from the two. */
export const RING_STROKE = 14;

/** The circle's radius, on the stroke's centre line. */
const RADIUS = (RING_SIZE - RING_STROKE) / 2;

/** The circle's length, which the fill's dash is measured against. */
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * The ring of No check yet and Checking (design §16.3, mock scenes 0 and 3): the same ring empty and
 * dashed before a check, then filling with the check's real progress, so the screens read as one
 * story. With no fraction it turns, rather than standing at 0%, for the parts of a check whose size
 * is not known (the disk walk). Whatever goes in the middle is slotted.
 */
@customElement('umbradesktop-health-ring')
export class UmbraDesktopHealthRingElement extends UmbLitElement {
  /** How full, 0 to 1; undefined while the progress is not known, which turns the ring. */
  @property({ type: Number })
  fraction?: number;

  /** Before any check: a dashed, empty ring. */
  @property({ type: Boolean, reflect: true })
  empty = false;

  /** Reflects that the ring turns, so the CSS and a test read one fact. */
  override willUpdate(): void {
    this.toggleAttribute('indeterminate', !this.empty && this.fraction === undefined);
  }

  override render() {
    const fraction = Math.min(1, Math.max(0, this.fraction ?? 0.25));
    const centre = RING_SIZE / 2;
    return html`<svg viewBox="0 0 ${RING_SIZE} ${RING_SIZE}" aria-hidden="true">
        ${svg`<circle class="track" cx=${centre} cy=${centre} r=${RADIUS} stroke-width=${RING_STROKE} stroke-dasharray=${this.empty ? `${RING_STROKE} ${RING_STROKE * 0.6}` : nothing}></circle>`}
        ${this.empty
          ? nothing
          : svg`<circle class="fill" cx=${centre} cy=${centre} r=${RADIUS} stroke-width=${RING_STROKE}
              stroke-dasharray=${CIRCUMFERENCE} stroke-dashoffset=${CIRCUMFERENCE * (1 - fraction)}
              transform="rotate(-90 ${centre} ${centre})"></circle>`}
      </svg>
      <div class="centre"><slot></slot></div>`;
  }

  static override styles = css`
    :host {
      position: relative;
      display: inline-block;
      flex: none;
      width: ${unsafeCSS(RING_SIZE)}px;
      height: ${unsafeCSS(RING_SIZE)}px;
    }

    svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    circle {
      fill: none;
    }

    .track {
      stroke: var(--uui-color-border);
    }

    .fill {
      stroke: var(--umbradesktop-health-fine, var(--uui-color-interactive));
      stroke-linecap: round;
      transition: stroke-dashoffset 0.4s ease;
    }

    :host([indeterminate]) svg {
      animation: umbradesktop-health-turn 1.2s linear infinite;
    }

    @keyframes umbradesktop-health-turn {
      to {
        transform: rotate(360deg);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      :host([indeterminate]) svg {
        animation: none;
      }
    }

    .centre {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-health-ring': UmbraDesktopHealthRingElement;
  }
}
