import { TIME_POLL_INTERVAL_MS, YOUTUBE_API_URL, YOUTUBE_EMBED_HOST } from './constants.js';
import { ENGINE_EVENTS } from './engine.js';
import type { PlayerEngine, PlayerLoadOptions, PlayerState } from './engine.js';

/**
 * The slice of YouTube's IFrame Player API this engine uses.
 *
 * Declared here rather than pulled from `@types/youtube` so the package carries no extra dependency
 * and so the fake in the tests has a precise, small shape to satisfy. Only the calls the engine makes
 * are listed.
 */
export interface YTPlayer {
  /** Start or resume playback. */
  playVideo(): void;
  /** Pause playback. */
  pauseVideo(): void;
  /** Jump to a position; `allowSeekAhead` lets it go past what is buffered. */
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  /** Volume from 0 to 100. */
  setVolume(volume: number): void;
  /** Volume from 0 to 100. */
  getVolume(): number;
  /** Turn sound off, keeping the volume. */
  mute(): void;
  /** Turn sound back on. */
  unMute(): void;
  /** Whether sound is off. */
  isMuted(): boolean;
  /** The position in seconds. */
  getCurrentTime(): number;
  /** The length in seconds, zero for a live stream. */
  getDuration(): number;
  /** How much of the video is loaded, from 0 to 1. */
  getVideoLoadedFraction(): number;
  /** Play faster or slower; YouTube snaps to the rates the video supports. */
  setPlaybackRate(rate: number): void;
  /** The speed, 1 being normal. */
  getPlaybackRate(): number;
  /** Load a video and start it. */
  loadVideoById(videoId: string): void;
  /** Load a video and leave it paused. */
  cueVideoById(videoId: string): void;
  /** Undocumented but long-standing: switch on a module such as `captions`. */
  loadModule(name: string): void;
  /** Undocumented but long-standing: switch a module off. */
  unloadModule(name: string): void;
  /** Remove the iframe and release the player. */
  destroy(): void;
}

/** What `new YT.Player` accepts. */
export interface YTPlayerOptions {
  /** The video to load. */
  videoId?: string;
  /** The embed host, for the privacy-enhanced domain. */
  host?: string;
  /** Player parameters, all numbers or strings. */
  playerVars?: Record<string, string | number>;
  /** Callbacks the player reports through. */
  events?: {
    /** The player can take commands. */
    onReady?: (event: unknown) => void;
    /** YouTube's state number changed. */
    onStateChange?: (event: { data: number }) => void;
    /** The player could not play the video. */
    onError?: (event: { data: number }) => void;
    /** The speed changed, from our call or YouTube's own menu. */
    onPlaybackRateChange?: (event: { data: number }) => void;
  };
}

/** The `YT` global the API script defines. */
export interface YTNamespace {
  /** Builds a player, replacing `target` with YouTube's iframe. */
  Player: new (target: HTMLElement, options: YTPlayerOptions) => YTPlayer;
}

/** Gets the `YT` namespace, loading the script if it has to. Injected so no test loads youtube.com. */
export type YouTubeApiLoader = () => Promise<YTNamespace>;

/** The window as far as the API script is concerned. */
type YTWindow = Window & { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void };

/** The in-flight or finished script load, so the script is added at most once per document. */
let apiPromise: Promise<YTNamespace> | undefined;

/**
 * Load YouTube's IFrame Player API once per document.
 *
 * The script tag is added the first time this is called, which is the first time a player window
 * opens, so a desktop that never opens umbraCoffee never contacts YouTube. If a `YT` global with a
 * `Player` is already there (another copy of the script, or a test) it is used as it is. A script
 * that fails to load rejects and forgets itself, so opening the window again tries again.
 * @returns The `YT` namespace.
 */
