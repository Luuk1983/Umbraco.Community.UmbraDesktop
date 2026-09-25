import {
  DISK_CLEANUP_BUTTONS_PX,
  DISK_CLEANUP_CAPTION_PX,
  DISK_CLEANUP_DESCRIPTION_LINE_PX,
  DISK_CLEANUP_DESCRIPTION_PX,
  DISK_CLEANUP_INTRO_PX,
  DISK_CLEANUP_PADDING_PX,
  DISK_CLEANUP_ROW_PX,
  DISK_CLEANUP_STATUS_PX,
} from './constants.js';
import { createRecycleBins, RECYCLE_BINS } from './recycle-bins.js';
import type { RecycleBinCount, RecycleBinId, RecycleBins } from './recycle-bins.js';
import { AREA } from '../shared/area.js';
import { accessoryStyles } from '../shared/styles.js';
import { css, customElement, html, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { umbConfirmModal } from '@umbraco-cms/backoffice/modal';

/** What Disk Cleanup is about to delete: each ticked bin and how many items are in it. */
export type DiskCleanupCounts = Partial<Record<RecycleBinId, number>>;

/** Each bin's name, icon and description, as dictionary keys with their English. */
const BIN_TEXT: Record<RecycleBinId, { icon: string; name: [string, string]; about: [string, string] }> = {
  content: {
    icon: 'icon-document',
    name: ['diskCleanupContent', 'Content recycle bin'],
    about: [
      'diskCleanupContentAbout',
      'Pages deleted in the Content section, with everything under them. Emptying the bin deletes them for good, for everyone: they cannot be restored afterwards.',
    ],
  },
  media: {
    icon: 'icon-picture',
    name: ['diskCleanupMedia', 'Media recycle bin'],
    about: [
      'diskCleanupMediaAbout',
      'Media deleted in the Media section, with its files. Emptying the bin deletes the items and their files for good, for everyone: they cannot be restored afterwards.',
    ],
  },
};

/**
 * Disk Cleanup, as Windows 98 had it: "Files to delete", a ticked list with how much each would
 * free, a description of the one you are on, and a button that asks before it does anything. What
 * it cleans up here is the content and media recycle bins, which is where an Umbraco site keeps what
 * it no longer needs.
 *
 * **It is the most destructive thing on the desktop, so it is built to be hard to do by accident.**
 * Nothing is ticked when it opens. Clean up is unavailable until something is. Pressing it counts
 * the ticked bins again, in case somebody has deleted something since the window opened, and asks,
 * in the backoffice's red confirmation dialog, naming how many items each bin holds and that they
 * cannot be restored. Only a yes empties anything.
 *
 * It uses Umbraco's own recycle bin endpoints, so who may empty a bin is Umbraco's decision, exactly
 * as it is in the Content and Media sections; a bin the user may not empty cannot be ticked, and
 * says why.
 */
@customElement('umbradesktop-disk-cleanup')
export class DiskCleanupElement extends UmbLitElement {
  /** The recycle bins. Umbraco's, over its management API, unless a test says otherwise. */
  @property({ attribute: false })
  bins: RecycleBins = createRecycleBins();

  /**
   * Ask before deleting. Umbraco's confirmation dialog, in its danger colour, unless a test says
   * otherwise. Resolves true only on a yes.
   */
  @property({ attribute: false })
  confirmCleanup: (counts: DiskCleanupCounts) => Promise<boolean> = (counts) => this.#confirm(counts);

  /** What each bin holds, once counted. */
  @state()
  private _counts: Partial<Record<RecycleBinId, RecycleBinCount>> = {};

  /** The ticked bins. */
  @state()
  private _ticked = new Set<RecycleBinId>();

  /** The bin whose description shows. */
  @state()
  private _current: RecycleBinId = 'content';

  /** Whether counting or cleaning is under way, which holds every button. */
  @state()
  private _busy = false;

  /** The line beside the buttons: what just happened. */
  @state()
  private _status = '';

  /** Count the bins as the window opens. */
  override connectedCallback(): void {
    super.connectedCallback();
    void this.#refresh();
  }

  /**
   * One word from this package's dictionary.
   * @param key The key inside the area.
   * @param fallback The English, shown if the dictionary has not loaded.
   * @param args Values for `%0%` and on.
   * @returns The localised string. `termOrDefault` fills `%0%` into a dictionary entry but not into
   *   the fallback, so the fallback is filled here.
   */
  #term(key: string, fallback: string, ...args: unknown[]): string {
    return this.localize
      .termOrDefault(`${AREA}_${key}`, fallback, ...args)
      .replace(/%(\d+)%/g, (token, index: string) => String(args[Number(index)] ?? token));
  }

  /**
   * "1 item" or "3 items".
   * @param total How many.
   * @returns The words.
   */
  #items(total: number): string {
    return total === 1 ? this.#term('diskCleanupItem', '1 item') : this.#term('diskCleanupItems', '%0% items', total);
  }

  /**
   * Count every bin, and untick any that can no longer be emptied.
   * @returns What each bin holds.
   */
  async #count(): Promise<Partial<Record<RecycleBinId, RecycleBinCount>>> {
    const counts = Object.fromEntries(
      await Promise.all(RECYCLE_BINS.map(async (bin) => [bin, await this.bins.count(bin)] as const)),
    ) as Record<RecycleBinId, RecycleBinCount>;
    this._counts = counts;
    const ticked = new Set([...this._ticked].filter((bin) => this.#tickable(counts[bin])));
    if (ticked.size !== this._ticked.size) this._ticked = ticked;
    return counts;
  }

  /** Count again, on opening and on Refresh. */
  async #refresh(): Promise<void> {
    this._busy = true;
    this._status = '';
    await this.#count();
    this._busy = false;
  }

  /**
   * Whether a bin can be ticked: it was counted, the user may empty it, and it is not empty.
   * @param count The bin's count.
   * @returns True if it can.
   */
  #tickable(count: RecycleBinCount | undefined): boolean {
    return count?.status === 'ok' && count.total > 0;
  }

  /**
   * Tick or untick a bin, and show its description.
   * @param bin The bin.
   * @param event The checkbox's change.
   */
  #onTick(bin: RecycleBinId, event: Event): void {
    const ticked = new Set(this._ticked);
    if ((event.target as HTMLInputElement).checked) ticked.add(bin);
    else ticked.delete(bin);
    this._ticked = ticked;
    this._current = bin;
  }

  /**
   * Umbraco's confirmation dialog, in red, naming each bin and how much it holds.
   * @param counts What is about to go.
   * @returns True on a yes. The dialog rejects on a no, which is caught and is a no.
   */
  async #confirm(counts: DiskCleanupCounts): Promise<boolean> {
    const lines = RECYCLE_BINS.filter((bin) => counts[bin] !== undefined).map(
      (bin) => `${this.#term(...BIN_TEXT[bin].name)}: ${this.#items(counts[bin]!)}`,
    );
    try {
      await umbConfirmModal(this, {
        headline: this.#term('diskCleanupConfirmHeadline', 'Delete these for good?'),
        content: html`<p>${lines.map((line) => html`${line}<br />`)}</p>
          <p>
            ${this.#term(
              'diskCleanupConfirmQuestion',
              'Everything in them, and everything inside that, is deleted permanently, for everyone who uses this site. It cannot be restored.',
            )}
          </p>`,
        color: 'danger',
        confirmLabel: this.#term('diskCleanupConfirm', 'Delete permanently'),
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Count the ticked bins again, ask, and empty them on a yes. */
  async #clean(): Promise<void> {
    if (!this._ticked.size || this._busy) return;
    this._busy = true;
    this._status = '';
    const counts = await this.#count();
    const chosen = RECYCLE_BINS.filter((bin) => this._ticked.has(bin));
    const asking: DiskCleanupCounts = {};
    for (const bin of chosen) {
      const count = counts[bin];
      if (count?.status === 'ok' && count.total > 0) asking[bin] = count.total;
    }
    if (!Object.keys(asking).length || !(await this.confirmCleanup(asking))) {
      this._busy = false;
      return;
    }
    const failures: string[] = [];
    // One after the other, so a failure in the first is reported and the second still runs.
    for (const bin of Object.keys(asking) as RecycleBinId[]) {
      const result = await this.bins.empty(bin);
      if (result.status !== 'emptied') {
        failures.push(
          result.status === 'denied'
            ? this.#term('diskCleanupDenied_' + bin, `You do not have access to empty the ${bin} recycle bin.`)
            : this.#term('diskCleanupFailed_' + bin, `The ${bin} recycle bin could not be emptied.`),
        );
      }
    }
    this._ticked = new Set();
    await this.#count();
    this._status = failures.length ? failures.join(' ') : this.#term('diskCleanupDone', 'Cleaned up.');
    this._busy = false;
  }

  /**
   * What a bin's row says on its right: how much it holds, or why it cannot be ticked.
   * @param count The bin's count.
   * @returns The words.
   */
  #describeCount(count: RecycleBinCount | undefined): string {
    if (!count) return '…';
    if (count.status === 'denied') return this.#term('diskCleanupNoAccess', 'No access');
    if (count.status === 'failed') return this.#term('diskCleanupUnreadable', 'Could not be read');
    return count.total === 0 ? this.#term('diskCleanupEmpty', 'Empty') : this.#items(count.total);
  }

  /**
   * One bin's row.
   * @param bin The bin.
   * @returns The row.
   */
  #renderBin(bin: RecycleBinId) {
    const count = this._counts[bin];
    const text = BIN_TEXT[bin];
    return html`
      <label class="bin" data-bin=${bin} aria-current=${this._current === bin ? 'true' : 'false'} @focusin=${() => (this._current = bin)}>
        <input
          type="checkbox"
          .checked=${this._ticked.has(bin)}
          ?disabled=${this._busy || !this.#tickable(count)}
          @change=${(event: Event) => this.#onTick(bin, event)} />
        <uui-icon name=${text.icon}></uui-icon>
        <span class="bin-name">${this.#term(...text.name)}</span>
        <span class="count muted">${this.#describeCount(count)}</span>
      </label>
    `;
  }

  /**
   * The window.
   * @returns The intro, the list, the description and the buttons.
   */
  override render() {
    const current = BIN_TEXT[this._current];
    return html`
      <p class="intro">
        <uui-icon name="icon-trash-empty"></uui-icon>
        <span>
          ${this.#term(
            'diskCleanupIntro',
            'Disk Cleanup frees space on the server by permanently deleting what is in the recycle bins.',
          )}
        </span>
      </p>
      <span class="caption">${this.#term('diskCleanupFilesToDelete', 'Files to delete')}:</span>
      <div class="list sunken">${RECYCLE_BINS.map((bin) => this.#renderBin(bin))}</div>
      <span class="caption">${this.#term('diskCleanupDescription', 'Description')}</span>
      <p class="description">${this.#term(...current.about)}</p>
      <div class="buttons">
        <button class="control" data-action="refresh" ?disabled=${this._busy} @click=${() => this.#refresh()}>
          ${this.#term('diskCleanupRefresh', 'Refresh')}
        </button>
        <button class="control" data-action="clean" ?disabled=${this._busy || !this._ticked.size} @click=${() => this.#clean()}>
          ${this.#term('diskCleanupClean', 'Clean up…')}
        </button>
      </div>
      <p class="status" role="status">${this._status}</p>
    `;
  }

  /** The shared accessory look, and every height from `constants.ts`, which the manifest sums. */
  static override styles = [
    accessoryStyles,
    css`
      :host {
        height: 100%;
        padding: ${DISK_CLEANUP_PADDING_PX}px;
        gap: ${DISK_CLEANUP_PADDING_PX}px;
      }

      :host > * {
        flex-shrink: 0;
      }

      .intro {
        display: flex;
        align-items: center;
        gap: 10px;
        height: ${DISK_CLEANUP_INTRO_PX}px;
        margin: 0;
        overflow: hidden;
      }

      .intro uui-icon {
        flex-shrink: 0;
        font-size: 28px;
      }

      .caption {
        display: block;
        height: ${DISK_CLEANUP_CAPTION_PX}px;
        margin-bottom: -${DISK_CLEANUP_PADDING_PX - 4}px;
      }

      .list {
        display: flex;
        flex-direction: column;
        height: ${DISK_CLEANUP_ROW_PX * 2 + 2}px;
        padding: 1px;
      }

      .bin {
        display: flex;
        align-items: center;
        gap: 8px;
        height: ${DISK_CLEANUP_ROW_PX}px;
        padding: 0 8px;
        cursor: default;
      }

      .bin[aria-current='true'] {
        background: color-mix(in srgb, var(--umbradesktop-app-accent, var(--uui-color-selected)) 12%, transparent);
      }

      .bin-name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .count {
        white-space: nowrap;
      }

      .description {
        height: ${DISK_CLEANUP_DESCRIPTION_PX}px;
        margin: 0;
        overflow: auto;
        font-size: 0.9em;
        line-height: ${DISK_CLEANUP_DESCRIPTION_LINE_PX}px;
      }

      .buttons {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 6px;
        height: ${DISK_CLEANUP_BUTTONS_PX}px;
      }

      .buttons .control {
        height: ${DISK_CLEANUP_BUTTONS_PX}px;
      }

      .control:disabled {
        opacity: 0.5;
        cursor: default;
      }

      .status {
        height: ${DISK_CLEANUP_STATUS_PX}px;
        margin: 0;
        overflow: auto;
        font-size: 0.85em;
      }
    `,
  ];
}

export { DiskCleanupElement as element };

declare global {
  interface HTMLElementTagNameMap {
    /** Registered by the `@customElement` decorator above; declared so templates type-check. */
    'umbradesktop-disk-cleanup': DiskCleanupElement;
  }
}
