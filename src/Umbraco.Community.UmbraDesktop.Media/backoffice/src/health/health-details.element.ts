import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_CURRENT_USER_CONTEXT } from '@umbraco-cms/backoffice/current-user';
import { UMBRADESKTOP_MEDIA_HEALTH_CONTEXT } from './media-health.context.js';
import type { UmbraDesktopMediaHealthBrowse, UmbraDesktopMediaHealthContext } from './media-health.context.js';
import type { HealthEntry } from './health-grid.js';
import { OVERSIZED_BYTES, isImage } from './health-model.js';
import type { HealthKind } from './health-model.js';
import { isPreviewable, previewWidth } from './health-media.js';
import { keepEndsOn } from './health-keep.js';
import { formatBytes } from '../transfers/transfers-model.js';
import { wordsOf } from '../shared/words.js';
import type { WordKey } from '../shared/words.js';
import { healthColours } from './health-styles.js';

/** Each kind's verb, as the list's selection bar names it, and why a row of the kind is listed. */
const KINDS: Record<HealthKind, { verb: WordKey; why: WordKey }> = {
  unused: { verb: 'healthTrash', why: 'healthWhyUnused' },
  orphaned: { verb: 'healthDelete', why: 'healthWhyOrphaned' },
  oversized: { verb: 'healthOptimize', why: 'healthWhyOversized' },
};

/**
 * Whether a URL is a PDF, which the browser can show itself.
 * @param url The URL.
 * @returns True for a `.pdf`.
 */
