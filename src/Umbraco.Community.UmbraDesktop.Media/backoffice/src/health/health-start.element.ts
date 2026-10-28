import { css, customElement, html, nothing, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import type { UmbraDesktopMediaHealthPhase } from './media-health.context.js';
import { OVERSIZED_BYTES } from './health-model.js';
import { formatBytes } from '../transfers/transfers-model.js';
import { wordsOf } from '../shared/words.js';
import type { WordKey } from '../shared/words.js';
import { healthScreenStyles } from './health-styles.js';
import './health-ring.element.js';

/** Where one of the three steps of a check is. */
type StepState = 'waiting' | 'going' | 'done';

/** The three checks, as No check yet names them: each kind's colour, name and one line. */
const TILES: ReadonlyArray<{ kind: string; title: WordKey; text: WordKey }> = [
  { kind: 'unused', title: 'healthUnused', text: 'healthUnusedTile' },
  { kind: 'orphaned', title: 'healthOrphaned', text: 'healthOrphanedTile' },
  { kind: 'oversized', title: 'healthOversized', text: 'healthOversizedTile' },
];

/**
 * No check yet and Checking (design §16.3, mock scenes 0 and 3), one element because they are one
 * story: the empty ring that invites a check, then the same ring filling with the check's real
 * progress while three steps tick off. What a check finds is not streamed in as it goes, as the mock
 * draws it, because nothing is known to be unused until the usage query after the library pass;
 * leaving it out is honest where showing it would be made up.
 *
 * Fires `health-check` when **Check my media library** is pressed, and `health-stop` when **Stop** is
 * pressed while a check runs; the window asks the context.
 */
@customElement('umbradesktop-health-start')
export class UmbraDesktopHealthStartElement extends UmbLitElement {
  /** Where the check is: idle or failed draws the invitation, running draws the progress. */
  @property({ attribute: false })
  phase: UmbraDesktopMediaHealthPhase = { kind: 'idle' };

  /** The library's items now, from the server, or undefined before it has answered. */
  @property({ attribute: false })
  mediaCount?: number;

  /** This package's words. */
  #words = wordsOf(this.localize);

  /**
   * A number in the backoffice's culture, as the taskbar clock reads it.
   * @param value The number.
   * @returns It, formatted.
   */
  #number(value: number): string {
    return value.toLocaleString(this.localize.lang() || undefined);
  }

  /** Ask for a check. */
  #check(): void {
    this.dispatchEvent(new CustomEvent('health-check', { bubbles: true, composed: true }));
  }

  /** Ask to stop the check: one started out of curiosity need not run to its end (design §16.12). */
  #stop(): void {
    this.dispatchEvent(new CustomEvent('health-stop', { bubbles: true, composed: true }));
  }

  override render() {
    return this.phase.kind === 'running' ? this.#renderChecking(this.phase) : this.#renderInvitation();
  }

  /** Before a check, or after one failed: what a check does, and the one button. */
  #renderInvitation() {
    const failed = this.phase.kind === 'failed' ? this.phase.message : undefined;
    return html`<div class="invite">
      <umbradesktop-health-ring empty><span class="ask">?</span></umbradesktop-health-ring>
      <h2>${this.#words('healthAsk')}</h2>
      <p class="lede">${this.#words('healthAskText')}</p>
      <div class="tiles">
        ${TILES.map(
          (tile) => html`<div class="tile">
            <b><i class="dot" data-kind=${tile.kind}></i>${this.#words(tile.title)}</b>
            <small>${this.#words(tile.text, formatBytes(OVERSIZED_BYTES))}</small>
          </div>`,
        )}
      </div>
      ${failed ? html`<p class="failed">${this.#words('healthFailed', failed)}</p>` : nothing}
      <uui-button look="primary" size="l" label=${this.#words('healthCheck')} @click=${this.#check}></uui-button>
      ${this.mediaCount === undefined ? nothing : html`<small class="muted">${this.#words('healthStartNote', this.#number(this.mediaCount))}</small>`}
    </div>`;
  }

  /**
   * The check running: the ring with the real progress, and the three steps. The server reads the
   * library and finds its usage in one phase, so the first step is done once every item is read and
   * the second runs until the disk walk starts.
   * @param phase The running phase.
   */
  #renderChecking(phase: Extract<UmbraDesktopMediaHealthPhase, { kind: 'running' }>) {
    const counted = phase.total > 0;
    const read = phase.step !== 'usage' || (counted && phase.scanned >= phase.total);
    const steps: Array<{ state: StepState; text: string }> = [
      { state: read ? 'done' : 'going', text: counted ? this.#words('healthStepRead', this.#number(phase.total)) : this.#words('healthStepReadAll') },
      { state: phase.step === 'usage' ? (read ? 'going' : 'waiting') : 'done', text: this.#words('healthStepUsage') },
      { state: phase.step === 'disk' ? 'going' : phase.step === 'loading' ? 'done' : 'waiting', text: this.#words('healthStepDisk') },
    ];
    const fraction = phase.step === 'usage' && counted ? phase.scanned / phase.total : undefined;
    return html`<div class="checking">
      <div class="hero">
        <umbradesktop-health-ring .fraction=${fraction}>
          ${fraction === undefined
            ? nothing
            : html`<b class="percent">${Math.round(fraction * 100)}%</b>
                <small class="muted">${this.#words('healthProgressItems', this.#number(phase.scanned), this.#number(phase.total))}</small>`}
        </umbradesktop-health-ring>
        <div class="steps">
          <h2>${this.#words('healthChecking')}</h2>
          ${steps.map(
            (step) => html`<div class="step" data-state=${step.state}>
              <span class="mark">${step.state === 'done' ? html`<uui-icon name="icon-check"></uui-icon>` : nothing}</span>
              <span>${step.text}</span>
            </div>`,
          )}
        </div>
      </div>
      <p class="muted">${this.#words('healthRunningNote')}</p>
      <uui-button look="secondary" label=${this.#words('healthStop')} @click=${this.#stop}></uui-button>
    </div>`;
  }

  static override styles = [
    healthScreenStyles,
    css`
      :host {
        display: block;
      }

      .invite {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: var(--uui-size-space-4, 12px);
        padding-top: var(--uui-size-space-4, 12px);
      }

      .ask {
        font-size: 44px;
        color: var(--uui-color-border-emphasis, var(--uui-color-text-alt));
      }

      h2 {
        margin: 0;
        font-size: var(--uui-type-h4-size, 21px);
      }

      .lede {
        margin: 0;
        max-width: 30em;
        color: var(--uui-color-text-alt);
        line-height: 1.5;
      }

      .tiles {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--uui-size-space-3, 9px);
        width: 100%;
        text-align: left;
      }

      .tile {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: var(--uui-size-space-3, 9px) var(--uui-size-space-4, 12px);
        background: var(--uui-color-surface);
        border: 1px solid var(--uui-color-border);
        border-radius: var(--uui-border-radius, 3px);
      }

      .tile small {
        color: var(--uui-color-text-alt);
      }

      .failed {
        margin: 0;
        color: var(--uui-color-danger);
      }

      .checking {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-6, 24px);
      }

      .hero {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-6, 24px);
      }

      .percent {
        font-size: 28px;
        line-height: 1;
      }

      .steps {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-3, 9px);
      }

      .steps h2 {
        margin-bottom: var(--uui-size-space-2, 6px);
      }

      .step {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-3, 9px);
      }

      .step[data-state='waiting'] {
        color: var(--uui-color-text-alt);
      }

      .step[data-state='going'] {
        font-weight: bold;
      }

      .mark {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        border: 2px solid var(--uui-color-border);
        box-sizing: border-box;
        font-size: 11px;
        color: var(--uui-color-surface);
      }

      .step[data-state='done'] .mark {
        background: var(--umbradesktop-health-oversized);
        border-color: var(--umbradesktop-health-oversized);
      }

      .step[data-state='going'] .mark {
        border-color: var(--umbradesktop-health-fine);
        border-right-color: transparent;
        animation: umbradesktop-health-turn 1s linear infinite;
      }

      @keyframes umbradesktop-health-turn {
        to {
          transform: rotate(360deg);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .step[data-state='going'] .mark {
          animation: none;
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-health-start': UmbraDesktopHealthStartElement;
  }
}
