import { css, customElement, html, live, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import type { TemplateResult } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_CURRENT_USER_CONTEXT } from '@umbraco-cms/backoffice/current-user';
import { wordsOf } from '../shared/words.js';
import type { WordKey } from '../shared/words.js';
import { DEFAULT_GUIDELINES, GUIDELINE_FORMATS, IMAGE_KINDS, LARGEST_LONGEST_SIDE } from './guidelines.js';
import type { GuidelineFormat, ImageKind, MediaGuidelines } from './guidelines.js';
import { createMediaGuidelinesApi } from './guidelines-api.js';
import type { MediaGuidelinesApi } from './guidelines-api.js';

/** The Settings section's alias: who may change the guidelines, as the server's write policy says. */
const SETTINGS_SECTION = 'Umb.Section.Settings';

/** How long after the last change the guidelines are stored, so typing a number stores it once. */
const WRITE_DELAY_MS = 400;

/** Each kind's row label. */
const KIND_WORDS: Record<ImageKind, WordKey> = {
  jpeg: 'guidelinesKindJpeg',
  'png-photo': 'guidelinesKindPngPhoto',
  'png-transparent': 'guidelinesKindPngTransparent',
  webp: 'guidelinesKindWebp',
  gif: 'guidelinesKindGif',
};

/** Each format's name in a row's list; Keep is a word, the rest are names. */
const FORMAT_NAMES: Record<Exclude<GuidelineFormat, 'keep'>, string> = { jpeg: 'JPEG', png: 'PNG', webp: 'WebP' };

/** Where the box stands with the server, for its status line. */
type Status = 'unread' | 'saving' | 'saved' | 'failed' | undefined;

/**
 * The media guidelines (#179) as a box in Desktop settings, under Add-ons, in the Media row: three
 * switches, Maximum size, Formats and Location, each with its settings under it, kept in view and
 * greyed while the switch is off, as the desktop label's settings are. Like every other desktop
 * setting there is no Save: a change applies at once, stored on the server for the whole site.
 *
 * Anyone can see them, since every editor's uploads are checked against them; only users with the
 * Settings section can change them, which the server enforces and the box says. Its first line says
 * which uploads are checked, so nobody expects core's own upload to be.
 */
@customElement('umbradesktop-media-guidelines-panel')
export class UmbraDesktopMediaGuidelinesPanelElement extends UmbLitElement {
  /** The server's calls; a test hands in its own. */
  @property({ attribute: false })
  api: MediaGuidelinesApi = createMediaGuidelinesApi();

  /**
   * Whether this user may change the guidelines: the Settings section, read from the current user
   * unless a test sets it.
   */
  @property({ attribute: false })
  canEdit?: boolean;

  /** How long after the last change a write waits, in ms; a test sets 0. */
  @property({ attribute: false })
  writeDelay = WRITE_DELAY_MS;

  /** The guidelines on show, undefined until read. */
  @state()
  private _guidelines?: MediaGuidelines;

  /** Whether the current user has the Settings section, as the backoffice says. */
  @state()
  private _settingsUser = false;

  /** Where the box stands with the server. */
  @state()
  private _status: Status;

  /** The words. */
  readonly #words = wordsOf(this.localize);

  /** The write waiting for the person to stop changing things. */
  #pending?: number;

  constructor() {
    super();
    this.consumeContext(UMB_CURRENT_USER_CONTEXT, (user) => {
      this.observe(user?.currentUser, (current) => (this._settingsUser = !!current?.allowedSections?.includes(SETTINGS_SECTION)), 'umbraDesktopGuidelinesUser');
    });
  }

  override connectedCallback(): void {
    super.connectedCallback();
    void this.#read();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    // A change still waiting goes now, rather than being lost with the box.
    if (this.#pending !== undefined) {
      window.clearTimeout(this.#pending);
      this.#pending = undefined;
      if (this._guidelines) void this.api.write(this._guidelines);
    }
  }

  /** Whether this user may change them. */
  get #editable(): boolean {
    return this.canEdit ?? this._settingsUser;
  }

