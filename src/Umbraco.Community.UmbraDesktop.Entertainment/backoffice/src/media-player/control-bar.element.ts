import {
  BAR_BUTTON_SIZE_PX,
  BAR_COMPACT_WIDTH_PX,
  BAR_DIVIDER_HEIGHT_PX,
  BAR_ICON_SIZE_PX,
  BAR_KNOB_RING_PX,
  BAR_KNOB_SIZE_PX,
  BAR_PAD_BOTTOM_PX,
  BAR_PAD_TOP_PX,
  BAR_PAD_X_PX,
  BAR_PLAY_ICON_SIZE_PX,
  BAR_PLAY_SIZE_PX,
  BAR_ROW_HEIGHT_PX,
  BAR_SEEK_ABOVE_PX,
  BAR_SEEK_HEIGHT_PX,
  BAR_TRACK_HEIGHT_PX,
  BAR_TRACK_HOVER_SCALE,
  BAR_VOLUME_HEIGHT_PX,
  BAR_VOLUME_TRACK_HEIGHT_PX,
  BAR_VOLUME_WIDTH_PX,
  PLAYBACK_RATES,
  SEEK_PAGE_STEP_SECONDS,
  SEEK_STEP_SECONDS,
  SKIP_SECONDS,
  VOLUME_STEP,
  YOUTUBE_WATCH_URL,
} from './constants.js';
import { ENGINE_EVENTS } from './engine.js';
import type { PlayerEngine } from './engine.js';
import { formatClock, isLiveDuration } from './time.js';
import { css, customElement, html, nothing, property, state, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import type { PropertyValues, TemplateResult } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/** Localisation area this package's dictionaries live under. */
const AREA = 'umbraDesktopEntertainment';

/** The engine events the bar redraws on. Every one of them can change something the bar shows. */
const REDRAW_EVENTS: readonly string[] = [
  ENGINE_EVENTS.stateChange,
  ENGINE_EVENTS.timeUpdate,
  ENGINE_EVENTS.volumeChange,
  ENGINE_EVENTS.durationChange,
  ENGINE_EVENTS.rateChange,
  ENGINE_EVENTS.bufferedChange,
];

/**
 * The bar's icons, one template each.
 *
 * Inline SVG rather than Umbraco's icon registry because these have to look right in five themes
 * and follow `currentColor`; the shapes are the ones the 2026-10-01 mock draws. The play and pause
 * glyphs are solid and the rest are strokes, which the stylesheet tells apart by class. The "10" in
 * the two jump icons carries its own fill and no stroke, which beats the stroke the stylesheet
 * gives the rest of the icon.
 */
const ICONS = {
  play: html`<svg class="solid" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L9.2 4.5A.8.8 0 0 0 8 5.2z"/></svg>`,
  pause: html`<svg class="solid" viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="3.8" height="14" rx="1"/><rect x="13.7" y="5" width="3.8" height="14" rx="1"/></svg>`,
  back: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M6.5 3v3.9h3.9"/><text x="12.3" y="15.3" font-size="7.2" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none" font-family="Arial,sans-serif">10</text></svg>`,
  forward: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M17.5 3v3.9h-3.9"/><text x="11.7" y="15.3" font-size="7.2" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none" font-family="Arial,sans-serif">10</text></svg>`,
  volume: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.2L11.5 6v12l-4.3-3.5H4z"/><path d="M15 9.2a4 4 0 0 1 0 5.6M17.6 6.6a7.6 7.6 0 0 1 0 10.8"/></svg>`,
  muted: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.2L11.5 6v12l-4.3-3.5H4z"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5"/></svg>`,
  captions: html`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M10.6 10.3A2.2 2.2 0 1 0 10.6 13.7M17 10.3A2.2 2.2 0 1 0 17 13.7"/></svg>`,
  fullscreen: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3"/></svg>`,
  external: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-8.5 8.5M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/></svg>`,
  clock: html`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/></svg>`,
} as const;

/**
 * The shared media player's control bar, `<umbradesktop-control-bar>`.
 *
 * Sits under the video frame (nothing of ours is ever drawn over the video) and drives whatever
 * {@link PlayerEngine} it is given: play or pause, back and forward ten seconds, a seek slider, mute
 * and volume, the clock, captions, the playback speed, fullscreen of a container the owner names,
 * and a link to the video on YouTube. For a live stream the seek row becomes a full track at the
 * live edge and the clock a Live pill, and the two things a stream cannot do (jump ahead, change
 * speed) are disabled; the rest stays.
 *
 * It can also stand in for a player that has nothing to play yet: `disabled` draws every control
 * disabled, never removed, with `status` where the clock goes, so a window shows the same bar at the
 * same height before a stream starts as while it plays. The YouTube link stays usable, since a
 * scheduled stream already has a page there.
 *
 * It holds no playback state of its own. It listens to the engine's events, redraws from the
 * engine's properties, and sends every user action back through the engine's methods. The one
 * exception is whether captions are on, which no engine can be asked.
 *
 * Every control is a real `button`, `a` or `role="slider"` with an accessible name from the
 * `umbraDesktopEntertainment_mediaPlayer*` terms. The look follows the desktop's app tokens, with a
 * refinement block per theme that paints only: a theme may restyle a control but never resize or
 * remove it. Below {@link BAR_COMPACT_WIDTH_PX} the volume slider and the YouTube label fold away,
 * leaving the mute button and the link's icon, so the row fits a narrow window.
 */
@customElement('umbradesktop-control-bar')
export class ControlBarElement extends UmbLitElement {
  /** The engine to show and drive. Swapping it moves the bar's listeners across. */
  @property({ attribute: false })
  engine?: PlayerEngine;

  /** The video's id, for the "Watch on YouTube" link. */
  @property({ attribute: false })
  videoId = '';

  /** The element the fullscreen button fullscreens: the player, so the bar comes along. */
  @property({ attribute: false })
  container?: HTMLElement;

  /**
   * Draw every control disabled, for a player with nothing to play yet. Reflected so the
   * stylesheet and a reader of the DOM can see it.
   */
  @property({ type: Boolean, reflect: true })
  disabled = false;

  /** What the bar says where the clock goes while {@link disabled}, "Starts in 28 days" for one. */
  @property({ attribute: false })
  status = '';

  /** Whether captions are on. The engine cannot be asked, so the bar remembers what it sent. */
  @state()
  private captionsOn = false;

  /** The engine the listeners are currently on, so they can be taken off the right one. */
  #attachedTo: PlayerEngine | undefined;

  /** One bound handler for every engine event: any of them just means "draw again". */
  readonly #redraw = (): void => this.requestUpdate();

  /** Listen again if the element was moved and put back. */
  override connectedCallback(): void {
    super.connectedCallback();
    this.#attach(this.engine);
  }

  /** Let go of the engine so a removed bar is not kept alive by it. */
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#attach(undefined);
  }

  /**
   * Move the listeners when the engine property changes.
   * @param changed What changed since the last update.
   */
  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('engine') && this.isConnected) this.#attach(this.engine);
  }

  /**
   * Put the redraw listeners on an engine, taking them off the previous one.
   * @param engine The engine to listen to, or nothing to just let go.
   */
  #attach(engine: PlayerEngine | undefined): void {
    if (this.#attachedTo === engine) return;
    for (const type of REDRAW_EVENTS) {
      this.#attachedTo?.removeEventListener(type, this.#redraw);
      engine?.addEventListener(type, this.#redraw);
    }
    this.#attachedTo = engine;
  }

  /**
   * A term from this package's dictionary, with the English as the fallback.
   * @param key The key under this package's area.
   * @param fallback The English, with any arguments already in it.
   * @param args The arguments for the dictionary's `%0%`, `%1%`.
   * @returns The text.
   */
  #term(key: string, fallback: string, ...args: Array<string | number>): string {
    return this.localize.termOrDefault(`${AREA}_${key}`, fallback, ...args);
  }

  /** Play, or pause when already playing. */
  #togglePlay(): void {
    if (this.engine?.state === 'playing') this.engine.pause();
    else this.engine?.play();
  }

  /** Mute, or unmute when already muted. */
  #toggleMute(): void {
    this.engine?.setMuted(!this.engine.muted);
  }

  /** Switch captions and remember which way. */
  #toggleCaptions(): void {
    this.captionsOn = !this.captionsOn;
    this.engine?.setCaptions(this.captionsOn);
  }

  /**
   * Step to the next speed in {@link PLAYBACK_RATES}, and from the last (or from a speed the list
   * does not have, which YouTube's own menu could have set) back to the first.
   */
  #nextRate(): void {
    const engine = this.engine;
    if (!engine) return;
    const at = PLAYBACK_RATES.indexOf(engine.playbackRate);
    const next = at < 0 || at === PLAYBACK_RATES.length - 1 ? PLAYBACK_RATES[0] : PLAYBACK_RATES[at + 1];
    engine.setPlaybackRate(next);
  }

  /**
   * Jump back or forward by {@link SKIP_SECONDS}. A live stream has no length to clamp to, so it
   * only stops at zero; anything else stays inside the video.
   * @param direction -1 for back, 1 for forward.
   */
  #skip(direction: -1 | 1): void {
    const engine = this.engine;
    if (!engine) return;
    const target = engine.time + direction * SKIP_SECONDS;
    if (isLiveDuration(engine.duration)) engine.seek(Math.max(0, target));
    else this.#seekTo(target);
  }

  /**
   * Fullscreen the container, or leave fullscreen if it is already there.
   *
   * The promise `requestFullscreen` returns rejects when the browser refuses (no user gesture, or a
   * policy), which is not an error worth surfacing: nothing changes on screen, as if it were off.
   *
   * Whether the container is fullscreen is asked of the tree it lives in, not of `document`: inside
   * shadow roots (this player sits in the window's, in the desktop's, in the backoffice's) the
   * document's `fullscreenElement` is retargeted to the outermost host and is never the container,
   * so asking it made the button enter fullscreen and then never leave it.
   */
  #toggleFullscreen(): void {
    const container = this.container;
    if (!container) return;
    try {
      const tree = container.getRootNode() as Document | ShadowRoot;
      if (tree.fullscreenElement === container) void document.exitFullscreen?.()?.catch(() => undefined);
      else void container.requestFullscreen?.()?.catch(() => undefined);
    } catch {
      // Fullscreen is unavailable here; the button simply does nothing.
    }
  }

  /**
   * Seek to a position, kept inside the video.
   * @param seconds The wanted position.
   */
  #seekTo(seconds: number): void {
    const engine = this.engine;
    if (!engine) return;
    engine.seek(Math.min(Math.max(0, seconds), engine.duration));
  }

  /**
   * Keyboard handling for the seek slider: arrows step, page keys step further, Home and End jump.
   * @param event The key press.
   */
  #onSeekKey(event: KeyboardEvent): void {
    const engine = this.engine;
    if (!engine) return;
    const at = engine.time;
    const target: Record<string, number> = {
      ArrowRight: at + SEEK_STEP_SECONDS,
      ArrowUp: at + SEEK_STEP_SECONDS,
      ArrowLeft: at - SEEK_STEP_SECONDS,
      ArrowDown: at - SEEK_STEP_SECONDS,
      PageUp: at + SEEK_PAGE_STEP_SECONDS,
      PageDown: at - SEEK_PAGE_STEP_SECONDS,
      Home: 0,
      End: engine.duration,
    };
    if (!(event.key in target)) return;
    event.preventDefault();
    this.#seekTo(target[event.key]);
  }

  /**
   * Keyboard handling for the volume slider.
   * @param event The key press.
   */
  #onVolumeKey(event: KeyboardEvent): void {
    const engine = this.engine;
    if (!engine) return;
    const at = engine.volume;
    const target: Record<string, number> = {
      ArrowRight: at + VOLUME_STEP,
      ArrowUp: at + VOLUME_STEP,
      ArrowLeft: at - VOLUME_STEP,
      ArrowDown: at - VOLUME_STEP,
      Home: 0,
      End: 1,
    };
    if (!(event.key in target)) return;
    event.preventDefault();
    engine.setVolume(Math.min(1, Math.max(0, target[event.key])));
  }

  /**
   * Turn a pointer position along a slider into a fraction from zero to one.
   * @param event The pointer event.
   * @param slider The slider element the position is measured against.
   * @returns How far along the slider the pointer is.
   */
  #fraction(event: PointerEvent, slider: HTMLElement): number {
    const box = slider.getBoundingClientRect();
    return box.width > 0 ? Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) : 0;
  }

  /**
   * Start or continue a drag on a slider, applying the new fraction as it moves.
   *
   * Pointer capture keeps the drag alive when the pointer leaves the bar or crosses the video's
   * iframe, which would otherwise swallow the events.
   * @param event The pointer event.
   * @param apply What to do with the fraction the pointer is at.
   */
  #drag(event: PointerEvent, apply: (fraction: number) => void): void {
    const slider = event.currentTarget as HTMLElement;
    if (event.type === 'pointerdown') {
      if (event.button !== 0) return;
      slider.setPointerCapture?.(event.pointerId);
      slider.focus();
    } else if (!slider.hasPointerCapture?.(event.pointerId)) {
      return;
    }
    apply(this.#fraction(event, slider));
  }

  /**
   * A themed button.
   * @param className The class the stylesheet and the tests find it by.
   * @param label The accessible name, also its tooltip.
   * @param content The icon or text inside it.
   * @param onClick What it does.
   * @param options Whether it is a toggle (and on), and whether it is disabled.
   * @returns The button.
   */
  #button(
    className: string,
    label: string,
    content: TemplateResult | string,
    onClick: () => void,
    options: { pressed?: boolean; disabled?: boolean } = {},
  ): TemplateResult {
    return html`<button
      type="button"
      class=${className}
      aria-label=${label}
      title=${label}
      aria-pressed=${options.pressed === undefined ? nothing : String(options.pressed)}
      ?disabled=${options.disabled ?? false}
      @click=${onClick}
    >
      ${content}
    </button>`;
  }

  /**
   * The seek row: a slider for anything with a length, a full track at the live edge for a stream
   * (nothing to seek through, but the row keeps the bar's height), and an empty disabled slider
   * while there is nothing to play.
   * @param time The position in seconds.
   * @param duration The length in seconds.
   * @param live Whether this is a live stream.
   * @returns The row.
   */
  #seekRow(time: number, duration: number, live: boolean): TemplateResult {
    const label = this.#term('mediaPlayerSeek', 'Seek');
    if (this.disabled) {
      return html`<div class="seek" role="slider" tabindex="-1" aria-disabled="true" aria-label=${label} aria-valuemin="0" aria-valuemax="0" aria-valuenow="0">
        <span class="track"><span class="fill" style="width:0%"></span></span>
      </div>`;
    }
    if (live) {
      return html`<div class="seek is-live" aria-hidden="true">
        <span class="track"><span class="fill" style="width:100%"></span></span>
        <span class="knob" style="left:100%"></span>
      </div>`;
    }
    const percent = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;
    const loaded = Math.min(100, Math.max(0, (this.engine?.buffered ?? 0) * 100));
    return html`<div
      class="seek"
      role="slider"
      tabindex="0"
      aria-label=${label}
      aria-valuemin="0"
      aria-valuemax=${Math.floor(duration)}
      aria-valuenow=${Math.floor(time)}
      aria-valuetext=${this.#term(
        'mediaPlayerSeekValue',
        `${formatClock(time)} of ${formatClock(duration)}`,
        formatClock(time),
        formatClock(duration),
      )}
      @keydown=${this.#onSeekKey}
      @pointerdown=${(event: PointerEvent) => this.#drag(event, (fraction) => this.#seekTo(fraction * duration))}
      @pointermove=${(event: PointerEvent) => this.#drag(event, (fraction) => this.#seekTo(fraction * duration))}
    >
      <span class="track"><span class="buffer" style="width:${loaded}%"></span><span class="fill" style="width:${percent}%"></span></span>
      <span class="knob" style="left:${percent}%"></span>
    </div>`;
  }

  /**
   * The volume slider; out of the tab order and inert while the bar is disabled.
   * @param volume The volume, zero to one.
   * @param muted Whether sound is off, which empties the drawn fill without changing the value.
   * @returns The slider.
   */
  #volumeSlider(volume: number, muted: boolean): TemplateResult {
    const percent = muted ? 0 : volume * 100;
    const label = this.#term('mediaPlayerVolume', 'Volume');
    if (this.disabled) {
      return html`<div class="volume" role="slider" tabindex="-1" aria-disabled="true" aria-label=${label} aria-valuemin="0" aria-valuemax="100" aria-valuenow=${Math.round(volume * 100)}>
        <span class="track"><span class="fill" style="width:${percent}%"></span></span>
        <span class="knob" style="left:${percent}%"></span>
      </div>`;
    }
    return html`<div
      class="volume"
      role="slider"
      tabindex="0"
      aria-label=${label}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow=${Math.round(volume * 100)}
      @keydown=${this.#onVolumeKey}
      @pointerdown=${(event: PointerEvent) => this.#drag(event, (fraction) => this.engine?.setVolume(fraction))}
      @pointermove=${(event: PointerEvent) => this.#drag(event, (fraction) => this.engine?.setVolume(fraction))}
    >
      <span class="track"><span class="fill" style="width:${percent}%"></span></span>
      <span class="knob" style="left:${percent}%"></span>
    </div>`;
  }

  /**
   * What sits after the sound controls: the status line while disabled, the Live pill for a
   * stream, or the clock.
   * @param time The position in seconds.
   * @param duration The length in seconds.
   * @param live Whether this is a live stream.
   * @returns The slot's content.
   */
  #timeSlot(time: number, duration: number, live: boolean): TemplateResult {
    if (this.disabled) return html`<span class="status">${ICONS.clock}<span>${this.status}</span></span>`;
    if (live) return html`<span class="live"><i></i>${this.#term('mediaPlayerLive', 'Live')}</span>`;
    return html`<span class="time"><b>${formatClock(time)}</b> <span class="of">/ ${formatClock(duration)}</span></span>`;
  }

  /**
   * The bar: the seek row above one row of controls.
   * @returns The template.
   */
  override render(): TemplateResult {
    const engine = this.engine;
    const off = this.disabled;
    const time = engine?.time ?? 0;
    const duration = engine?.duration ?? 0;
    const live = !off && isLiveDuration(duration);
    const playing = engine?.state === 'playing';
    const muted = engine?.muted ?? false;
    const rate = engine?.playbackRate ?? 1;
    const rateText = `${rate}×`;
    const watchLabel = this.#term('mediaPlayerWatchOnYouTube', 'Watch on YouTube');
    return html`<div class="bar">
      ${this.#seekRow(time, duration, live)}
      <div class="row">
        ${this.#button('play', this.#term('mediaPlayerPlay', 'Play'), playing ? ICONS.pause : ICONS.play, () => this.#togglePlay(), {
          pressed: playing,
          disabled: off,
        })}
        ${this.#button('back', this.#term('mediaPlayerBack', `Back ${SKIP_SECONDS} seconds`, SKIP_SECONDS), ICONS.back, () => this.#skip(-1), {
          disabled: off,
        })}
        ${this.#button(
          'forward',
          this.#term('mediaPlayerForward', `Forward ${SKIP_SECONDS} seconds`, SKIP_SECONDS),
          ICONS.forward,
          () => this.#skip(1),
          { disabled: off || live },
        )}
        ${this.#button('mute', this.#term('mediaPlayerMute', 'Mute'), muted ? ICONS.muted : ICONS.volume, () => this.#toggleMute(), {
          pressed: muted,
          disabled: off,
        })}
        ${this.#volumeSlider(engine?.volume ?? 1, muted)} ${this.#timeSlot(time, duration, live)}
        <span class="grow"></span>
        ${this.#button('captions', this.#term('mediaPlayerCaptions', 'Captions'), ICONS.captions, () => this.#toggleCaptions(), {
          pressed: this.captionsOn,
          disabled: off,
        })}
        ${this.#button('speed', this.#term('mediaPlayerSpeed', `Playback speed: ${rateText}`, rateText), rateText, () => this.#nextRate(), {
          disabled: off || live,
        })}
        ${this.#button('fullscreen', this.#term('mediaPlayerFullscreen', 'Full screen'), ICONS.fullscreen, () => this.#toggleFullscreen(), {
          disabled: off,
        })}
        <span class="divider" aria-hidden="true"></span>
        <a
          class="watch"
          href=${this.videoId ? `${YOUTUBE_WATCH_URL}${encodeURIComponent(this.videoId)}` : nothing}
          aria-disabled=${this.videoId ? nothing : 'true'}
          aria-label=${watchLabel}
          title=${watchLabel}
          target="_blank"
          rel="noopener"
        >
          ${ICONS.external}<span class="label">${watchLabel}</span>
        </a>
      </div>
    </div>`;
  }

  /**
   * One stylesheet: the bar's own tokens first, then one paint-only refinement block per theme.
   *
   * The bar is part of the video, so it takes the video's dark whatever the backoffice theme is: the
   * `--_*` tokens on the host hold those colours (white icons and time, a periwinkle line) and a
   * theme only reassigns them or adds bevels, gradients and radii. Windows 98 is the exception:
   * Media Player 6.4 was grey, so it stays grey. Every size is a constant from `constants.ts`,
   * interpolated here and read by nothing else, and no refinement changes one: the bar is
   * {@link BAR_HEIGHT_PX} tall under all five. Where the 2026-10-11 mock draws a size per theme (a
   * 24px glyph under macOS, a different thumb under Windows 98) it is drawn at the shared size
   * instead. `--_live` is the bar's own token for the live red.
   *
   * The host is an inline-size container, so the compact fold is a query on the bar's own width:
   * the window it sits in does not have to tell it.
   */
  static override styles = css`
    :host {
      --_bar: #0e1018;
      --_fg: rgba(255, 255, 255, 0.92);
      --_dim: rgba(255, 255, 255, 0.6);
      --_track: rgba(255, 255, 255, 0.22);
      --_buffer: rgba(255, 255, 255, 0.35);
      --_fill: #7f8cff;
      --_knob: #fff;
      --_play-bg: #fff;
      --_play-fg: #1b264f;
      --_hover: rgba(255, 255, 255, 0.12);
      --_live: #d42054;
      display: block;
      container-type: inline-size;
      font-family: var(--umbradesktop-app-font, inherit);
      font-size: 13px;
    }

    .bar {
      display: grid;
      padding: ${unsafeCSS(BAR_PAD_TOP_PX)}px ${unsafeCSS(BAR_PAD_X_PX)}px ${unsafeCSS(BAR_PAD_BOTTOM_PX)}px;
      background: var(--_bar);
      color: var(--_fg);
    }

    .row {
      display: flex;
      align-items: center;
      gap: 4px;
      height: ${unsafeCSS(BAR_ROW_HEIGHT_PX)}px;
      min-width: 0;
    }

    .grow {
      flex: 1;
      min-width: 6px;
    }

    button,
    .watch {
      appearance: none;
      margin: 0;
      padding: 0;
      border: 0;
      font: inherit;
      color: var(--_fg);
      background: transparent;
      cursor: pointer;
    }

    button {
      display: grid;
      place-items: center;
      flex: none;
      width: ${unsafeCSS(BAR_BUTTON_SIZE_PX)}px;
      height: ${unsafeCSS(BAR_BUTTON_SIZE_PX)}px;
      border-radius: 6px;
    }

    button:hover:not(:disabled) {
      background: var(--_hover);
    }

    button:disabled {
      cursor: default;
      opacity: 0.38;
    }

    button[aria-pressed='true']:not(.play) {
      color: var(--_fill);
    }

    .play {
      width: ${unsafeCSS(BAR_PLAY_SIZE_PX)}px;
      height: ${unsafeCSS(BAR_PLAY_SIZE_PX)}px;
      margin-right: 6px;
      border-radius: 50%;
      background: var(--_play-bg);
      color: var(--_play-fg);
    }

    .play:hover:not(:disabled) {
      background: var(--_play-bg);
      filter: brightness(1.08);
    }

    .play svg {
      width: ${unsafeCSS(BAR_PLAY_ICON_SIZE_PX)}px;
      height: ${unsafeCSS(BAR_PLAY_ICON_SIZE_PX)}px;
    }

    .speed {
      width: auto;
      min-width: ${unsafeCSS(BAR_BUTTON_SIZE_PX)}px;
      padding: 0 8px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    svg {
      width: ${unsafeCSS(BAR_ICON_SIZE_PX)}px;
      height: ${unsafeCSS(BAR_ICON_SIZE_PX)}px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.75;
      stroke-linecap: round;
      stroke-linejoin: round;
      overflow: visible;
    }

    svg.solid {
      fill: currentColor;
      stroke: none;
    }

    :focus-visible {
      outline: 2px solid var(--_fill);
      outline-offset: 1px;
    }

    .seek,
    .volume {
      position: relative;
      cursor: pointer;
      touch-action: none;
    }

    /* The seek row spans the bar inside its side padding. The track sits BAR_SEEK_ABOVE_PX down in it,
       so the space above and below is breathing room and pointer target both. */
    .seek {
      height: ${unsafeCSS(BAR_SEEK_HEIGHT_PX)}px;
    }

    .seek.is-live,
    [aria-disabled='true'].seek,
    [aria-disabled='true'].volume {
      cursor: default;
    }

    [aria-disabled='true'].seek,
    [aria-disabled='true'].volume {
      opacity: 0.6;
    }

    .volume {
      flex: none;
      width: ${unsafeCSS(BAR_VOLUME_WIDTH_PX)}px;
      height: ${unsafeCSS(BAR_VOLUME_HEIGHT_PX)}px;
      margin: 0 12px 0 2px;
    }

    .track {
      position: absolute;
      left: 0;
      right: 0;
      top: ${unsafeCSS(BAR_SEEK_ABOVE_PX)}px;
      height: ${unsafeCSS(BAR_TRACK_HEIGHT_PX)}px;
      border-radius: 3px;
      background: var(--_track);
      overflow: hidden;
      transition: transform 0.12s ease;
    }

    .seek:hover:not(.is-live):not([aria-disabled='true']) .track,
    .seek:focus-visible .track {
      transform: scaleY(${unsafeCSS(BAR_TRACK_HOVER_SCALE)});
    }

    .volume .track {
      top: 50%;
      height: ${unsafeCSS(BAR_VOLUME_TRACK_HEIGHT_PX)}px;
      margin-top: -${unsafeCSS(BAR_VOLUME_TRACK_HEIGHT_PX / 2)}px;
      border-radius: 2px;
    }

    /* The loaded stretch, under the fill. Only the seek track has one. */
    .buffer {
      position: absolute;
      inset: 0 auto 0 0;
      background: var(--_buffer);
    }

    .fill {
      position: absolute;
      inset: 0 auto 0 0;
      background: var(--_fill);
    }

    .volume .fill {
      background: var(--_fg);
    }

    .is-live .fill,
    .is-live .knob {
      background: var(--_live);
    }

    .knob {
      position: absolute;
      top: ${unsafeCSS(BAR_SEEK_ABOVE_PX + BAR_TRACK_HEIGHT_PX / 2)}px;
      width: ${unsafeCSS(BAR_KNOB_SIZE_PX)}px;
      height: ${unsafeCSS(BAR_KNOB_SIZE_PX)}px;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      background: var(--_knob);
      box-shadow: 0 0 0 ${unsafeCSS(BAR_KNOB_RING_PX)}px color-mix(in srgb, var(--_fill) 35%, transparent);
      pointer-events: none;
    }

    .volume .knob {
      top: 50%;
      width: ${unsafeCSS(BAR_KNOB_SIZE_PX - 4)}px;
      height: ${unsafeCSS(BAR_KNOB_SIZE_PX - 4)}px;
      background: var(--_fg);
      box-shadow: none;
    }

    .time,
    .status,
    .live {
      flex: none;
      white-space: nowrap;
    }

    .time {
      padding: 0 3px 0 8px;
      font-size: 14px;
      font-variant-numeric: tabular-nums;
    }

    .time b {
      font-weight: 700;
    }

    .time .of {
      color: var(--_dim);
    }

    .status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      flex-shrink: 1;
      overflow: clip; /* not a scroll container: see .ep-d in episode-list */
      padding-left: 8px;
      color: var(--_dim);
    }

    .status svg {
      width: 15px;
      height: 15px;
    }

    .status span {
      overflow: clip; /* not a scroll container: see .ep-d in episode-list */
      text-overflow: ellipsis;
    }

    .live {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 22px;
      margin-left: 8px;
      padding: 0 8px 0 7px;
      border-radius: 11px;
      background: var(--_live);
      color: #fff;
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .live i {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #fff;
    }

    .divider {
      flex: none;
      width: 1px;
      height: ${unsafeCSS(BAR_DIVIDER_HEIGHT_PX)}px;
      margin: 0 6px;
      background: var(--_track);
    }

    .watch {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      flex: none;
      min-width: ${unsafeCSS(BAR_BUTTON_SIZE_PX)}px;
      height: ${unsafeCSS(BAR_BUTTON_SIZE_PX)}px;
      padding: 0 8px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 700;
      white-space: nowrap;
      text-decoration: none;
    }

    .watch:hover {
      background: var(--_hover);
    }

    .watch[aria-disabled='true'] {
      opacity: 0.5;
      pointer-events: none;
    }

    .watch svg {
      width: 18px;
      height: 18px;
    }

    /* Narrow: the slider and the label fold into the mute button and the link's icon. Folded, not
       removed: both are still a click away, and nothing is lost at a wider size. */
    @container (width < ${unsafeCSS(BAR_COMPACT_WIDTH_PX)}px) {
      .volume,
      .divider,
      .watch .label {
        display: none;
      }

      .watch {
        padding: 0;
      }
    }

    /* ---- Umbraco: the base tokens above, the video's own dark with a periwinkle line ---- */

    /* ---- Umbraco 4: a dark glass gradient, a glossy play button ---- */
    :host([data-umbradesktop-theme='umbraco4']) {
      --_bar: linear-gradient(#3b3f46, #1d2026);
      --_fill: #7cb3e0;
      --_play-bg: linear-gradient(#f9fbfd, #cfdbe6);
      --_play-fg: #1d2026;
      --_live: #b23a2d;
    }
    :host([data-umbradesktop-theme='umbraco4']) .play {
      box-shadow:
        inset 0 1px 0 #fff,
        0 1px 2px rgba(0, 0, 0, 0.5);
    }
    :host([data-umbradesktop-theme='umbraco4']) .track,
    :host([data-umbradesktop-theme='umbraco4']) .fill,
    :host([data-umbradesktop-theme='umbraco4']) .buffer {
      border-radius: 0;
    }

    /* ---- macOS: flat near-black, a white line, a bare glyph for play ---- */
    :host([data-umbradesktop-theme='macos']) {
      --_bar: #1c1c1e;
      --_fill: #fff;
      --_knob: #fff;
      --_track: rgba(255, 255, 255, 0.25);
      --_play-bg: transparent;
      --_play-fg: #fff;
      --_live: #d70015;
    }
    :host([data-umbradesktop-theme='macos']) .play:hover:not(:disabled) {
      background: var(--_hover);
      filter: none;
    }

    /* ---- Windows 11: charcoal with the system blue ---- */
    :host([data-umbradesktop-theme='win11']) {
      --_bar: #202020;
      --_fill: #4cc2ff;
      --_knob: #4cc2ff;
      --_play-bg: #4cc2ff;
      --_play-fg: #000;
      --_live: #c42b1c;
    }
    :host([data-umbradesktop-theme='win11']) button:not(.play),
    :host([data-umbradesktop-theme='win11']) .watch {
      border-radius: 4px;
    }

    /* ---- Windows 98: Media Player 6.4, which stays grey: bevels, a sunken trackbar, a blocky thumb ---- */
    :host([data-umbradesktop-theme='win98']) {
      --_bar: #c0c0c0;
      --_fg: #000;
      --_dim: #333;
      --_track: #808080;
      --_buffer: #a0a0a0;
      --_fill: #000080;
      --_knob: #c0c0c0;
      --_play-bg: #c0c0c0;
      --_play-fg: #000;
      --_hover: transparent;
      --_live: #800000;
    }
    :host([data-umbradesktop-theme='win98']) .bar {
      box-shadow: inset 0 2px #808080;
    }
    :host([data-umbradesktop-theme='win98']) button,
    :host([data-umbradesktop-theme='win98']) .watch {
      border-radius: 0;
      background: #c0c0c0;
      box-shadow:
        inset -1px -1px #000,
        inset 1px 1px #fff,
        inset -2px -2px #808080,
        inset 2px 2px #dfdfdf;
    }
    :host([data-umbradesktop-theme='win98']) button[aria-pressed='true']:not(.play) {
      color: #000;
      background: repeating-conic-gradient(#fff 0 25%, #c0c0c0 0 50%) 0 0 / 2px 2px;
      box-shadow:
        inset -1px -1px #fff,
        inset 1px 1px #000,
        inset -2px -2px #dfdfdf,
        inset 2px 2px #808080;
    }
    :host([data-umbradesktop-theme='win98']) button[aria-pressed='true'] svg {
      transform: translate(1px, 1px);
    }
    :host([data-umbradesktop-theme='win98']) button:hover:not(:disabled),
    :host([data-umbradesktop-theme='win98']) .play:hover:not(:disabled),
    :host([data-umbradesktop-theme='win98']) .watch:hover {
      background: #c0c0c0;
      filter: none;
    }
    :host([data-umbradesktop-theme='win98']) .track {
      border-radius: 0;
      box-shadow:
        inset 1px 1px #808080,
        inset -1px -1px #fff;
    }
    :host([data-umbradesktop-theme='win98']) .fill,
    :host([data-umbradesktop-theme='win98']) .buffer {
      border-radius: 0;
    }
    :host([data-umbradesktop-theme='win98']) .volume .fill {
      background: #000080;
    }
    :host([data-umbradesktop-theme='win98']) .knob,
    :host([data-umbradesktop-theme='win98']) .is-live .knob,
    :host([data-umbradesktop-theme='win98']) .volume .knob {
      border-radius: 0;
      background: #c0c0c0;
      box-shadow:
        inset -1px -1px #000,
        inset 1px 1px #fff,
        inset -2px -2px #808080,
        inset 2px 2px #dfdfdf;
    }
    :host([data-umbradesktop-theme='win98']) .time {
      box-shadow:
        inset 1px 1px #808080,
        inset -1px -1px #fff;
    }
    :host([data-umbradesktop-theme='win98']) .live {
      border-radius: 0;
    }
    :host([data-umbradesktop-theme='win98']) .divider {
      box-shadow: 1px 0 0 #fff;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    /** Registered by the `@customElement` decorator above; declared so templates type-check. */
    'umbradesktop-control-bar': ControlBarElement;
  }
}
