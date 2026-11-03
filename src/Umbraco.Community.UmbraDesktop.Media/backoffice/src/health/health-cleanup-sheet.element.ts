import { css, customElement, html, nothing, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { sizeNote, sizeText } from './health-model.js';
import type { HealthCleanup, HealthCleanupRow, HealthKind } from './health-model.js';
import { formatBytes } from '../transfers/transfers-model.js';
import { wordsOf } from '../shared/words.js';
import type { WordKey } from '../shared/words.js';
import { healthScreenStyles } from './health-styles.js';

/** Each kind's line in the sheet: what happens to it, and the sentence that makes that safe. */
const LINES: Record<HealthKind, { line: WordKey; note: WordKey }> = {
  unused: { line: 'healthSheetUnused', note: 'healthSheetUnusedNote' },
  orphaned: { line: 'healthSheetOrphaned', note: 'healthSheetOrphanedNote' },
  oversized: { line: 'healthSheetOversized', note: 'healthSheetOversizedNote' },
};

/**
 * Clean up asks once (design §16.3, mock scene 4): a sheet over the overview that says, per ticked
 * row, what happens to it in plain words, with its count and size. Unused items go to the recycle
 * bin, orphaned files are deleted for good after a re-check, oversized images open in Optimize
 * images. The safety of one button for everything comes from this saying it, so nothing is left out
 * or softened; for someone who is not an administrator it also says why orphaned files stay.
 *
 * Drawn in the window rather than as a backoffice modal, so it sits over the overview it belongs to
 * and themes with the window. Fires `health-cleanup-confirm` or `health-cleanup-cancel`.
 *
 * The grid's and the preview's **Delete** ask with it too (design §16.5), one row of orphaned files
 * under their own heading and button, so a delete for good is said in the same words wherever it is
 * asked.
 */
@customElement('umbradesktop-health-cleanup-sheet')
export class UmbraDesktopHealthCleanupSheetElement extends UmbLitElement {
  /** What Clean up would do: the ticked rows, from `cleanupOf`. */
  @property({ attribute: false })
  cleanup: HealthCleanup = { rows: [], bytes: 0 };

  /** Whether the person is an administrator; for anyone else the sheet says orphaned files stay. */
  @property({ type: Boolean })
  admin = false;

  /** The question at the top, in place of "Clean up …?", for a Delete from the grid or the preview. */
  @property()
  heading?: string;

  /** The confirming button's words, in place of **Clean up**. */
  @property({ attribute: 'confirm-label' })
  confirmLabel?: string;

  /** This package's words. */
  #words = wordsOf(this.localize);

  /**
   * Answer the sheet.
   * @param name `health-cleanup-confirm` or `health-cleanup-cancel`.
   */
  #answer(name: string): void {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true }));
  }

  /**
   * A row's amount, said by the same rule as the overview's rows, with the same note under "at least".
   * @param row The row.
   * @param locale The backoffice's culture, for the count.
   */
  #renderAmount(row: HealthCleanupRow, locale: string | undefined) {
    const note = sizeNote(row, row.count, (count) => this.#words('healthSizeUnknownCount', count.toLocaleString(locale)));
    return html`<div class="amount">
      <b>${row.estimate ? '≈ ' : ''}${sizeText(row, row.count, (key, bytes) => this.#words(key, bytes ?? ''))}</b>
      ${note ? html`<small class="muted">${note}</small>` : nothing}
    </div>`;
  }

  override render() {
    const locale = this.localize.lang() || undefined;
    const estimate = this.cleanup.rows.some((row) => row.estimate);
    return html`<div class="backdrop" @click=${() => this.#answer('health-cleanup-cancel')}></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="title">
        <h2 id="title">${this.heading ?? this.#words(estimate ? 'healthSheetTitleAbout' : 'healthSheetTitle', formatBytes(this.cleanup.bytes))}</h2>
        ${this.cleanup.rows.map(
          (row) => html`<div class="line" data-kind=${row.kind}>
            <i class="dot"></i>
            <div class="what">
              <span>${this.#words(LINES[row.kind].line, row.count.toLocaleString(locale))}</span>
              <small class="muted">${this.#words(LINES[row.kind].note)}</small>
            </div>
            ${this.#renderAmount(row, locale)}
          </div>`,
        )}
        <div class="actions">
          ${this.admin ? nothing : html`<small class="muted">${this.#words('healthSheetAdmin')}</small>`}
          <span class="space"></span>
          <uui-button look="secondary" label=${this.#words('healthCancel')} @click=${() => this.#answer('health-cleanup-cancel')}></uui-button>
          <uui-button look="primary" label=${this.confirmLabel ?? this.#words('healthCleanUpConfirm')} @click=${() => this.#answer('health-cleanup-confirm')}></uui-button>
        </div>
      </div>`;
  }

  static override styles = [
    healthScreenStyles,
    css`
      :host {
        position: absolute;
        inset: 0;
        z-index: 1;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        padding: var(--uui-size-space-6, 24px) var(--uui-size-space-4, 12px);
        box-sizing: border-box;
      }

      .backdrop {
        position: absolute;
        inset: 0;
        background: var(--uui-color-overlay, rgba(0, 0, 0, 0.4));
      }

      .sheet {
        position: relative;
        width: min(100%, 34em);
        padding: var(--uui-size-space-5, 18px) var(--uui-size-space-5, 18px) var(--uui-size-space-4, 12px);
        background: var(--uui-color-surface);
        color: var(--uui-color-text);
        border-radius: var(--uui-border-radius, 3px);
        box-shadow: var(--uui-shadow-depth-5, 0 12px 40px rgba(0, 0, 0, 0.35));
      }

      h2 {
        margin: 0 0 var(--uui-size-space-2, 6px);
        font-size: var(--uui-type-h5-size, 17px);
      }

      .amount {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        text-align: right;
      }

      .amount small {
        white-space: nowrap;
      }

      .line {
        display: flex;
        align-items: flex-start;
        gap: var(--uui-size-space-3, 9px);
        padding: var(--uui-size-space-3, 9px) 0;
        border-bottom: 1px solid var(--uui-color-divider, var(--uui-color-border));
      }

      .line .dot {
        margin-top: 4px;
      }

      .what {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .actions {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-2, 6px);
        margin-top: var(--uui-size-space-4, 12px);
      }

      .space {
        flex: 1;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-health-cleanup-sheet': UmbraDesktopHealthCleanupSheetElement;
  }
}