export const loadYouTubeApi: YouTubeApiLoader = () => {
  const win = window as YTWindow;
  if (win.YT?.Player) return Promise.resolve(win.YT);
  apiPromise ??= new Promise<YTNamespace>((resolve, reject) => {
    const previous = win.onYouTubeIframeAPIReady;
    win.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(win.YT as YTNamespace);
    };
    const script = document.createElement('script');
    script.src = YOUTUBE_API_URL;
    script.async = true;
    script.onerror = () => {
      apiPromise = undefined;
      script.remove();
      reject(new Error('YouTube player API failed to load'));
    };
    document.head.append(script);
  });
  return apiPromise;
};

/** Options for {@link YouTubeEngine}. */
export interface YouTubeEngineOptions {
  /** How the API is obtained. Defaults to {@link loadYouTubeApi}; tests pass a fake. */
  apiLoader?: YouTubeApiLoader;
  /** How often to read the time while playing, in ms. Defaults to {@link TIME_POLL_INTERVAL_MS}. */
  pollIntervalMs?: number;
}

/** YouTube's state numbers mapped to ours. `-1` unstarted and `5` cued both mean nothing is happening yet. */
const STATE_BY_NUMBER: Readonly<Record<number, PlayerState>> = {
  [-1]: 'idle',
  0: 'ended',
  1: 'playing',
  2: 'paused',
  3: 'loading',
  5: 'idle',
};

/**
 * A {@link PlayerEngine} over YouTube's IFrame Player API.
 *
 * The player is created with `controls: 0` so our own control bar is the only chrome, and with
 * `fs: 0` because fullscreen belongs to the container the bar was given, not to the frame. It is
 * served from the privacy-enhanced domain. Nothing here throws at the caller: a script that cannot
 * load, or a player that reports an error, is the `error` state.
 */
export class YouTubeEngine extends EventTarget implements PlayerEngine {
  /** Where the engine is in its life. */
  state: PlayerState = 'idle';
  /** The current position in seconds, read by the poll while playing and set by `seek`. */
  time = 0;
  /** The length in seconds; zero for a live stream. */
  duration = 0;
  /** The volume from zero to one. */
  volume = 1;
  /** Whether sound is off. */
  muted = false;
  /** The playback speed, 1 being normal. */
  playbackRate = 1;
  /** How much of the video is loaded, from zero to one, read by the poll. */
  buffered = 0;

  /** How the API is obtained. */
  readonly #apiLoader: YouTubeApiLoader;
  /** Poll period in ms. */
  readonly #pollIntervalMs: number;
  /** The live player, once created. */
  #player: YTPlayer | undefined;
  /** The host the live player was mounted into, to tell a reload from a move. */
  #host: HTMLElement | undefined;

  /**
   * Whether the player has said it is ready. A real YT.Player has no methods before that, so a
   * switch then must start a fresh player rather than call one that throws: the throw is swallowed
   * (see {@link #safely}) and the frame would stay black, which the owner saw on 2026-10-11 after a
   * simulated episode whose id is no video. A player that never gets ready never blocks a switch.
   */
  #ready = false;
  /** The element YouTube replaces with its iframe. */
  #mount: HTMLElement | undefined;
  /** The poll's timer, present only while playing. */
  #timer: ReturnType<typeof setInterval> | undefined;
  /** Bumped by `destroy` so a load that was waiting for the API knows it has been cancelled. */
  #generation = 0;

  /**
   * @param options Test seams for the API loader and the poll period.
   */
  constructor(options: YouTubeEngineOptions = {}) {
    super();
    this.#apiLoader = options.apiLoader ?? loadYouTubeApi;
    this.#pollIntervalMs = options.pollIntervalMs ?? TIME_POLL_INTERVAL_MS;
  }

