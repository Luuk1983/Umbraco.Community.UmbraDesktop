/**
 * The seam between the control bar and a media backend.
 *
 * The control bar and the player element know only this interface, so YouTube's IFrame Player API
 * today and an HTML5 `<video>` element with the Video Player app are interchangeable. Only what
 * umbraCoffee needs is here; anything a second backend cannot do is disabled by the bar, never
 * removed.
 */

/** What a player engine reports. */
export type PlayerState = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

/**
 * The names of the events an engine fires, each a `CustomEvent` on the engine itself.
 *
 * `statechange` carries the new {@link PlayerState}, `timeupdate` the position in seconds,
 * `volumechange` nothing (read `volume` and `muted`), `durationchange` the duration in seconds and
 * `ratechange` the new playback rate and `bufferedchange` the loaded fraction, zero to one. One constant so the bar, the engines and the tests cannot spell
 * them differently.
 */
export const ENGINE_EVENTS = {
  stateChange: 'statechange',
  timeUpdate: 'timeupdate',
  volumeChange: 'volumechange',
  durationChange: 'durationchange',
  rateChange: 'ratechange',
  bufferedChange: 'bufferedchange',
} as const;

/** Options for {@link PlayerEngine.load}. */
export interface PlayerLoadOptions {
  /** Start playing as soon as the video is ready. The player element decides this from visibility. */
  autoplay?: boolean;
}

/** The seam between the control bar and a media backend. YouTube now, HTML5 `<video>` with the Video Player app. */
export interface PlayerEngine extends EventTarget {
  /**
   * Mount into `host` and load a video by id. Never rejects: a failure is the `error` state.
   * @param host The element the engine may put its player inside.
   * @param videoId The id of the video to load.
   * @param options Whether to start playing.
   */
  load(host: HTMLElement, videoId: string, options?: PlayerLoadOptions): Promise<void>;
  /** Start or resume playback. */
  play(): void;
  /** Pause playback. */
  pause(): void;
  /**
   * Jump to a position.
   * @param seconds Where to go, from the start.
   */
  seek(seconds: number): void;
  /**
   * Set the volume, leaving the mute state alone.
   * @param zeroToOne The new volume, from silent to full.
   */
  setVolume(zeroToOne: number): void;
  /**
   * Mute or unmute, leaving the volume alone.
   * @param muted Whether sound is off.
   */
  setMuted(muted: boolean): void;
  /**
   * Show or hide captions.
   * @param on Whether captions are shown.
   */
  setCaptions(on: boolean): void;
  /**
   * Play faster or slower. A backend that cannot change speed keeps 1 and fires nothing; the bar
   * then shows 1x and the button does nothing, which is disabled rather than removed.
   * @param rate The speed, where 1 is normal.
   */
  setPlaybackRate(rate: number): void;
  /** Where the engine is in its life. */
  readonly state: PlayerState;
  /** The current position in seconds. */
  readonly time: number;
  /** The length in seconds. Zero or infinite for a live stream. */
  readonly duration: number;
  /** The volume, from zero to one. */
  readonly volume: number;
  /** Whether sound is off. */
  readonly muted: boolean;
  /** The playback speed, where 1 is normal. */
  readonly playbackRate: number;
  /**
   * How much of the video is loaded, from zero to one, for the stretch drawn on the seek track. A
   * backend that cannot tell leaves it at zero, which draws nothing.
   */
  readonly buffered: number;
  /** Stop, remove whatever was mounted and release timers. The engine may be loaded again afterwards. */
  destroy(): void;
}
