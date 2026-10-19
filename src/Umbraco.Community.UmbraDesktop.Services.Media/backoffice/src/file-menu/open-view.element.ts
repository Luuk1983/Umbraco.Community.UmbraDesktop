import { css, customElement, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMBRADESKTOP_MEDIA_CONTEXT } from '../context/media.context-token.js';
import { wordsOf } from '../shared/words.js';
import type { WordKey } from '../shared/words.js';
import { OPEN_VIEW_TAG, PAGE_GAP, PAGE_PADDING } from './constants.js';
import { createDiscardQuestion, createItemCheck, createThumbnails } from './deps.js';
import type { FileMenuDeps } from './deps.js';
import { filePageStyles } from './styles.js';
import { OpenPage, openPageStyles } from './open-page.js';

/**
 * Open on its own: the recent images, Browse and Upload, for an app to put on its empty canvas, so
 * the first thing the person sees is what they can open (design D14). The same content as the file
 * menu's Open panel, firing the same `umbradesktop-media-file-open` and `-failed` events, so an app
 * handles an open the same way from either.
 *
 * Used by tag name, like the file menu, and defined with it. It loads the recent list when it is
 * connected, so an app renders it while nothing is open and removes it once something is.
 */
@customElement(OPEN_VIEW_TAG)
export class UmbraDesktopMediaOpenViewElement extends UmbLitElement {
  /** Whether the app holds unsaved work, which opening another file would throw away. */
  @property({ type: Boolean })
  dirty = false;

  /** The file extensions the app opens, without dots, which the recent list is filtered by. */
  @property({ attribute: false })
  accept: string[] = [];

  /** The heading over it, such as "Open an image". "Open" without one. */
  @property({ attribute: false })
  heading?: string;

  /** What it reaches outside itself with; a test sets it, and without one it builds the real ones. */
  @property({ attribute: false })
  deps?: FileMenuDeps;

  /** This package's words, with the English dictionary as their fallback. */
  protected readonly _words = wordsOf(this.localize);

  /** The real deps, built once when no test gave any. */
  #realDeps?: FileMenuDeps;

  /** Open's content, which this element only frames. */
  readonly #openPage = new OpenPage(this.#pageHost());

  /**
   * What Open reads from this element, as live getters, so it always sees the current properties.
   * @returns Open's host.
   */
  #pageHost() {
    const element = this;
    return {
      get deps() {
        return element._deps;
      },
      get accept() {
        return element.accept;
      },
      get dirty() {
        return element.dirty;
      },
      words: (key: WordKey, ...args: unknown[]) => element._words(key, ...args),
      fire: (name: string, detail?: unknown) =>
        element.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true })),
      requestUpdate: () => element.requestUpdate(),
    };
  }

  /**
   * The deps in use: a test's, or the real ones, which reach the media context lazily as the file
   * menu's do. Only what Open uses: it never saves.
   * @returns The deps.
   */
  protected get _deps(): FileMenuDeps {
    if (this.deps) return this.deps;
    if (!this.#realDeps) {
      const reach = () => this.getContext(UMBRADESKTOP_MEDIA_CONTEXT);
      const unavailable = async (): Promise<never> => {
        throw new Error('The open view does not save.');
      };
      this.#realDeps = {
        context: {
          open: async (options) => {
            const context = await reach();
            if (!context) throw new Error('The media service is not available.');
            return context.open(options);
          },
          recent: (async (accept) => ((await reach())?.recent(accept) ?? [])) as FileMenuDeps['context']['recent'],
          forgetRecent: (unique) => void reach().then((context) => context?.forgetRecent(unique)),
          save: unavailable,
          pickSaveFolder: unavailable,
          confirmOverwrite: unavailable,
        },
        thumbnails: createThumbnails(this),
        confirmDiscard: createDiscardQuestion(this),
        items: createItemCheck(this),
      };
    }
    return this.#realDeps;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    void this.#openPage.load();
  }

  override render() {
    return this.#openPage.render(this.heading ?? this._words('openHeading'));
  }

  static override styles = [
    filePageStyles,
    openPageStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: ${PAGE_GAP}px;
        padding: ${PAGE_PADDING}px;
        overflow: auto;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    [OPEN_VIEW_TAG]: UmbraDesktopMediaOpenViewElement;
  }
}
