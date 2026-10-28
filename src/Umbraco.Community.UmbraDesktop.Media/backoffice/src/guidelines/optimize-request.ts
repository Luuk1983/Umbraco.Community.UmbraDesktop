import { IMAGE_KINDS } from './guidelines.js';
import type { GuidelineFormat, ImageKind, MediaGuidelines } from './guidelines.js';
import type { CheckedFile } from './check.js';
import type { OptimizeFilesRequest, OptimizeUploadResult } from '../shared/optimize-service.js';

/**
 * The request the Media Manager hands Optimize images for the files ticked in the warning (#179):
 * each file with its kind and the only fixes it gets, which are what it breaks, and the optimizer's
 * starting settings from the guidelines. The person can change those for the batch in its window.
 * @param files The ticked files, checked.
 * @param guidelines The guidelines they were checked against.
 * @param destination Where they go.
 * @param note The line under the optimizer's heading.
 * @param upload Upload one file into the folder.
 * @returns The request.
 */
export function optimizeRequest(
  files: readonly CheckedFile[],
  guidelines: MediaGuidelines,
  destination: OptimizeFilesRequest['destination'],
  note: string | undefined,
  upload: (file: File) => Promise<OptimizeUploadResult>,
): OptimizeFilesRequest {
  const side = guidelines.maxSize.longestSide;
  const formats = Object.fromEntries(IMAGE_KINDS.map((kind) => [kind, guidelines.formats.on ? guidelines.formats.rows[kind] : 'keep'])) as Record<ImageKind, GuidelineFormat>;
  return {
    files: files.map((each) => ({ file: each.file, ...(each.kind ? { kind: each.kind } : {}), fix: [...each.breaks] })),
    settings: {
      // Both sides the same: a box the longest side fits in, whichever way round the picture is.
      resize: guidelines.maxSize.on ? { maxWidth: side, maxHeight: side } : null,
      formats,
      quality: guidelines.formats.quality,
      removeLocation: guidelines.location.on,
    },
    destination,
    ...(note ? { note } : {}),
    upload,
  };
}
