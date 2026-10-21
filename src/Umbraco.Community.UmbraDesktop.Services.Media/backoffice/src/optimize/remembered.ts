import type { RecentStorage } from '../recent/recent-media.js';
import { OPTIMIZE_DEFAULTS, normaliseOptions } from './options.js';
import type { NormalisedOptions, OptimizeFormat } from './options.js';
import type { OptimizeMediaRequest } from './types.js';

/**
 * What the settings page shows: each switch, and the values behind it even while it is off, so a
 * person who turns Resize off and on again finds their numbers where they left them. What a run is
 * started with, and what is remembered for the next one.
 */
export interface OptimizeSettings {
  /** Whether Resize is on. */
  resize: boolean;
  /** The widest an image may be, or null for no limit on that side. */
  maxWidth: number | null;
  /** The tallest an image may be, or null for no limit on that side. */
  maxHeight: number | null;
  /** Whether Convert is on. */
  convert: boolean;
  /** The format Convert writes; Keep writes each file's own. */
  format: OptimizeFormat;
  /** 1 to 100, for JPEG and WebP. */
  quality: number;
  /** Whether Remove metadata is on. Locked on while Resize or Convert is (D8). */
  removeMetadata: boolean;
  /** Replace the originals, or save copies next to them. */
  save: 'replace' | 'copy';
}

/** What a run starts on before anyone has chosen (D11): the options' defaults, replacing the originals. */
export const DEFAULT_SETTINGS: OptimizeSettings = {
  resize: true,
  maxWidth: OPTIMIZE_DEFAULTS.resize.maxWidth,
  maxHeight: OPTIMIZE_DEFAULTS.resize.maxHeight,
  convert: true,
  format: OPTIMIZE_DEFAULTS.format,
  quality: OPTIMIZE_DEFAULTS.quality,
  removeMetadata: OPTIMIZE_DEFAULTS.removeMetadata,
  save: 'replace',
};

/** The storage key prefix, before the user's key; beside the recent list's. */
const KEY_PREFIX = 'umbradesktop-media-optimize:';

/**
 * The storage key for one user's last settings, so two people sharing a browser each start on their own.
 * @param userUnique The backoffice user's key.
 * @returns The key.
 */
export function rememberedKeyFor(userUnique: string): string {
  return `${KEY_PREFIX}${userUnique}`;
}

/** The formats a remembered value may name. */
const FORMATS: readonly OptimizeFormat[] = ['keep', 'jpeg', 'png', 'webp'];

/**
 * A size limit as stored: a positive whole number, or null.
 * @param value What was stored.
 * @returns True when it is one.
 */
function isLimit(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 1);
}

/**
 * Whether a stored value is a set of settings, read defensively since storage is anyone's to write.
 * @param value What was stored.
 * @returns True for settings with every field right.
 */
function isSettings(value: unknown): value is OptimizeSettings {
  const v = value as Partial<OptimizeSettings> | null;
  return (
    !!v &&
    typeof v === 'object' &&
    typeof v.resize === 'boolean' &&
    isLimit(v.maxWidth) &&
    isLimit(v.maxHeight) &&
    typeof v.convert === 'boolean' &&
    FORMATS.includes(v.format as OptimizeFormat) &&
    typeof v.quality === 'number' &&
    v.quality >= 1 &&
    v.quality <= 100 &&
    typeof v.removeMetadata === 'boolean' &&
    (v.save === 'replace' || v.save === 'copy')
  );
}

/**
 * The last settings this person ran with, in this browser.
 * @param storage Where they are kept, or null where the browser keeps nothing.
 * @param key Their key, from {@link rememberedKeyFor}.
 * @returns The settings, or undefined when none were kept or what was kept is not settings.
 */
export function readRemembered(storage: RecentStorage | null, key: string): OptimizeSettings | undefined {
  try {
    const value = JSON.parse(storage?.getItem(key) ?? 'null');
    return isSettings(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Keep the settings a run started with, for this person's next run. Storage that is missing, blocked
 * or full keeps nothing, which costs the person their choices and nothing else.
 * @param storage Where they are kept.
 * @param key Their key.
 * @param settings The settings.
 */
export function writeRemembered(storage: RecentStorage | null, key: string, settings: OptimizeSettings): void {
  try {
    storage?.setItem(key, JSON.stringify(settings));
  } catch {
    // Nothing kept.
  }
}

/**
 * The settings a run starts on. A caller that passes options sets the whole starting state, so a
 * field it leaves out is off rather than whatever this person chose last time, and its save is
 * Replace unless it says otherwise. Without options, this person's last settings; without those, the
 * defaults. Values behind a switch that is off come from the defaults.
 * @param request What the caller asked for.
 * @param remembered This person's last settings.
 * @returns The settings.
 */
export function startingSettings(request: Pick<OptimizeMediaRequest, 'options' | 'save'>, remembered: OptimizeSettings | undefined): OptimizeSettings {
  if (!request.options) {
    const base = remembered ?? DEFAULT_SETTINGS;
    return request.save ? { ...base, save: request.save } : { ...base };
  }
  const options = normaliseOptions(request.options);
  return {
    resize: options.resize !== null,
    maxWidth: options.resize ? (options.resize.maxWidth ?? null) : DEFAULT_SETTINGS.maxWidth,
    maxHeight: options.resize ? (options.resize.maxHeight ?? null) : DEFAULT_SETTINGS.maxHeight,
    convert: options.format !== 'keep',
    format: options.format === 'keep' ? DEFAULT_SETTINGS.format : options.format,
    quality: options.quality,
    removeMetadata: options.removeMetadata,
    save: request.save ?? 'replace',
  };
}

/**
 * The options a run works from: a switch that is off asks for nothing, whatever values are behind it.
 * @param settings The settings.
 * @returns The options, with animated images skipped.
 */
export function optionsOf(settings: OptimizeSettings): NormalisedOptions {
  const resize = settings.resize ? { ...(settings.maxWidth ? { maxWidth: settings.maxWidth } : {}), ...(settings.maxHeight ? { maxHeight: settings.maxHeight } : {}) } : null;
  return normaliseOptions({
    resize,
    format: settings.convert ? settings.format : 'keep',
    quality: settings.quality,
    removeMetadata: settings.removeMetadata,
  });
}