const isPdf = (url: string | null): boolean => !!url && /\.pdf$/i.test(url.split(/[?#]/)[0]);

/**
 * The details pane (design §16.15, mock scene 3): the current row of the cleanup list, beside it in the
 * desktop's attached pane, or in a window of its own grouped with it where there is no room. The desktop
 * draws the pane, its header, splitter, pop out and close; this is only what is inside.
 *
 * It replaced the preview overlay of step 2, which covered the list and opened at a stray click: the
 * list stays in view here, and a click only makes a row current. It is the one by one too: the kind's
 * verb works on the current row and the context moves on to the next, and Previous and Next walk the
 * list's order. **Keep…** sits beside the verb (design §16.6); a kept row shows its keep, the note, who
 * and until when, with **Stop keeping** as its one action, and a row whose keep ended shows the old
 * keep among its facts.
 *
 * The desktop mounts it outside the Media Cleanup window, so it reads everything from the health
 * context on the desktop (the current row, the order, the entries) and acts through it; the window
 * asks before a Delete, in the Clean up sheet's words. The picture is asked from Umbraco's resizer
 * at the width it draws, uncropped and signed, as the preview's was; a PDF shows in the browser's own
 * viewer; anything else is an icon. No edit view and no Image Editor: this is for deciding what goes.
 */
@customElement('umbradesktop-health-details')
export class UmbraDesktopHealthDetailsElement extends UmbLitElement {
  /** The owner window, as the desktop tells an attached element; one Media Cleanup window, so unread. */
  @property({ attribute: false })
  ownerId?: string;

  /** The device pixel ratio; the window's unless a test hands one in. */
  @property({ attribute: false })
  pixelRatio?: number;

  /** The list and its current row, from the context. */
  @state()
  private _browse?: UmbraDesktopMediaHealthBrowse;

  /** The current row's entry, looked up whenever the row or the result changes. */
  @state()
  private _entry?: HealthEntry;

  /** Whether the person is an administrator, who alone may delete files from disk. */
  @state()
  private _admin = false;

  /** The signed picture for the entry shown, once it came. */
  @state()
  private _src?: { id: string; url: string };

  /** The picture area's width, measured. */
  @state()
  private _measured = 0;

  /** The health context. */
  #context?: UmbraDesktopMediaHealthContext;

  /** This package's words. */
  #words = wordsOf(this.localize);

  /** Measures the picture area, for the width to ask the resizer for. */
  #resize = new ResizeObserver((entries) => {
    const width = Math.round(entries[0]?.contentRect.width ?? 0);
    if (width && width !== this._measured) requestAnimationFrame(() => (this._measured = width));
  });

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_MEDIA_HEALTH_CONTEXT, (context) => {
      this.#context = context ?? undefined;
      if (!context) return;
      this.observe(context.browse, (browse) => {
        this._browse = browse;
        this.#look();
      }, 'umbradesktopHealthBrowse');
      this.observe(context.state, () => this.#look(), 'umbradesktopHealthDetailsState');
    });
    this.consumeContext(UMB_CURRENT_USER_CONTEXT, (user) => {
      this.observe(user?.currentUser, (current) => (this._admin = !!current?.isAdmin), 'umbradesktopHealthDetailsUser');
    });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#resize.disconnect();
  }

  /** Find the current row's entry in the context's entries, which follow the result. */
  #look(): void {
    const id = this._browse?.current;
    this._entry = id === undefined ? undefined : this.#context?.entries().find((each) => each.id === id);
  }

  override updated(changed: Map<string, unknown>): void {
    super.updated(changed);
    const picture = this.renderRoot.querySelector('.picture');
    if (picture) this.#resize.observe(picture);
    if (changed.has('_entry') || changed.has('_measured')) this.#ask();
  }

  /**
   * Ask for the signed picture of the entry shown, at the width it draws, rounded up to the resizer's
   * steps so the cache answers the next look, and never wider than the picture itself is.
   */
  #ask(): void {
    const entry = this._entry;
    const width = this._measured;
    if (!entry || !this.#context || !width || !isPreviewable(entry.url) || this._src?.id === entry.id) return;
    const natural = entry.item?.width && entry.item?.height ? Math.max(entry.item.width, entry.item.height) : Infinity;
    const edge = Math.min(previewWidth(width, this.pixelRatio ?? (window.devicePixelRatio || 1)), natural);
    const subject = entry.item ? { url: entry.url!, key: entry.item.key } : { url: entry.url! };
    const id = entry.id;
    void this.#context.thumbnails([subject], edge, { fit: true }).then((signed) => {
      const url = signed.get(subject.url);
      if (url && this._entry?.id === id) this._src = { id, url };
    });
  }

  /** The backoffice's culture, for dates. */
  get #locale(): string | undefined {
    return this.localize.lang() || undefined;
  }

  override render() {
    const entry = this._entry;
    const order = this._browse?.order ?? [];
    if (!entry) return html`<p class="pick">${this.#words(order.length ? 'healthPickRow' : 'healthNothingLeft')}</p>`;
    const at = order.indexOf(entry.id);
    const denied = entry.kind === 'orphaned' && !this._admin;
    const kept = !!entry.keep && !entry.keep.ended;
    return html`<div class="content">
        <uui-box class="preview">
          <div class="picture">${this.#renderPicture(entry)}</div>
          ${entry.item
            ? html`<uui-button
                class="show"
                look="secondary"
                compact
                label=${this.#words('healthShowInManager')}
                title=${this.#words('healthShowInManager')}
                @click=${() => this.#context?.showInManager(entry)}><uui-icon name="icon-out"></uui-icon></uui-button>`
            : nothing}
          <div class="title">
            <h3>${entry.name}</h3>
            <span class="why">${this.#words(KINDS[entry.kind].why, formatBytes(OVERSIZED_BYTES))}</span>
          </div>
        </uui-box>
        ${entry.keep
          ? html`<uui-box headline=${this.#words('healthKept')}>
              ${this.#keepFacts(entry.keep).map(([term, value]) => html`<div class="general-item"><strong>${term}</strong><span>${value}</span></div>`)}
            </uui-box>`
          : nothing}
        <uui-box headline=${this.localize.term('general_general')}>
          ${this.#facts(entry).map(([term, value]) => html`<div class="general-item"><strong>${term}</strong><span>${value}</span></div>`)}
        </uui-box>
      </div>
      <div class="footer">
        ${denied && !kept ? html`<small class="why">${this.#words('healthAdminOnly')}</small>` : nothing}
        <div class="verbs">
          ${kept
            ? html`<uui-button look="primary" label=${this.#words('healthStopKeeping')} @click=${() => void this.#context?.stopKeeping([entry.id])}></uui-button>`
            : html`<uui-button
                  look="primary"
                  color=${entry.kind === 'oversized' ? 'positive' : 'danger'}
                  label=${this.#words(KINDS[entry.kind].verb)}
                  ?disabled=${denied}
                  @click=${() => void this.#context?.act([entry.id], { admin: this._admin, title: this.#words('healthOversized') })}></uui-button>
                <uui-button look="secondary" label=${this.#words('healthKeep')} @click=${() => this.#context?.askKeep([entry.id])}></uui-button>`}
        </div>
        <div class="steps">
          <uui-button look="secondary" label=${this.#words('healthPrevious')} ?disabled=${at <= 0} @click=${() => this.#context?.step(-1)}>
            <uui-icon name="icon-arrow-left"></uui-icon>${this.#words('healthPrevious')}
          </uui-button>
          <uui-button look="secondary" label=${this.#words('healthNext')} ?disabled=${at >= order.length - 1 && at >= 0} @click=${() => this.#context?.step(1)}>
            ${this.#words('healthNext')}<uui-icon name="icon-arrow-right"></uui-icon>
          </uui-button>
        </div>
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
   * The facts that decide, as label and value: where it is (its folder, or for an orphaned file its
   * place on disk), its size in pixels when it has one, its size, and when it last changed.
   * @param entry The entry.
   * @returns The facts, in order.
   */
  #facts(entry: HealthEntry): Array<[string, string]> {
    // An orphaned file is in no folder of the library; where it is on disk is what says something.
    const folder = entry.orphan ? entry.orphan.url.slice(0, entry.orphan.url.lastIndexOf('/')) : entry.folderPath.split('/').filter(Boolean).join(' / ');
    const facts: Array<[string, string]> = [[this.#words('healthFolder'), folder || this.#words('healthRoot')]];
    const item = entry.item;
    if (item?.width && item?.height) facts.push([this.#words('healthDimensions'), `${item.width} × ${item.height}`]);
    facts.push([this.#words('healthSize'), entry.sized ? formatBytes(entry.bytes) : this.#words('healthSizeUnknown')]);
    const changed = item?.updatedUtc ?? entry.orphan?.lastModifiedUtc;
    if (changed) facts.push([this.#words('healthChanged'), new Date(changed).toLocaleDateString(this.#locale, { month: 'long', year: 'numeric' })]);
    return facts;
  }

  /**
   * A keep's facts (design §16.6): the note, who kept it and when, and until when; for a keep that ended
   * because the file changed, that it did, since the date alone would not say why it is back.
   * @param keep The keep.
   * @returns The facts, in order.
   */
  #keepFacts(keep: NonNullable<HealthEntry['keep']>): Array<[string, string]> {
    const date = (value: Date) => value.toLocaleDateString(this.#locale, { day: 'numeric', month: 'short', year: 'numeric' });
    const ends = keepEndsOn(keep);
    const until = ends ? date(ends) : this.#words('healthKeepAlways');
    return [
      [this.#words('healthKeptNote'), keep.note ? `“${keep.note}”` : this.#words('healthKeptNoNote')],
      [this.#words('healthKeptBy'), this.#words('healthKeptByOn', keep.keptByName, date(new Date(keep.keptUtc)))],
      [this.#words('healthKeptUntil'), keep.ended === 'Changed' ? this.#words('healthKeptEndedChanged', until) : until],
    ];
  }

  static override styles = [
    healthColours,
    css`
      /*
       * Core's media Info view: boxes on the backoffice background, the layout spacing between them.
       * The boxes scroll; the actions stay in a footer at the foot of the pane, in view however short
       * the pane is (Luuk, 2026-10-29).
       */
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        box-sizing: border-box;
        background: var(--uui-color-background);
        color: var(--uui-color-text);
        font-family: var(--umbradesktop-app-font, inherit);
        font-size: var(--uui-type-default-size, 14px);
      }

      .content {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-5, 18px);
        padding: var(--uui-size-space-5, 18px);
      }

      /* Each box keeps its height; the boxes scroll rather than squeezing a box's content out of it. */
      .content > * {
        flex: none;
      }

      .footer {
        flex: none;
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-3, 9px);
        padding: var(--uui-size-space-4, 12px) var(--uui-size-space-5, 18px);
        background: var(--uui-color-surface);
        border-top: 1px solid var(--uui-color-border);
      }

      /* The kind's action and Keep…, side by side, each taking half; Stop keeping alone takes it all. */
      .verbs {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: 1fr;
        gap: var(--uui-size-space-3, 9px);
      }

      /* Show in Media Manager: an icon on the picture's corner, as the folder rows draw it. */
      .show {
        position: absolute;
        top: var(--uui-size-space-3, 9px);
        right: var(--uui-size-space-3, 9px);
        background: var(--uui-color-surface);
        border-radius: var(--uui-border-radius, 3px);
      }

      .pick {
        margin: auto;
        text-align: center;
        color: var(--uui-color-text-alt);
      }

      .preview {
        position: relative;
        --uui-box-default-padding: 0;
        overflow: hidden;
      }

      /* The picture's stage, a 4:3 box on surface-alt across the top of its box. */
      .picture {
        display: flex;
        align-items: center;
        justify-content: center;
        aspect-ratio: 4 / 3;
        background: var(--uui-color-surface-alt);
        overflow: hidden;
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

      .title {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-1, 3px);
        padding: var(--uui-size-space-4, 12px) var(--uui-size-space-5, 18px);
      }

      h3 {
        margin: 0;
        font-size: var(--uui-type-h5-size, 15px);
        line-height: 1.3;
        overflow-wrap: anywhere;
      }

      .why {
        color: var(--uui-color-text-alt);
      }

      /* Core's general items: the label bold above its value, a space-6 between items. */
      .general-item {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-1, 3px);
        overflow-wrap: anywhere;
      }

      .general-item:not(:last-child) {
        margin-bottom: var(--uui-size-space-6, 24px);
      }

      .steps {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--uui-size-space-3, 9px);
      }
    `,
  ];
}

export default UmbraDesktopHealthDetailsElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-health-details': UmbraDesktopHealthDetailsElement;
  }
}