  /** Read the guidelines from the server; the defaults, said so, when they cannot be. */
  async #read(): Promise<void> {
    const read = await this.api.read();
    this._guidelines = read ?? structuredClone(DEFAULT_GUIDELINES);
    this._status = read ? undefined : 'unread';
  }

  /**
   * Change the guidelines, and store all of them shortly after: the server keeps them as one document.
   * @param change The new guidelines, from the old.
   */
  #change(change: (guidelines: MediaGuidelines) => MediaGuidelines): void {
    if (!this._guidelines || !this.#editable) return;
    this._guidelines = change(this._guidelines);
    window.clearTimeout(this.#pending);
    this._status = 'saving';
    this.#pending = window.setTimeout(() => void this.#write(), this.writeDelay);
  }

  /** Store the guidelines on show. */
  async #write(): Promise<void> {
    this.#pending = undefined;
    const guidelines = this._guidelines;
    if (!guidelines) return;
    const ok = await this.api.write(guidelines);
    if (this.#pending === undefined) this._status = ok ? 'saved' : 'failed';
  }

  /**
   * A whole number typed into a field, or undefined when it is not one in range, which leaves the
   * guideline as it was and puts the field back.
   * @param event The field's change.
   * @param most The largest it may be.
   * @returns The number.
   */
  #number(event: Event, most: number): number | undefined {
    const raw = String((event.target as HTMLInputElement).value ?? '').trim();
    const value = Number(raw);
    if (raw === '' || !Number.isInteger(value) || value < 1 || value > most) {
      this.requestUpdate();
      return undefined;
    }
    return value;
  }

  override render() {
    const guidelines = this._guidelines;
    if (!guidelines) return nothing;
    const words = this.#words;
    const locked = !this.#editable;
    return html`
      <p class="about">${words('guidelinesSettingsAbout')}</p>
      ${locked ? html`<p class="read-only"><umb-icon name="icon-lock"></umb-icon><span>${words('guidelinesReadOnly')}</span></p>` : nothing}
      <div class="row">
        ${this.#toggle('maxSize', words('guidelinesMaxSize'), guidelines.maxSize.on, locked, (on) => (g) => ({ ...g, maxSize: { ...g.maxSize, on } }))}
        <p class="hint">${words('guidelinesMaxSizeHint')}</p>
        <div class="fields">
          <label class="field">
            <span class="key ${guidelines.maxSize.on ? '' : 'inapplicable'}">${words('guidelinesLongestSide')}</span>
            <uui-input
              type="number"
              name="longestSide"
              min="1"
              max=${LARGEST_LONGEST_SIDE}
              label=${words('guidelinesLongestSide')}
              .value=${live(String(guidelines.maxSize.longestSide))}
              ?disabled=${locked || !guidelines.maxSize.on}
              @change=${(event: Event) => {
                const side = this.#number(event, LARGEST_LONGEST_SIDE);
                if (side !== undefined) this.#change((g) => ({ ...g, maxSize: { ...g.maxSize, longestSide: side } }));
              }}></uui-input>
            <span class="unit">px</span>
          </label>
        </div>
      </div>
      <div class="row">
        ${this.#toggle('formats', words('guidelinesFormats'), guidelines.formats.on, locked, (on) => (g) => ({ ...g, formats: { ...g.formats, on } }))}
        <p class="hint">${words('guidelinesFormatsHint')}</p>
        <div class="fields kinds">
          ${IMAGE_KINDS.map((kind) => this.#renderKind(kind, guidelines, locked))}
          <label class="field">
            <span class="key ${guidelines.formats.on ? '' : 'inapplicable'}">${words('guidelinesQuality')}</span>
            <uui-input
              type="number"
              name="quality"
              min="1"
              max="100"
              label=${words('guidelinesQuality')}
              .value=${live(String(guidelines.formats.quality))}
              ?disabled=${locked || !guidelines.formats.on}
              @change=${(event: Event) => {
                const quality = this.#number(event, 100);
                if (quality !== undefined) this.#change((g) => ({ ...g, formats: { ...g.formats, quality } }));
              }}></uui-input>
          </label>
          <p class="hint field-hint ${guidelines.formats.on ? '' : 'inapplicable'}">${words('guidelinesQualityHint')}</p>
        </div>
      </div>
      <div class="row">
        ${this.#toggle('location', words('guidelinesLocation'), guidelines.location.on, locked, (on) => (g) => ({ ...g, location: { on } }))}
        <p class="hint">${words('guidelinesLocationHint')}</p>
      </div>
      <p class="status ${this._status === 'failed' || this._status === 'unread' ? 'bad' : ''}" role="status">${this.#statusLine()}</p>
    `;
  }

  /**
   * A guideline's switch.
   * @param name Which.
   * @param label Its name.
   * @param on Whether it is on.
   * @param locked Whether this user may not change it.
   * @param change The guidelines with it switched.
   * @returns The switch.
   */
  #toggle(name: string, label: string, on: boolean, locked: boolean, change: (on: boolean) => (g: MediaGuidelines) => MediaGuidelines): TemplateResult {
    return html`<uui-toggle
      data-switch=${name}
      label=${label}
      ?checked=${on}
      ?disabled=${locked}
      @change=${(event: Event) => this.#change(change(!!(event.target as HTMLInputElement | null)?.checked))}></uui-toggle>`;
  }

  /**
   * One kind's row in the Formats table: its name and what it should be.
   * @param kind The kind.
   * @param guidelines The guidelines.
   * @param locked Whether this user may not change it.
   * @returns The row.
   */
  #renderKind(kind: ImageKind, guidelines: MediaGuidelines, locked: boolean): TemplateResult {
    const words = this.#words;
    const value = guidelines.formats.rows[kind];
    return html`<label class="field" data-kind=${kind}>
      <span class="key ${guidelines.formats.on ? '' : 'inapplicable'}">${words(KIND_WORDS[kind])}</span>
      <uui-select
        label=${words(KIND_WORDS[kind])}
        .value=${value}
        .options=${GUIDELINE_FORMATS.map((format) => ({
          name: format === 'keep' ? words('guidelinesKeep') : FORMAT_NAMES[format],
          value: format,
          selected: format === value,
        }))}
        ?disabled=${locked || !guidelines.formats.on}
        @change=${(event: Event) => {
          const format = (event.target as HTMLSelectElement).value as GuidelineFormat;
          if (GUIDELINE_FORMATS.includes(format)) this.#change((g) => ({ ...g, formats: { ...g.formats, rows: { ...g.formats.rows, [kind]: format } } }));
        }}></uui-select>
    </label>`;
  }

  /** @returns The status line: whether the last change was stored, or that the stored ones could not be read. */
  #statusLine(): string {
    switch (this._status) {
      case 'unread':
        return this.#words('guidelinesUnread');
      case 'saving':
        return this.#words('guidelinesSaving');
      case 'saved':
        return this.#words('guidelinesSaved');
      case 'failed':
        return this.#words('guidelinesSaveFailed');
      default:
        return '';
    }
  }

  static override styles = css`
    :host {
      display: block;
    }

    .about {
      margin: 0 0 var(--uui-size-space-4);
    }

    /* Why the controls are greyed, above them, as the attribution line frames a box. */
    .read-only {
      display: flex;
      align-items: flex-start;
      gap: var(--uui-size-space-2);
      margin: 0 0 var(--uui-size-space-4);
      padding: var(--uui-size-space-3);
      border-radius: var(--uui-border-radius);
      background: var(--uui-color-background);
      font-size: var(--uui-type-small-size);
    }

    /* One guideline per row, a hairline between them: the desktop label's rhythm. */
    .row {
      padding: var(--uui-size-space-4) 0;
      border-top: 1px solid var(--uui-color-divider, var(--uui-color-border));
    }

    .hint {
      margin: var(--uui-size-space-2) 0 0;
      color: var(--uui-color-text-alt, var(--uui-color-text));
      font-size: var(--uui-type-small-size);
    }

    .fields {
      display: grid;
      gap: var(--uui-size-space-2);
      margin-top: var(--uui-size-space-3);
    }

    /* A label column that takes what the control leaves, wide enough for "PNG with transparency" in
       the box's narrowest width (414 px, measured in the real run), then the control and its unit. */
    .field {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 140px 2em;
      align-items: center;
      gap: var(--uui-size-space-3);
    }

    /* A hint that belongs to the field above it, under its control. */
    .field-hint {
      margin: 0;
    }

    .unit {
      color: var(--uui-color-text-alt, var(--uui-color-text));
      font-size: var(--uui-type-small-size);
    }

    uui-select,
    uui-input {
      width: 100%;
    }

    /* Text that belongs to a disabled control greys with it, as on the Site screen. */
    .inapplicable {
      color: var(--uui-color-disabled-contrast, var(--uui-color-text-alt));
    }

    .status {
      min-height: 1.4em;
      margin: var(--uui-size-space-2) 0 0;
      color: var(--uui-color-text-alt, var(--uui-color-text));
      font-size: var(--uui-type-small-size);
    }

    .status.bad {
      color: var(--uui-color-danger);
    }
  `;
}

export default UmbraDesktopMediaGuidelinesPanelElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-media-guidelines-panel': UmbraDesktopMediaGuidelinesPanelElement;
  }
}
