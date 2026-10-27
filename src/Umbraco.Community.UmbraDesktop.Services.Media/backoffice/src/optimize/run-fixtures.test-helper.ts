import type { RunDeps, OptimizeRun, OptimizeRunStore } from './run-store.js';
import type { ItemFacts } from './triage.js';
import type { MediaSaveRequest, MediaSaveResult } from '../files/media-save.js';
import type { OptimizeFileResult } from './types.js';
import type { OptimizeSettings } from './remembered.js';

/*
 * A fake media library for the run store's and the window's tests: items in a table, an opener and a
 * saver over it that record what a run did, and a save a test can hold open.
 */

/** A media item as the fake library holds it. */
export interface Stored {
  facts: ItemFacts;
  /** What its file holds: `original` until a save writes `optimized`. */
  content: string;
  updateDate: string;
  trashed?: boolean;
  fileName: string;
}

/** An image in Products, named after its key. */
export function image(unique: string, parent: string | null = 'products'): Stored {
  return {
    facts: { unique, name: unique[0].toUpperCase() + unique.slice(1), parent, isTrashed: false, mediaType: 'image', extension: 'jpg', hasUrl: true },
    content: 'original',
    updateDate: '2026-10-20T10:00:00Z',
    fileName: `${unique}.jpg`,
  };
}

/** A fake media library and run deps over it, recording what the run did. */
export function library(items: Stored[], overrides: Partial<RunDeps> = {}) {
  const byKey = new Map(items.map((item) => [item.facts.unique, item]));
  const log: string[] = [];
  const saves: MediaSaveRequest[] = [];
  const remembered: OptimizeSettings[] = [];
  /** A save held open by a test, released by calling it. */
  let hold: Promise<void> | undefined;
  let release: (() => void) | undefined;
  let sequence = 0;
  let saveResult: ((request: MediaSaveRequest) => MediaSaveResult | undefined) | undefined;
  const deps: RunDeps = {
    facts: async (uniques) => new Map(uniques.flatMap((unique) => (byKey.has(unique) ? [[unique, byKey.get(unique)!.facts] as const] : []))),
    folderTypes: async () => new Set(['folder']),
    folderName: async (unique) => (unique === 'products' ? 'Products' : unique === 'people' ? 'People' : undefined),
    folderPath: async (unique) => (unique === 'products' ? ['Shop', 'Products'] : unique === 'people' ? ['People'] : undefined),
    references: async (unique) => (unique === 'banjo' ? 3 : unique === 'bowling' ? 2 : 0),
    open: async (unique) => {
      log.push(`open ${unique}`);
      const item = byKey.get(unique);
      if (!item) return { status: 'failed' };
      return {
        status: 'opened',
        unique,
        name: item.facts.name,
        blob: new Blob([item.content], { type: 'image/jpeg' }),
        extension: 'jpg',
        updateDate: item.updateDate,
        folder: item.facts.parent,
        fileName: item.fileName,
        isTrashed: !!item.trashed,
      };
    },
    save: async (request) => {
      log.push(`save ${request.existing ?? request.copyOf}`);
      saves.push(request);
      if (hold) await hold;
      const special = saveResult?.(request);
      if (special) return special;
      const target = byKey.get(request.existing ?? '');
      if (target) {
        if (request.expectedUpdateDate && request.expectedUpdateDate !== target.updateDate) return { ok: false, conflict: true };
        target.content = 'optimized';
        target.updateDate = `2026-10-20T11:00:0${++sequence}Z`;
        return { ok: true, unique: target.facts.unique, updateDate: target.updateDate };
      }
      return { ok: true, unique: `copy-${++sequence}`, copied: 'full' };
    },
    optimize: async (file, options): Promise<OptimizeFileResult> => {
      const before = { width: 6000, height: 4000, size: 8_000_000, format: 'jpeg' };
      if (options.animated === 'skip' && file.name.startsWith('spinner')) return { status: 'skipped', reason: 'animated' };
      if ((await file.text()) === 'optimized') return { status: 'unchanged', reason: 'fits', before };
      const out = new File(['small'], file.name.replace(/\.jpg$/, '.webp'), { type: 'image/webp' });
      return { status: 'optimized', file: out, before, after: { width: 2560, height: 1707, size: 400_000, format: 'webp' } };
    },
    words: {
      copyName: (name) => `${name} (optimized)`,
      titled: (name, count) => `Optimize images: ${name} (${count})`,
      mixed: (count) => `Optimize images (${count} images)`,
      uploadTitled: (name, count) => `Optimize and upload: ${name} (${count})`,
      uploadFailed: 'The upload did not go through',
      rootName: 'Media',
      conflict: 'Someone else saved this image after you started.',
      gone: 'No longer in the media library',
      unreadable: 'Could not be read',
      refused: 'Not saved',
      skipped: (reason) => `skipped: ${reason}`,
      unchanged: (reason) => `unchanged: ${reason}`,
    },
    newId: () => `run-${++sequence}`,
    remember: (settings) => void remembered.push(settings),
    remembered: () => undefined,
    ...overrides,
  };
  return {
    deps,
    log,
    saves,
    remembered,
    byKey,
    /** Hold every save open until {@link releaseSaves}. */
    holdSaves: () => (hold = new Promise((resolve) => (release = resolve))),
    /** Let held saves finish. */
    releaseSaves: () => {
      hold = undefined;
      release?.();
    },
    /** Answer saves specially. */
    answerSaves: (answer: (request: MediaSaveRequest) => MediaSaveResult | undefined) => (saveResult = answer),
  };
}

/** A run's state once the store has done what it can without being told more. */
export async function settled(store: OptimizeRunStore, id: string, phase?: OptimizeRun['phase']): Promise<OptimizeRun> {
  for (let i = 0; i < 200; i++) {
    const run = store.get(id);
    if (run && run.phase !== 'preparing' && (!phase || run.phase === phase)) return run;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`run ${id} never settled (${store.get(id)?.phase})`);
}

/** Wait until a condition holds. */
export async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((resolve) => setTimeout(resolve, 1));
  if (!check()) throw new Error('never happened');
}

