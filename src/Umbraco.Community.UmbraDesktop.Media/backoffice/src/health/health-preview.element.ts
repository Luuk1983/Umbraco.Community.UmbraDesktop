import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import type { HealthEntry } from './health-grid.js';
import { isImage } from './health-model.js';
import type { HealthKind } from './health-model.js';
import { isPreviewable, previewWidth } from './health-media.js';
import { formatBytes } from '../transfers/transfers-model.js';
import { wordsOf } from '../shared/words.js';
import type { WordKey } from '../shared/words.js';

/** Each kind's verb, and the event it fires: the selection bar's, for one entry. */
const VERBS: Record<HealthKind, { verb: WordKey; event: string }> = {
  unused: { verb: 'healthTrash', event: 'health-trash' },
  orphaned: { verb: 'healthDelete', event: 'health-delete' },
  oversized: { verb: 'healthOptimize', event: 'health-optimize' },
};

/**
 * Whether a URL is a PDF, which the browser can show itself.
 * @param url The URL.
 * @returns True for a `.pdf`.
 */
const isPdf = (url: string | null): boolean => !!url && /\.pdf$/i.test(url.split(/[?#]/)[0]);

/**
 * The preview (design §16.5, mock scene 6): one picture over the grid at a click on a card, asked from
 * Umbraco's image resizer at the size it draws, so a 14 MB original arrives as a few hundred KB, signed
 * as the thumbnails are (design §16.7). A PDF shows where the browser can, on the file itself; any
 * other file, and an item without one, shows an icon and its facts.
 *
 * It is the one by one too (plan Decision 11): the arrows step through the grid's order, the facts
 * under the picture are the ones that decide, and the kind's verb acts on this entry and moves to the
 * next at once, or to the one before at the end, and closes when none is left. Delete asks first, in
 * the window, since it is for good; the preview moves on once the file has gone from {@link entries}.
 * No edit view and no Image Editor (§16.5): this is for deciding what goes, not for changing what
 * stays.
 *
 * Fires `health-preview-close`, `health-show-in-manager` `{ entry }`, and the selection bar's verbs
 * `health-trash`, `health-delete` and `health-optimize` `{ ids, entries }` for this one entry.
 */
@customElement('umbradesktop-health-preview')
export class UmbraDesktopHealthPreviewElement extends UmbLitElement {
  /** The grid's entries in the order it showed them, as they are now; what has gone is left out. */
  @property({ attribute: false })
  entries: HealthEntry[] = [];

  /** The id of the entry shown; the arrows and the verbs change it here. */
  @property()
  current = '';

  /** Whether the person is an administrator, who alone may delete files from disk. */
  @property({ type: Boolean })
  admin = false;

  /**
   * Signs pictures that fit an edge-sized box, through the health context; without it, a picture shows
   * as a plain tile, never as an unsigned request.
   */
  @property({ attribute: false })
  signPreview?: (subjects: Array<{ url: string; key?: string }>, edge: number) => Promise<Map<string, string>>;

  /** How wide the picture draws, in CSS pixels; measured unless a test hands it in. */
  @property({ attribute: false })
  viewWidth?: number;

  /** The device pixel ratio; the window's unless a test hands one in. */
  @property({ attribute: false })
  pixelRatio?: number;

  /** The signed picture for the entry shown, once it came. */
  @state()
  private _src?: { id: string; url: string };

  /** The picture area's width, measured. */
  @state()
  private _measured = 0;

  /** The order the entries had at the last update, to find where the shown one stood once it has gone. */
  #order: string[] = [];

  /** This package's words. */
  #words = wordsOf(this.localize);

  /** Measures the picture area, for the width to ask the resizer for. */
  #resize = new ResizeObserver((entries) => {
    const width = Math.round(entries[0]?.contentRect.width ?? 0);
    if (width && width !== this._measured) requestAnimationFrame(() => (this._measured = width));
  });

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#resize.disconnect();
  }

  /** The entry shown. */
  get #entry(): HealthEntry | undefined {
    return this.entries.find((each) => each.id === this.current);
  }

  override willUpdate(changed: Map<string, unknown>): void {
    super.willUpdate(changed);
    // The entry shown has gone (deleted after the window asked, or trashed elsewhere): move to the one
    // that now stands where it stood, or the one before it at the end.
    if (changed.has('entries') && this.current && !this.#entry) {
      const ids = new Set(this.entries.map((each) => each.id));
      const at = this.#order.indexOf(this.current);
      const after = this.#order.slice(at + 1).find((id) => ids.has(id));
      const before = this.#order.slice(0, Math.max(0, at)).reverse().find((id) => ids.has(id));
      const next = after ?? before;
      if (next) this.current = next;
      else this.#close();
    }
    this.#order = this.entries.map((each) => each.id);
  }

  override updated(changed: Map<string, unknown>): void {
    super.updated(changed);
    const stage = this.renderRoot.querySelector('.picture');
    if (stage) this.#resize.observe(stage);
    if (changed.has('current') || changed.has('entries') || changed.has('_measured') || changed.has('viewWidth') || changed.has('signPreview')) this.#ask();
  }

  /**
   * Ask for the signed picture of the entry shown, at the width it draws, rounded up to the resizer's
   * steps so the cache answers the next look, and never wider than the picture itself is.
   */
  #ask(): void {
    const entry = this.#entry;
    const width = this.viewWidth ?? this._measured;
    if (!entry || !this.signPreview || !width || !isPreviewable(entry.url) || this._src?.id === entry.id) return;
    const natural = entry.item?.width && entry.item?.height ? Math.max(entry.item.width, entry.item.height) : Infinity;
    const edge = Math.min(previewWidth(width, this.pixelRatio ?? (window.devicePixelRatio || 1)), natural);
    const subject = entry.item ? { url: entry.url!, key: entry.item.key } : { url: entry.url! };
    const id = entry.id;
    void this.signPreview([subject], edge).then((signed) => {
      const url = signed.get(subject.url);
      if (url && this.current === id) this._src = { id, url };
    });
  }

  /**
   * Ask for something; the window decides.
   * @param name The event.
   * @param detail What it carries.
   */
  #fire(name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  /** Close the preview. */
  #close(): void {
    this.#fire('health-preview-close');
  }

  /**
   * Show the entry so many places on in the order.
   * @param step -1 for the one before, 1 for the next.
   */
  #step(step: number): void {
    const at = this.entries.findIndex((each) => each.id === this.current);
    const next = this.entries[at + step];
    if (next) this.current = next.id;
  }

  /**
   * Run the kind's verb on the entry shown. Move to recycle bin and Optimize move on at once; Delete
   * waits, since the window asks first and the file may stay.
   * @param entry The entry.
   */
  #act(entry: HealthEntry): void {
    this.#fire(VERBS[entry.kind].event, { ids: [entry.id], entries: [entry] });
    if (entry.kind === 'orphaned') return;
    const at = this.entries.findIndex((each) => each.id === entry.id);
    const next = this.entries[at + 1] ?? this.entries[at - 1];
    if (next) this.current = next.id;
    else this.#close();
  }

  /** The backoffice's culture, for dates. */
  get #locale(): string | undefined {
    return this.localize.lang() || undefined;
  }

  override render() {
    const entry = this.#entry;
    if (!entry) return nothing;
    const at = this.entries.indexOf(entry);
    return html`<div class="backdrop" @click=${this.#close}></div>
      <div class="box" role="dialog" aria-modal="true" aria-label=${entry.name}>
        <div class="stage">
          <uui-button class="nav" look="secondary" compact label=${this.#words('healthPrevious')} ?disabled=${at <= 0} @click=${() => this.#step(-1)}>
            <uui-icon name="icon-arrow-left"></uui-icon>
          </uui-button>
          <div class="picture">${this.#renderPicture(entry)}</div>
          <uui-button class="nav" look="secondary" compact label=${this.#words('healthNext')} ?disabled=${at >= this.entries.length - 1} @click=${() => this.#step(1)}>
            <uui-icon name="icon-arrow-right"></uui-icon>
          </uui-button>
        </div>
        ${this.#renderMeta(entry)}
      </div>`;
  }

  /**
   * The picture: the signed resized one, a PDF in the browser's own viewer, or an icon.
   * @param entry The entry.
   */
  #renderPicture(entry: HealthEntry) {
    if (isPreviewable(entry.url)) {
      const src = this._src?.id === entry.id ? this._src.url : undefined;
      return src ? html`<img src=${src} alt=${entry.name} />` : html`<uui-loader></uui-loader>`;
    }
    const icon = html`<uui-icon class="icon" name=${entry.item && isImage(entry.item) ? 'icon-picture' : 'icon-document'}></uui-icon>`;
    if (isPdf(entry.url)) return html`<object type="application/pdf" data=${entry.url!} aria-label=${entry.name}>${icon}</object>`;
    return icon;
  }

  /**
   * The facts that decide, under the picture, and the buttons: Show in Media Manager for an item, the
   * kind's verb, and Close.
   * @param entry The entry.
   */
  #renderMeta(entry: HealthEntry) {
    const denied = entry.kind === 'orphaned' && !this.admin;
    return html`<div class="meta">
      <div class="facts">
        <b>${entry.name}</b>
        <small class="muted">${this.#facts(entry).join(' · ')}</small>
        ${denied ? html`<small class="muted">${this.#words('healthAdminOnly')}</small>` : nothing}
      </div>
      ${entry.item
        ? html`<uui-button look="secondary" label=${this.#words('healthShowInManager')} @click=${() => this.#fire('health-show-in-manager', { entry })}></uui-button>`
        : nothing}
      <uui-button
        look="primary"
        color=${entry.kind === 'oversized' ? 'default' : 'danger'}
        label=${this.#words(VERBS[entry.kind].verb)}
        ?disabled=${denied}
        @click=${() => this.#act(entry)}></uui-button>
      <uui-button look="secondary" label=${this.#words('healthClose')} @click=${this.#close}></uui-button>
    </div>`;
  }

  /**
   * The facts line: where it is (its folder, or for an orphaned file its place on disk), its size in pixels when it has one, when it last changed, its size,
   * and for an unused item that no page uses it.
   * @param entry The entry.
   * @returns The parts.
   */
  #facts(entry: HealthEntry): string[] {
    // An orphaned file is in no folder of the library; where it is on disk is what says something.
    const folder = entry.orphan ? entry.orphan.url.slice(0, entry.orphan.url.lastIndexOf('/')) : entry.folderPath.split('/').filter(Boolean).join(' / ');
    const parts = [folder || this.#words('healthRoot')];
    const item = entry.item;
    if (item?.width && item?.height) parts.push(`${item.width} × ${item.height}`);
    const changed = item?.updatedUtc ?? entry.orphan?.lastModifiedUtc;
    if (changed) parts.push(this.#words('healthLastChanged', new Date(changed).toLocaleDateString(this.#locale, { month: 'long', year: 'numeric' })));
    parts.push(entry.sized ? formatBytes(entry.bytes) : this.#words('healthSizeUnknown'));
    if (entry.kind === 'unused') parts.push(this.#words('healthNotUsed'));
    return parts;
  }

  static override styles = css`
    :host {
      position: absolute;
      inset: 0;
      z-index: 3;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--uui-size-space-5, 18px);
      box-sizing: border-box;
    }

    .backdrop {
      position: absolute;
      inset: 0;
      background: var(--uui-color-overlay, rgba(0, 0, 0, 0.4));
    }

    .box {
      position: relative;
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      background: var(--uui-color-surface);
      color: var(--uui-color-text);
      border-radius: var(--uui-border-radius, 3px);
      box-shadow: var(--uui-shadow-depth-5, 0 12px 40px rgba(0, 0, 0, 0.35));
      overflow: hidden;
    }

    .stage {
      flex: 1;
      min-height: 0;
      display: flex;
      align-items: center;
      gap: var(--uui-size-space-3, 9px);
      padding: var(--uui-size-space-3, 9px);
      background: var(--uui-color-surface-alt);
    }

    .nav {
      flex: none;
    }

    .picture {
      flex: 1;
      min-width: 0;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .picture img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }

    .picture object {
      width: 100%;
      height: 100%;
    }

    .icon {
      font-size: 64px;
      color: var(--uui-color-text-alt);
    }

    .meta {
      display: flex;
      align-items: center;
      gap: var(--uui-size-space-2, 6px);
      padding: var(--uui-size-space-3, 9px) var(--uui-size-space-4, 12px);
      border-top: 1px solid var(--uui-color-border);
    }

    .facts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .facts b {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .muted {
      color: var(--uui-color-text-alt);
      font-size: var(--uui-type-small-size, 12px);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-health-preview': UmbraDesktopHealthPreviewElement;
  }
}
