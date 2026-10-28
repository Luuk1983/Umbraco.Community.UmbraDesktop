import { css, customElement, html, nothing, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import type { UmbraDesktopMediaHealthCleanupState } from './media-health.context.js';
import { findDesktopWindows } from '../edit-image/desktop-windows.js';
import { OPTIMIZE_APP } from '../shared/optimize-service.js';
import { formatBytes } from '../transfers/transfers-model.js';
import { wordsOf } from '../shared/words.js';
import type { WordKey } from '../shared/words.js';
import { healthScreenStyles } from './health-styles.js';
import './health-ring.element.js';

/** The words for each reason the server gives for leaving a file on disk, and for a refused delete. */
const REASONS: Record<string, WordKey> = {
  NotFound: 'healthReasonNotFound',
  NowOwned: 'healthReasonNowOwned',
  denied: 'healthReasonDenied',
  failed: 'healthReasonFailed',
};

/**
 * Clean up running, then Done (design §16.3, mock scene 4b): while the bin and the disk are worked
 * through, the ring counts them; once done, the size freed, large, and the library before and after.
 * Under it a card for the items in the recycle bin with **Undo**, and one for Optimize images while
 * it runs, with **Show**, which brings its window forward. What did not go is said, with why: Done
 * reports what went, not what was asked (plan Review Focus 3).
 *
 * Fires `health-undo` and `health-dismiss`; the window asks the context. **Show** goes to the desktop
 * itself, since the Optimize window is the media service's and Media Health only knows where it is.
 */
@customElement('umbradesktop-health-done')
export class UmbraDesktopHealthDoneElement extends UmbLitElement {
  /** The Clean up. */
  @property({ attribute: false })
  cleanup?: UmbraDesktopMediaHealthCleanupState;

  /** Whether an Undo has been asked for and has not come back yet, which holds its button. */
  @property({ type: Boolean })
  undoing = false;

  /** How the last Undo went, in words, under the cards. */
  @property()
  note = '';

  /** This package's words. */
  #words = wordsOf(this.localize);

  /**
   * Ask for something; the window decides.
   * @param name The event.
   */
  #fire(name: string): void {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true }));
  }

  /** Bring the Optimize images window forward, at the run it is showing. */
  #show(): void {
    const location = this.cleanup?.optimizing?.location;
    if (location) findDesktopWindows(this)?.openApp(OPTIMIZE_APP, { location, reuse: true });
  }

  override render() {
    const cleanup = this.cleanup;
    if (!cleanup) return nothing;
    const locale = this.localize.lang() || undefined;
    const number = (value: number) => value.toLocaleString(locale);
    if (cleanup.phase === 'running') {
      return html`<div class="done">
        <umbradesktop-health-ring .fraction=${cleanup.total ? cleanup.done / cleanup.total : undefined}>
          <small class="muted">${this.#words('healthProgressItems', number(cleanup.done), number(cleanup.total))}</small>
        </umbradesktop-health-ring>
        <h2>${this.#words('healthCleaningUp')}</h2>
      </div>`;
    }
    const reason = (code: string) => (REASONS[code] ? this.#words(REASONS[code]) : code);
    return html`<div class="done">
      <span class="tick" data-kind="oversized"><uui-icon name="icon-check"></uui-icon></span>
      <h2>${this.#words('healthFreed', formatBytes(cleanup.freedBytes))}</h2>
      <span class="muted">${this.#words('healthWentFrom', formatBytes(cleanup.beforeBytes), formatBytes(cleanup.afterBytes))}</span>
      ${cleanup.failed.length ? html`<p class="problem">${this.#words('healthTrashFailed', number(cleanup.failed.length))}</p>` : nothing}
      ${cleanup.skipped.length
        ? html`<p class="problem">
            ${this.#words('healthSkipped', number(cleanup.skipped.length), cleanup.skipped.map((each) => `${each.relativePath} (${reason(each.reason)})`).join(', '))}
          </p>`
        : nothing}
      ${cleanup.trashed.length
        ? html`<div class="card" data-kind="unused">
            <span class="edge"></span>
            <div class="text">
              <b>${this.#words('healthInBin', number(cleanup.trashed.length))}</b>
              <small class="muted">${this.#words('healthInBinNote')}</small>
            </div>
            <uui-button look="secondary" label=${this.#words('healthUndo')} ?disabled=${this.undoing} @click=${() => this.#fire('health-undo')}></uui-button>
          </div>`
        : nothing}
      ${cleanup.optimizing
        ? html`<div class="card" data-kind="oversized">
            <span class="edge"></span>
            <div class="text">
              <b>${this.#words('healthOptimizing', number(cleanup.optimizing.total))}</b>
              <small class="muted">${this.#words('healthOptimizingNote', number(cleanup.optimizing.completed), number(cleanup.optimizing.total))}</small>
            </div>
            <uui-button look="secondary" label=${this.#words('healthShow')} ?disabled=${!cleanup.optimizing.location} @click=${this.#show}></uui-button>
          </div>`
        : nothing}
      ${this.note ? html`<span class="muted">${this.note}</span>` : nothing}
      <uui-button look="primary" label=${this.#words('healthBackToOverview')} @click=${() => this.#fire('health-dismiss')}></uui-button>
    </div>`;
  }

  static override styles = [
    healthScreenStyles,
    css`
      :host {
        display: block;
      }

      .done {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: var(--uui-size-space-3, 9px);
        padding-top: var(--uui-size-space-6, 24px);
      }

      h2 {
        margin: 0;
        font-size: var(--uui-type-h4-size, 21px);
      }

      .tick {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 96px;
        height: 96px;
        border-radius: 50%;
        background: var(--umbradesktop-health-colour);
        color: var(--uui-color-surface);
        font-size: 44px;
      }

      .problem {
        margin: 0;
        color: var(--uui-color-danger);
        font-size: var(--uui-type-small-size, 12px);
      }

      .card {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-4, 12px);
        width: min(100%, 32em);
        box-sizing: border-box;
        padding: var(--uui-size-space-3, 9px) var(--uui-size-space-4, 12px);
        background: var(--uui-color-surface);
        border: 1px solid var(--uui-color-border);
        border-radius: var(--uui-border-radius, 3px);
        text-align: left;
      }

      .card + .card {
        margin-top: calc(-1 * var(--uui-size-space-1, 3px));
      }

      .edge {
        align-self: stretch;
        flex: none;
        width: 4px;
        border-radius: 2px;
        background: var(--umbradesktop-health-colour);
      }

      .text {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-health-done': UmbraDesktopHealthDoneElement;
  }
}