  /** @inheritdoc */
  async load(host: HTMLElement, videoId: string, options: PlayerLoadOptions = {}): Promise<void> {
    const autoplay = options.autoplay === true;
    if (this.#player && this.#host === host && this.#ready) {
      this.#setState('loading');
      this.#safely(() => (autoplay ? this.#player?.loadVideoById(videoId) : this.#player?.cueVideoById(videoId)));
      return;
    }
    this.destroy();
    const generation = this.#generation;
    this.#setState('loading');
    try {
      const yt = await this.#apiLoader();
      if (generation !== this.#generation) return;
      const mount = document.createElement('div');
      host.append(mount);
      this.#host = host;
      this.#mount = mount;
      this.#player = new yt.Player(mount, {
        videoId,
        host: YOUTUBE_EMBED_HOST,
        playerVars: {
          controls: 0,
          rel: 0,
          playsinline: 1,
          modestbranding: 1,
          fs: 0,
          disablekb: 1,
          autoplay: autoplay ? 1 : 0,
          origin: location.origin,
        },
        events: {
          onReady: () => this.#onReady(),
          onStateChange: (event) => this.#onStateChange(event.data),
          onError: () => this.#setState('error'),
          onPlaybackRateChange: (event) => this.#setRate(event.data),
        },
      });
    } catch {
      if (generation === this.#generation) this.#setState('error');
    }
  }

  /** @inheritdoc */
  play(): void {
    this.#safely(() => this.#player?.playVideo());
  }

  /** @inheritdoc */
  pause(): void {
    this.#safely(() => this.#player?.pauseVideo());
  }

  /** @inheritdoc */
  seek(seconds: number): void {
    if (!this.#player) return;
    this.#safely(() => this.#player?.seekTo(seconds, true));
    this.#setTime(seconds);
  }

  /** @inheritdoc */
  setVolume(zeroToOne: number): void {
    if (!this.#player) return;
    const volume = Math.min(1, Math.max(0, zeroToOne));
    this.#safely(() => this.#player?.setVolume(Math.round(volume * 100)));
    this.volume = volume;
    this.#emit(ENGINE_EVENTS.volumeChange);
  }

  /** @inheritdoc */
  setMuted(muted: boolean): void {
    if (!this.#player) return;
    this.#safely(() => (muted ? this.#player?.mute() : this.#player?.unMute()));
    this.muted = muted;
    this.#emit(ENGINE_EVENTS.volumeChange);
  }

  /**
   * Show or hide captions through the player's captions module.
   *
   * `loadModule('captions')` is not in YouTube's documentation but has been the way to do this for
   * years; the documented alternative is `cc_load_policy` at load time, which cannot be toggled.
   * @param on Whether captions are shown.
   */
  setCaptions(on: boolean): void {
    this.#safely(() => (on ? this.#player?.loadModule('captions') : this.#player?.unloadModule('captions')));
  }

  /**
   * Ask YouTube for a speed. The rate is recorded at once, as `seek` records its position, so the
   * bar's label moves on the click rather than on YouTube's event, which follows.
   * @param rate The speed, 1 being normal.
   */
  setPlaybackRate(rate: number): void {
    if (!this.#player) return;
    this.#safely(() => this.#player?.setPlaybackRate(rate));
    this.#setRate(rate);
  }

  /** @inheritdoc */
  destroy(): void {
    this.#generation++;
    this.#stopPolling(false);
    const player = this.#player;
    const mount = this.#mount;
    this.#player = undefined;
    this.#host = undefined;
    this.#ready = false;
    this.#mount = undefined;
    this.#safely(() => player?.destroy());
    mount?.remove();
    this.time = 0;
    this.buffered = 0;
    this.duration = 0;
    this.playbackRate = 1;
    if (this.state !== 'idle') this.state = 'idle';
  }

  /**
   * The player can take commands: read what it knows so the bar starts truthful.
   */
  #onReady(): void {
    this.#ready = true;
    this.#readDuration();
    const player = this.#player;
    if (!player) return;
    this.#safely(() => {
      const volume = player.getVolume() / 100;
      const muted = player.isMuted();
      if (volume !== this.volume || muted !== this.muted) {
        this.volume = volume;
        this.muted = muted;
        this.#emit(ENGINE_EVENTS.volumeChange);
      }
      this.#setRate(player.getPlaybackRate());
    });
  }

  /**
   * Record a speed and announce it when it changed. A value that is not a positive number (a player
   * that has not answered) is ignored rather than shown as a speed.
   * @param rate The speed.
   */
  #setRate(rate: number): void {
    if (!(rate > 0) || rate === this.playbackRate) return;
    this.playbackRate = rate;
    this.#emit(ENGINE_EVENTS.rateChange, rate);
  }

