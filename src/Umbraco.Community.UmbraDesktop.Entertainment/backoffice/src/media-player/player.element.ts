import './control-bar.element.js';
import {
  AUTOPLAY_VISIBLE_RATIO,
  MEDIA_FRAME_MAX_HEIGHT_PROPERTY,
  MEDIA_MIN_HEIGHT_PX,
  MEDIA_MIN_WIDTH_PX,
  PLAYER_ASPECT_RATIO,
} from './constants.js';
import type { PlayerEngine } from './engine.js';
import { YouTubeEngine } from './youtube-engine.js';
import { css, customElement, html, nothing, property, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import type { PropertyValues, TemplateResult } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/** Localisation area this package's dictionaries live under. */
const AREA = 'umbraDesktopEntertainment';

/**
 * The shared media player, `<umbradesktop-media-player>`: a video frame with the control bar under it.
 *
 * The frame is where the engine mounts its player (YouTube's iframe). It is 16:9 and never smaller
 * than 200 by 200, which YouTube's embedding rules ask for. A host may cap its height through the
 * `--umbradesktop-media-frame-max-height` custom property, for a window that is short for its width:
 * the frame keeps its width and YouTube letterboxes the picture inside it, so the bar and whatever
 * the host draws under the player stay in view. Nothing of ours is ever drawn over it:
 * the control bar is a sibling underneath, so YouTube's own title and logo stay visible and there is
 * no overlay for a theme to get wrong.
 *
 * The engine defaults to a {@link YouTubeEngine}, created when the element connects so the YouTube
 * script is fetched only when a window that shows a player opens. A consumer, or a test, may pass its
 * own through `engine`, and that one is never replaced. Either way the engine is destroyed when the
 * element leaves the document, and loads again if it is put back.
 *
 * Autoplay is only honoured while the player is at least half visible, again YouTube's rule: when
 * `autoplay` is set the load waits for the first visibility report, then loads with or without
 * autoplay according to what it says.
 */
@customElement('umbradesktop-media-player')
export class PlayerElement extends UmbLitElement {
  /** The YouTube video id to load. Changing it loads the new video into the same player. */
  @property({ attribute: 'video-id' })
  videoId = '';

  /** Start playing as soon as the video is ready, provided the player is at least half visible. */
  @property({ type: Boolean })
  autoplay = false;

  /** The engine that plays the video. Defaults to a new {@link YouTubeEngine} when connected. */
  @property({ attribute: false })
  engine?: PlayerEngine;

  /**
   * The theme id the desktop stamps on an app's element (`docs/developer/desktop-apps.md`), or whoever hosts the
   * player copies onto it. Declared so Lit observes the attribute, and passed on to the bar in
   * {@link render}: the bar styles its five themes with `:host([data-umbradesktop-theme=…])`, and an
   * attribute on this element does not reach into the shadow root that holds the bar.
   */
  @property({ attribute: 'data-umbradesktop-theme' })
  theme?: string;

  /** True when the engine was made here, so it is also dropped here rather than kept for a reconnect. */
  #ownsEngine = false;

  /** The visibility observer waiting for the first report before an autoplay load, if any. */
  #observer: IntersectionObserver | undefined;

  /** Make a default engine if none was given, before the first render so the bar gets it. */
  protected override willUpdate(_changed: PropertyValues<this>): void {
    if (!this.engine && this.isConnected) {
      this.engine = new YouTubeEngine();
      this.#ownsEngine = true;
    }
  }

  /** The frame now exists, so the first load can happen. */
  protected override firstUpdated(): void {
    void this.#begin();
  }

  /**
   * Load a different video when the id changes after the first load.
   * @param changed What changed since the last update.
   */
  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('videoId') && changed.get('videoId') !== undefined && this.hasUpdated) void this.#begin();
  }

  /** Load again when put back after being removed; the first connection is handled by `firstUpdated`. */
  override connectedCallback(): void {
    super.connectedCallback();
    if (this.hasUpdated) {
      this.requestUpdate();
      void this.updateComplete.then(() => this.#begin());
    }
  }

  /** Let the engine go: stop playback, drop the iframe and the timers, and stop watching visibility. */
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#observer?.disconnect();
    this.#observer = undefined;
    this.engine?.destroy();
    if (this.#ownsEngine) {
      this.engine = undefined;
      this.#ownsEngine = false;
    }
  }

  /**
   * Start a load, waiting for visibility first when autoplay was asked for.
   *
   * Without `IntersectionObserver` (which every supported browser has, but a locked-down one may
   * not) the request is honoured as it stands rather than never playing.
   */
  async #begin(): Promise<void> {
    const host = this.shadowRoot?.querySelector<HTMLElement>('.host');
    const engine = this.engine;
    if (!host || !engine || !this.videoId) return;
    this.#observer?.disconnect();
    this.#observer = undefined;
    if (this.autoplay && typeof IntersectionObserver !== 'undefined') {
      const observer = new IntersectionObserver(
        (entries) => {
          observer.disconnect();
          if (this.#observer === observer) this.#observer = undefined;
          const ratio = entries[entries.length - 1]?.intersectionRatio ?? 0;
          void engine.load(host, this.videoId, { autoplay: ratio >= AUTOPLAY_VISIBLE_RATIO });
        },
        { threshold: AUTOPLAY_VISIBLE_RATIO },
      );
      this.#observer = observer;
      observer.observe(this);
      return;
    }
    await engine.load(host, this.videoId, { autoplay: this.autoplay });
  }

  /**
   * The frame, then the bar. The bar is given the element itself to fullscreen so it comes along.
   * @returns The template.
   */
  override render(): TemplateResult {
    return html`<div
        class="frame"
        role="group"
        aria-label=${this.localize.termOrDefault(`${AREA}_mediaPlayerFrame`, 'Video')}
      >
        <div class="host"></div>
      </div>
      <umbradesktop-control-bar
        data-umbradesktop-theme=${this.theme ?? nothing}
        .engine=${this.engine}
        .videoId=${this.videoId}
        .container=${this}
      >
      </umbradesktop-control-bar>`;
  }

  /**
   * The frame's shape and its fullscreen layout. Colours are the video's own, so nothing here is
   * themed; the bar carries the theme. The cap is a custom property with no default, so a host that
   * sets nothing gets the plain 16:9 frame; a cap below the 200px floor loses to the floor, since
   * `min-height` wins over `max-height`.
   */
  static override styles = css`
    :host {
      display: block;
    }

    .frame {
      position: relative;
      aspect-ratio: ${unsafeCSS(PLAYER_ASPECT_RATIO)};
      min-width: ${unsafeCSS(MEDIA_MIN_WIDTH_PX)}px;
      min-height: ${unsafeCSS(MEDIA_MIN_HEIGHT_PX)}px;
      max-height: var(${unsafeCSS(MEDIA_FRAME_MAX_HEIGHT_PROPERTY)}, none);
      /* An explicit width, not the block's automatic one: with an automatic width the ratio carries a
         capped height back into the width, and the frame shrank to 16:9 again instead of keeping the
         player's width (measured 2026-10-01). */
      width: 100%;
      box-sizing: border-box;
      background: #000;
      overflow: hidden;
    }

    .host {
      position: absolute;
      inset: 0;
    }

    .host iframe {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
    }

    :host(:fullscreen) {
      display: flex;
      flex-direction: column;
      background: #000;
    }

    :host(:fullscreen) .frame {
      flex: 1;
      aspect-ratio: auto;
      min-height: 0;
      max-height: none;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-media-player': PlayerElement;
  }
}
