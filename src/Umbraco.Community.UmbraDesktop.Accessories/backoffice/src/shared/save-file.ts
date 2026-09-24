import type { AccessoriesSaveDestination, AccessoriesSaveSettings } from '../settings/save-settings.js';
import type { MediaSaver } from './media-save.js';

/** How a save went, and where to. */
export type SaveOutcome =
  | {
      ok: true;
      destination: AccessoriesSaveDestination;
      /** The media item written, when the destination was the media library. */
      mediaUnique?: string;
    }
  | {
      ok: false;
      destination: AccessoriesSaveDestination;
      /** Why, where the backoffice said. */
      message?: string;
    };

/** Everything a save needs from the element doing it. */
export interface SaveTargets {
  /** Hands a file to the person as a browser download. */
  download: (blob: Blob, name: string) => void | Promise<void>;
  /** Writes a file to the media library. */
  saveToMedia: MediaSaver;
  /** Where the media library save goes. */
  settings: AccessoriesSaveSettings;
  /** The media item this document was last saved as, to overwrite rather than duplicate. */
  existing?: string;
}

/**
 * Save a file to one destination.
 *
 * Shared by Notepad and Paint so that the two apps' Save buttons cannot come to mean different
 * things. Which destination is the caller's to say, because each app offers both: the one the
 * settings name on Save and Ctrl+S, and the other on its own button.
 *
 * A download cannot fail in a way the page can see, so it always counts as saved. A media save
 * reports what the backoffice said.
 * @param file The file, named as it should be saved.
 * @param destination Where to.
 * @param targets How to reach each destination.
 * @returns How it went.
 */
export async function saveFile(
  file: File,
  destination: AccessoriesSaveDestination,
  targets: SaveTargets,
): Promise<SaveOutcome> {
  if (destination === 'computer') {
    await targets.download(file, file.name);
    return { ok: true, destination };
  }
  try {
    const result = await targets.saveToMedia(file, targets.settings.folder?.unique ?? null, targets.existing);
    return result.ok
      ? { ok: true, destination, mediaUnique: result.unique }
      : { ok: false, destination, message: result.message };
  } catch (error) {
    return { ok: false, destination, message: error instanceof Error ? error.message : undefined };
  }
}

/** The destination that is not `destination`: what an app's second save button offers. */
export function otherDestination(destination: AccessoriesSaveDestination): AccessoriesSaveDestination {
  return destination === 'media' ? 'computer' : 'media';
}
