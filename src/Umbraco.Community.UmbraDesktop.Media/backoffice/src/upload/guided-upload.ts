import type { UmbFileDropzoneDroppedItems } from '@umbraco-cms/backoffice/dropzone';
import { anyOn } from '../guidelines/guidelines.js';
import type { MediaGuidelines } from '../guidelines/guidelines.js';
import type { CheckedFile } from '../guidelines/check.js';

/**
 * An upload into a Media Manager folder, checked against the site's media guidelines on its way
 * (#179, design §4). What follows them uploads at once, the way it always did and with no question:
 * the owner was firm that the everyday path must not grow new choices. What does not waits on the
 * warning inside the window it was dropped on, which uploads it as it is, hands the ticked files to
 * Optimize images, or, closed, uploads none of it.
 *
 * Only the files at the top of a drop are checked. A dropped folder goes as it is, with what passes:
 * its files land in a folder core creates as it uploads them, which does not exist yet for the
 * optimizer to upload into (design §4.3).
 */

/** What the warning is asked about. */
export interface SheetRequest {
  /** The files that break a guideline, in the order dropped. */
  listed: CheckedFile[];
  /** How many files passed and are uploading already. */
  passing: number;
  /** The guidelines they were checked against, for the warning's line of guidelines. */
  guidelines: MediaGuidelines;
  /** The largest upload Umbraco takes, in bytes, or 0 when it sets none. */
  uploadLimit: number;
  /** Whether Optimize images is there to hand files to. */
  canOptimize: boolean;
}

/** How the warning was answered. */
export type SheetAnswer =
  /** Upload as they are. */
  | { kind: 'as-is' }
  /** Optimize the ticked ones; the rest upload as they are. */
  | { kind: 'optimize'; ticked: CheckedFile[] }
  /** Closed: none of them is uploaded. */
  | { kind: 'none' };

/** What a guided upload asks of the window it runs in. */
export interface GuidedUploadDeps {
  /** The site's guidelines, read afresh, or the defaults when they cannot be read. */
  guidelines(): Promise<MediaGuidelines>;
  /** The largest upload Umbraco takes, in bytes, or 0 when it sets none or it cannot be read. */
  uploadLimit(): Promise<number>;
  /**
   * Check files against the guidelines and the upload limit.
   * @param files The files.
   * @param guidelines The guidelines.
   * @param uploadLimit The upload limit, in bytes, or 0.
   */
  check(files: File[], guidelines: MediaGuidelines, uploadLimit: number): Promise<CheckedFile[]>;
  /**
   * Upload files and folders the way this window uploads them, with no check.
   * @param items What to upload.
   */
  upload(items: UmbFileDropzoneDroppedItems): Promise<void>;
  /**
   * Show the warning in the window, and wait for its answer.
   * @param request What it is about.
   */
  ask(request: SheetRequest): Promise<SheetAnswer>;
  /**
   * Hand files to Optimize images, to be optimized and then uploaded into the folder.
   * @param files The files, checked.
   * @param guidelines The guidelines the optimizer opens set from.
   */
  optimize(files: CheckedFile[], guidelines: MediaGuidelines): Promise<void>;
  /**
   * Say in the window that files were not uploaded, after the warning was closed.
   * @param count How many.
   */
  heldBack(count: number): void;
  /** Whether Optimize images is there. */
  canOptimize(): boolean;
}

/**
 * Upload files and folders, checking the files first.
 * @param items What was dropped or pasted.
 * @param deps What the window does.
 */
export async function guidedUpload(items: UmbFileDropzoneDroppedItems, deps: GuidedUploadDeps): Promise<void> {
  if (!items.files.length) return deps.upload(items);
  const [guidelines, uploadLimit] = await Promise.all([deps.guidelines(), deps.uploadLimit().catch(() => 0)]);
  if (!anyOn(guidelines) && !uploadLimit) return deps.upload(items);
  let checked: CheckedFile[];
  try {
    checked = await deps.check([...items.files], guidelines, uploadLimit);
  } catch {
    return deps.upload(items);
  }
  const listed = checked.filter((each) => each.breaks.length);
  if (!listed.length) return deps.upload(items);

  const passing = checked.filter((each) => !each.breaks.length).map((each) => each.file);
  // Not awaited: the warning opens while what passes is on its way.
  const first = passing.length || items.folders.length ? deps.upload({ files: passing, folders: items.folders }) : Promise.resolve();
  const answer = await deps.ask({ listed, passing: passing.length, guidelines, uploadLimit, canOptimize: deps.canOptimize() });
  if (answer.kind === 'none') {
    deps.heldBack(listed.length);
  } else if (answer.kind === 'as-is') {
    await deps.upload({ files: listed.map((each) => each.file), folders: [] });
  } else {
    const ticked = new Set(answer.ticked);
    const unticked = listed.filter((each) => !ticked.has(each)).map((each) => each.file);
    if (unticked.length) await deps.upload({ files: unticked, folders: [] });
    if (ticked.size) await deps.optimize(listed.filter((each) => ticked.has(each)), guidelines);
  }
  await first;
}
