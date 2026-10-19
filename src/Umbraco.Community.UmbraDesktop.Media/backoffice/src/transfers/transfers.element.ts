import { css, customElement, html, nothing, property, repeat, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { umbConfirmModal } from '@umbraco-cms/backoffice/modal';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import { UMBRADESKTOP_MEDIA_MANAGER_CONTEXT } from '../context/media-manager.context.js';
import type { UmbraDesktopMediaManagerContext } from '../context/media-manager.context.js';
import { UMBRADESKTOP_MEDIA_MANAGER_APP } from '../manager/manager-window.context.js';
import { printLocation } from '../manager/location.js';
import { foldRows, metaOf, overallOf, titleOf } from './transfers-model.js';
import type { UmbraDesktopTransfer, UmbraDesktopTransferRow, UmbraDesktopTransferWords } from './transfers-model.js';

/** As much of the desktop's window manager as Open folder uses. */
interface UmbraDesktopWindowManager extends UmbContextMinimal {
  /** Open an app at a location. */
  openApp(alias: string, options?: { location?: string }): boolean;
}

/** The desktop's window manager. */
const UMBRADESKTOP_WINDOW_MANAGER = new UmbContextToken<UmbraDesktopWindowManager>('UmbraDesktopWindowManagerContext');

/** How often the time left is worked out again while something runs. */
const TICK_MS = 1000;

/**
 * The Transfers window (design §7, plan task 7.6): one for the desktop, a section per operation or
 * batch of uploads, each with what it is, an overall bar, counts, size and time left, Pause and
 * Cancel, and a row per item with where it is going. A failed item shows Umbraco's reason with Retry.
 * A finished transfer folds to its failures and a count of what worked.
 *
 * Everything it shows lives in the add-on's desktop context, so a transfer keeps going when this
 * window closes, and the context opens and closes it. What runs is reported to the desktop as
 * `umbradesktop-task`, so the busy ring on its taskbar button, the question before closing it and the
 * warning before leaving the desktop are the host's own (`window-progress.md`).
 */
@customElement('umbradesktop-media-transfers')
export class UmbraDesktopMediaTransfersElement extends UmbLitElement {
  /**
   * Ask before cancelling. A property so a test can answer for the person.
   * @param transfer The transfer.
   * @returns True to cancel.
   */
  @property({ attribute: false })
  confirmCancel: (transfer: UmbraDesktopTransfer) => Promise<boolean> = async (transfer) => {
    const left = transfer.rows.filter((row) => !row.folder && (row.status === 'waiting' || row.status === 'running')).length;
    const done = transfer.rows.filter((row) => !row.folder && row.status === 'done').length;
    try {
      await umbConfirmModal(this, {
        headline: this.localize.term('umbraDesktopMedia_transferCancelHeadline'),
        content: this.localize.term('umbraDesktopMedia_transferCancelText', left, done),
        confirmLabel: this.localize.term('umbraDesktopMedia_transferCancelConfirm'),
        color: 'danger',
      });
      return true;
    } catch {
      return false;
    }
  };

  /** The transfers, as the context holds them. */
  @state()
  private _transfers: UmbraDesktopTransfer[] = [];

  /** The time now, moved on each second so the time left follows. */
  @state()
  private _now = Date.now();

  /** The add-on's desktop context. */
  #context?: UmbraDesktopMediaManagerContext;

  /** The desktop's window manager, for Open folder. */
  #windows?: UmbraDesktopWindowManager;

  /** Moves the time on while something runs. */
  #tick?: number;

  /** The tasks last reported, by transfer, so each changes only when it does. */
  #reported = new Map<string, string>();

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_MEDIA_MANAGER_CONTEXT, (context) => {
      this.#context = context ?? undefined;
      if (!context) return;
      this.observe(
        context.transfers,
        (transfers) => {
          this._transfers = [...transfers];
          this._now = Date.now();
          this.#report();
        },
        'umbradesktopTransfers',
      );
    });
    this.consumeContext(UMBRADESKTOP_WINDOW_MANAGER, (windows) => (this.#windows = windows ?? undefined));
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.#tick = window.setInterval(() => {
      if (this._transfers.some((each) => each.state === 'running')) this._now = Date.now();
    }, TICK_MS);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this.#tick);
    // Closed: the finished transfers have been seen. One still running carries on, and opens the
    // window again in two seconds if it is still going.
    this.#context?.clearFinishedTransfers?.();
  }

  /**
   * Tell the desktop what runs, one task per transfer: the ring sums them, a failure stays red until
   * the window closes, and a running one makes closing the window, or leaving the desktop, ask first.
   */
  #report(): void {
    const ids = new Set(this._transfers.map((each) => each.id));
    for (const id of [...this.#reported.keys()]) {
      if (ids.has(id)) continue;
      this.#reported.delete(id);
      this.#task({ id, state: 'done' });
    }
    for (const transfer of this._transfers) {
      const rows = transfer.rows.filter((row) => !row.folder);
      const failed = rows.filter((row) => row.status === 'failed').length;
      const running = transfer.state === 'running' || transfer.state === 'paused';
      const detail = running
        ? {
            id: transfer.id,
            state: 'running',
            completed: rows.filter((row) => row.status === 'done' || row.status === 'failed').length,
            total: rows.length,
            label: this.#words(titleOf(transfer)),
          }
        : failed
          ? { id: transfer.id, state: 'failed', failed, total: rows.length }
          : { id: transfer.id, state: 'done' };
      const signature = JSON.stringify(detail);
      if (this.#reported.get(transfer.id) === signature) continue;
      this.#reported.set(transfer.id, signature);
      this.#task(detail);
    }
  }

  /**
   * Send one task report.
   * @param detail The report.
   */
  #task(detail: object): void {
    this.dispatchEvent(new CustomEvent('umbradesktop-task', { detail, bubbles: true, composed: true }));
  }

  /**
   * Words in the person's language; arguments that are core's `#keys` are translated too.
   * @param words The words.
   * @returns The text.
   */
  #words(words: UmbraDesktopTransferWords): string {
    return this.localize.term(words.key, ...words.args.map((arg) => (typeof arg === 'string' ? this.localize.string(arg) : arg)));
  }

  /**
   * Cancel a transfer, after asking.
   * @param transfer The transfer.
   */
  async #cancel(transfer: UmbraDesktopTransfer): Promise<void> {
    if (await this.confirmCancel(transfer)) this.#context?.cancelTransfer(transfer.id);
  }

  /**
   * Open a manager window on where a transfer went.
   * @param transfer The transfer.
   */
  #openFolder(transfer: UmbraDesktopTransfer): void {
    if (transfer.target === undefined) return;
    const place = transfer.target === null ? { kind: 'root' as const } : { kind: 'folder' as const, unique: transfer.target };
    this.#windows?.openApp(UMBRADESKTOP_MEDIA_MANAGER_APP, { location: printLocation(place) });
  }

  override render() {
    if (!this._transfers.length) return html`<p class="empty">${this.localize.term('umbraDesktopMedia_transfersEmpty')}</p>`;
    return html`${repeat(
      this._transfers,
      (transfer) => transfer.id,
      (transfer) => this.#renderTransfer(transfer),
    )}`;
  }

  /**
   * One transfer's section.
   * @param transfer The transfer.
   * @returns The section.
   */
  #renderTransfer(transfer: UmbraDesktopTransfer) {
    const running = transfer.state === 'running' || transfer.state === 'paused';
    const failed = transfer.rows.some((row) => row.status === 'failed');
    const percent = overallOf(transfer) * 100;
    return html`<section class="transfer" ?finished=${!running} ?failed=${!running && failed}>
      <header>
        <uui-icon name=${!running ? (failed ? 'icon-alert' : 'icon-check') : transfer.kind === 'upload' ? 'icon-cloud-upload' : 'icon-documents'}></uui-icon>
        <b class="title">${this.#words(titleOf(transfer))}</b>
        <span class="actions">${running ? this.#runningActions(transfer) : this.#finishedActions(transfer, failed)}</span>
      </header>
      <div class="bar" ?paused=${transfer.state === 'paused'}><span style="width:${percent}%"></span></div>
      <div class="meta">${metaOf(transfer, this._now).map((words) => this.#words(words)).join(', ')}</div>
      <div class="rows">${repeat(
        foldRows(transfer),
        (row) => row.key,
        (row) => this.#renderRow(transfer, row),
      )}</div>
    </section>`;
  }

  /**
   * Pause or Resume, and Cancel, for a transfer that runs. Pause is greyed for an upload, which core
   * cannot pause, rather than left out (a theme or a kind may restyle, never remove).
   * @param transfer The transfer.
   * @returns The buttons.
   */
  #runningActions(transfer: UmbraDesktopTransfer) {
    const paused = transfer.state === 'paused';
    const pauseLabel = this.localize.term(paused ? 'umbraDesktopMedia_transferResume' : 'umbraDesktopMedia_transferPause');
    return html`<uui-button
        compact
        look="secondary"
        label=${pauseLabel}
        title=${transfer.canPause ? pauseLabel : this.localize.term('umbraDesktopMedia_transferNoPause')}
        ?disabled=${!transfer.canPause}
        @click=${() => (paused ? this.#context?.resumeTransfer(transfer.id) : this.#context?.pauseTransfer(transfer.id))}>
        <uui-icon name=${paused ? 'icon-play' : 'icon-pause'}></uui-icon>${pauseLabel}
      </uui-button>
      <uui-button compact look="secondary" label=${this.localize.term('umbraDesktopMedia_transferCancel')} @click=${() => void this.#cancel(transfer)}>
        ${this.localize.term('umbraDesktopMedia_transferCancel')}
      </uui-button>`;
  }

  /**
   * Retry failed, and Open folder, for a transfer that has finished.
   * @param transfer The transfer.
   * @param failed Whether anything in it failed.
   * @returns The buttons.
   */
  #finishedActions(transfer: UmbraDesktopTransfer, failed: boolean) {
    return html`${failed
        ? html`<uui-button
            compact
            look="secondary"
            label=${this.localize.term('umbraDesktopMedia_transferRetryFailed')}
            @click=${() => void this.#context?.retryTransfer(transfer.id)}>
            ${this.localize.term('umbraDesktopMedia_transferRetryFailed')}
          </uui-button>`
        : nothing}
      ${transfer.target !== undefined
        ? html`<uui-button compact look="primary" label=${this.localize.term('umbraDesktopMedia_transferOpenFolder')} @click=${() => this.#openFolder(transfer)}>
            ${this.localize.term('umbraDesktopMedia_transferOpenFolder')}
          </uui-button>`
        : nothing}`;
  }

  /**
   * One item's row: what it is, where it goes, and where it is.
   * @param transfer Its transfer.
   * @param row The item.
   * @returns The row.
   */
  #renderRow(transfer: UmbraDesktopTransfer, row: UmbraDesktopTransferRow) {
    const summary = row.key === '#worked';
    const name = summary ? this.localize.term(row.name, row.path ?? '') : row.name;
    const where = summary ? '' : (row.path ?? (transfer.targetName ? this.localize.string(transfer.targetName) : ''));
    return html`<div class="row" ?failed=${row.status === 'failed'}>
      <uui-icon class="kind" name=${row.folder || summary ? 'icon-folder' : 'icon-picture'}></uui-icon>
      <span class="name"><b>${name}</b>${where ? html`<small>${where}</small>` : nothing}${row.reason ? html`<em>${row.reason}</em>` : nothing}</span>
      <span class="status">${this.#renderStatus(row)}</span>
      ${row.status === 'failed' && !summary
        ? html`<uui-button compact look="secondary" label=${this.localize.term('umbraDesktopMedia_transferRetry')} @click=${() => void this.#context?.retryTransfer(transfer.id, [row.key])}>
            ${this.localize.term('umbraDesktopMedia_transferRetry')}
          </uui-button>`
        : nothing}
    </div>`;
  }

  /**
   * Where an item is: a tick, a warning, a small bar, or a word.
   * @param row The item.
   * @returns The status.
   */
  #renderStatus(row: UmbraDesktopTransferRow) {
    switch (row.status) {
      case 'done':
        return html`<uui-icon class="ok" name="icon-check"></uui-icon>`;
      case 'failed':
        return html`<uui-icon class="bad" name="icon-alert"></uui-icon>`;
      case 'waiting':
        return html`<span class="word">${this.localize.term('umbraDesktopMedia_transferWaiting')}</span>`;
      case 'cancelled':
        return html`<span class="word">${this.localize.term('umbraDesktopMedia_transferCancelled')}</span>`;
      default:
        return row.progress !== undefined && row.progress > 0
          ? html`<span class="mini"><span style="width:${row.progress * 100}%"></span></span>${Math.round(row.progress * 100)}%`
          : html`<uui-loader-circle></uui-loader-circle>`;
    }
  }

  static override styles = css`
    :host {
      display: block;
      height: 100%;
      overflow: auto;
      box-sizing: border-box;
      padding: var(--uui-size-space-4, 12px);
      background: var(--uui-color-background);
      color: var(--uui-color-text);
      font-family: var(--umbradesktop-app-font, inherit);
    }

    .empty {
      color: var(--uui-color-text-alt);
    }

    .transfer {
      background: var(--uui-color-surface);
      border: 1px solid var(--uui-color-border);
      border-radius: var(--uui-border-radius, 3px);
      padding: var(--uui-size-space-4, 12px);
      margin-bottom: var(--uui-size-space-4, 12px);
    }

    header {
      display: flex;
      align-items: center;
      gap: var(--uui-size-space-3, 9px);
    }

    .title {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .actions {
      display: flex;
      gap: var(--uui-size-space-2, 6px);
    }

    .transfer[failed] header uui-icon {
      color: var(--uui-color-danger);
    }

    .bar {
      height: 6px;
      margin: var(--uui-size-space-3, 9px) 0 var(--uui-size-space-2, 6px);
      border-radius: 3px;
      background: var(--uui-color-border);
      overflow: hidden;
    }

    .bar > span {
      display: block;
      height: 100%;
      background: var(--umbradesktop-app-accent, var(--uui-color-selected));
    }

    .bar[paused] > span {
      background: var(--uui-color-text-alt);
    }

    .meta {
      font-size: var(--uui-type-small-size, 12px);
      color: var(--uui-color-text-alt);
      margin-bottom: var(--uui-size-space-3, 9px);
    }

    .row {
      display: flex;
      align-items: center;
      gap: var(--uui-size-space-3, 9px);
      padding: var(--uui-size-space-2, 6px) 0;
      border-top: 1px solid var(--uui-color-divider, var(--uui-color-border));
    }

    .name {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .name b,
    .name small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .name b {
      font-weight: normal;
    }

    .name small {
      color: var(--uui-color-text-alt);
    }

    .name em {
      font-style: normal;
      color: var(--uui-color-danger);
      font-size: var(--uui-type-small-size, 12px);
    }

    .status {
      display: flex;
      align-items: center;
      gap: var(--uui-size-space-2, 6px);
      font-size: var(--uui-type-small-size, 12px);
      color: var(--uui-color-text-alt);
    }

    .ok {
      color: var(--uui-color-positive);
    }

    .bad {
      color: var(--uui-color-danger);
    }

    .mini {
      display: inline-block;
      width: 48px;
      height: 4px;
      border-radius: 2px;
      background: var(--uui-color-border);
      overflow: hidden;
    }

    .mini > span {
      display: block;
      height: 100%;
      background: var(--umbradesktop-app-accent, var(--uui-color-selected));
    }
  `;
}

export default UmbraDesktopMediaTransfersElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-media-transfers': UmbraDesktopMediaTransfersElement;
  }
}