  /**
   * Translate YouTube's state number and start or stop the time poll to match.
   * @param data YouTube's state number.
   */
  #onStateChange(data: number): void {
    const state = STATE_BY_NUMBER[data];
    if (!state) return;
    if (state === 'playing') {
      this.#readDuration();
      this.#startPolling();
    } else {
      this.#stopPolling();
    }
    this.#setState(state);
  }

  /** Read the duration and announce it when it moved; a live stream's length grows. */
  #readDuration(): void {
    this.#safely(() => {
      const duration = this.#player?.getDuration() ?? 0;
      if (duration !== this.duration) {
        this.duration = duration;
        this.#emit(ENGINE_EVENTS.durationChange, duration);
      }
    });
  }

  /** Start reading the time on a timer. There is no time event in the API, so this is the only way. */
  #startPolling(): void {
    if (this.#timer !== undefined) return;
    this.#timer = setInterval(() => this.#poll(), this.#pollIntervalMs);
  }

  /**
   * Stop the timer.
   * @param finalRead Read the time one last time so the bar shows where playback stopped. Off when
   * the engine is being torn down, where there is nothing left to show it to.
   */
  #stopPolling(finalRead = true): void {
    if (this.#timer === undefined) return;
    clearInterval(this.#timer);
    this.#timer = undefined;
    if (finalRead && this.#player) this.#poll();
  }

  /** One poll: read time, the loaded fraction and duration, and announce whichever moved. */
  #poll(): void {
    this.#safely(() => {
      this.#setTime(this.#player?.getCurrentTime() ?? this.time);
    });
    this.#safely(() => this.#setBuffered(this.#player?.getVideoLoadedFraction() ?? this.buffered));
    this.#readDuration();
  }

  /**
   * Record a position and announce it when it changed.
   * @param seconds The new position.
   */
  #setTime(seconds: number): void {
    if (seconds === this.time) return;
    this.time = seconds;
    this.#emit(ENGINE_EVENTS.timeUpdate, seconds);
  }

  /**
   * Record how much is loaded and announce it when it changed.
   * @param fraction What the player reports; clamped to zero to one because the stretch is drawn as a width.
   */
  #setBuffered(fraction: number): void {
    const next = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
    if (next === this.buffered) return;
    this.buffered = next;
    this.#emit(ENGINE_EVENTS.bufferedChange, next);
  }

  /**
   * Move to a state and announce it, unless it is already there.
   * @param state The new state.
   */
  #setState(state: PlayerState): void {
    if (state === this.state) return;
    this.state = state;
    this.#emit(ENGINE_EVENTS.stateChange, state);
  }

  /**
   * Fire an event on the engine.
   * @param type One of {@link ENGINE_EVENTS}.
   * @param detail The payload.
   */
  #emit(type: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  /**
   * Run a call on the YouTube player, swallowing what it throws.
   *
   * Before `onReady` the real player has no methods yet and after `destroy` it has none left, so a
   * click at the wrong moment throws a `TypeError` from inside YouTube's script. That is never worth
   * an unhandled error in someone's backoffice.
   * @param call The call to make.
   */
  #safely(call: () => void): void {
    try {
      call();
    } catch {
      // The player is not there to take the call. Nothing to do and nobody to tell.
    }
  }
}
