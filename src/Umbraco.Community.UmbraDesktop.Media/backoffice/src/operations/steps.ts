import type { UmbraDesktopOperationStep, UmbraDesktopStepResult } from './engine.js';
import type { UmbraDesktopMediaApi, UmbraDesktopMediaRef, UmbraDesktopMediaValue } from './media-api.js';

/**
 * The steps of each operation the manager runs (plan task 4.4): move, copy, trash, restore and rename,
 * and Replace file's one step (#176), one step per item, each saying which folders it changes so the windows on them reload.
 */

/**
 * Move items into a folder, through core's own move.
 * @param api The server.
 * @param items The items.
 * @param target The folder's key, null for the root.
 * @returns The steps.
 */
export function moveSteps(api: UmbraDesktopMediaApi, items: ReadonlyArray<UmbraDesktopMediaRef>, target: string | null): UmbraDesktopOperationStep[] {
  return items.map((item) => ({
    item,
    affects: [item.parent, target],
    run: () => api.move(item.unique, target),
  }));
}

/**
 * Move items to the recycle bin.
 * @param api The server.
 * @param items The items.
 * @returns The steps.
 */
export function trashSteps(api: UmbraDesktopMediaApi, items: ReadonlyArray<UmbraDesktopMediaRef>): UmbraDesktopOperationStep[] {
  return items.map((item) => ({ item, affects: [item.parent], run: () => api.trash(item.unique) }));
}

/**
 * Restore items from the recycle bin into a folder.
 * @param api The server.
 * @param items The items.
 * @param target The folder's key, null for the root.
 * @returns The steps.
 */
export function restoreSteps(api: UmbraDesktopMediaApi, items: ReadonlyArray<UmbraDesktopMediaRef>, target: string | null): UmbraDesktopOperationStep[] {
  return items.map((item) => ({ item, affects: [target], run: () => api.restore(item.unique, target) }));
}

/**
 * Give an item a new name, keeping everything else as the server has it.
 * @param api The server.
 * @param item The item.
 * @param name The new name.
 * @returns The step.
 */
export function renameStep(api: UmbraDesktopMediaApi, item: UmbraDesktopMediaRef, name: string): UmbraDesktopOperationStep {
  return {
    item,
    affects: [item.parent],
    run: async () => {
      const { data, error } = await api.detail(item.unique);
      if (!data) return { error: error ?? 'Not found' };
      return api.update(item.unique, { values: data.values, variants: data.variants.map((variant) => ({ ...variant, name })) });
    },
  };
}

/**
 * Copy items into a folder: each a new item, made from the original's file with its values copied over,
 * since Umbraco has no copy for media (design §5). A folder is copied with what is in it, and so is any
 * other item that holds items (#158).
 * @param api The server.
 * @param items The items.
 * @param target The folder's key, null for the root.
 * @returns The steps.
 */
export function copySteps(api: UmbraDesktopMediaApi, items: ReadonlyArray<UmbraDesktopMediaRef>, target: string | null): UmbraDesktopOperationStep[] {
  return items.map((item) => ({ item, affects: [target], run: () => copyItem(api, item, target) }));
}

/** The editor whose values the server works out for itself from the file, so a copy leaves them out. */
const DERIVED_EDITOR = 'Umbraco.Label';

/**
 * Whether a value holds a file: an image cropper's or upload field's value, with the file's address.
 * @param value The value.
 * @returns True for a file.
 */
function holdsFile(value: unknown): value is { src: string } & Record<string, unknown> {
  return !!value && typeof value === 'object' && typeof (value as { src?: unknown }).src === 'string' && !!(value as { src: string }).src;
}

/**
 * The values of a copy: each file downloaded and uploaded again as a temporary file for the new item,
 * the values the server derives from the file left out, the rest as they are.
 * @param api The server.
 * @param values The original's values.
 * @returns The copy's values, or Umbraco's reason when a file could not be read or sent.
 */
async function copiedValues(api: UmbraDesktopMediaApi, values: ReadonlyArray<UmbraDesktopMediaValue>): Promise<{ values?: UmbraDesktopMediaValue[]; error?: string }> {
  const copied: UmbraDesktopMediaValue[] = [];
  for (const value of values) {
    if (value.editorAlias === DERIVED_EDITOR) continue;
    if (!holdsFile(value.value)) {
      copied.push(value);
      continue;
    }
    const { src, ...rest } = value.value;
    const file = await api.download(src);
    if (!file.data) return { error: file.error };
    const name = decodeURIComponent(src.split('?')[0].split('/').pop() || 'file');
    const temporary = await api.upload(file.data, name);
    if (!temporary.data) return { error: temporary.error };
    copied.push({ ...value, value: { ...rest, temporaryFileId: temporary.data } });
  }
  return { values: copied };
}

/**
 * Copy one item, and what is in it when it is a folder or holds items as one.
 * @param api The server.
 * @param item The item.
 * @param target Where the copy goes, null for the root.
 * @returns The copy's key, or Umbraco's reason.
 */
export async function copyItem(api: UmbraDesktopMediaApi, item: UmbraDesktopMediaRef, target: string | null): Promise<UmbraDesktopStepResult> {
  const detail = await api.detail(item.unique);
  if (!detail.data) return { error: detail.error ?? 'Not found' };
  const values = await copiedValues(api, detail.data.values);
  if (!values.values) return { error: values.error };
  const unique = crypto.randomUUID();
  const name = detail.data.variants[0]?.name ?? item.name;
  const created = await api.create({ unique, parent: target, mediaType: detail.data.mediaType, name, values: values.values });
  if (created.error) return { error: created.error };
  if (!item.isFolder && !item.hasChildren) return { created: [unique] };
  const children = await api.children(item.unique);
  if (!children.data) return { created: [unique], error: children.error };
  const failed: string[] = [];
  for (const child of children.data) {
    const result = await copyItem(api, child, unique);
    if (result.error) failed.push(`${child.name}: ${result.error}`);
  }
  return failed.length ? { created: [unique], error: failed.join('; ') } : { created: [unique] };
}

/** What Replace file asks of the desktop beyond the server (#176). Injectable, so a test answers. */
export interface UmbraDesktopReplaceDeps {
  /**
   * The media types that take files with an extension, as Umbraco's own upload asks.
   * @param extension The extension, lower case, without the dot.
   * @returns Their keys.
   */
  accepts(extension: string): Promise<string[]>;
  /**
   * Save a file over an item through the media service (Services.Media's `save`).
   * @param request The service's save request, as far as Replace file fills it.
   * @returns Whether it went, and the reason when it did not.
   */
  save(request: {
    file: File;
    name: string;
    folder: string | null;
    existing: string;
    resetFocalPoint: true;
    versioned: true;
  }): Promise<{ ok: boolean; message?: string }>;
  /**
   * Umbraco's own refusal of a file it does not take, in the person's language.
   * @param extension The file's extension.
   * @returns The words.
   */
  refusal(extension: string): string;
}

/**
 * Put a new file into an item (#176, research doc §7). The item, its name and where it is used stay;
 * its focal point and crops are reset, since they point at the old picture; and the file is written
 * under its own name with a hash of its contents, so nothing cached shows the old one. A format the
 * item's media type does not take is refused before anything is uploaded, in the words Umbraco's own
 * upload uses for it.
 * @param deps The media type lookup, the media service's save and Umbraco's words.
 * @param item The item.
 * @param file The new file.
 * @returns The step.
 */
export function replaceStep(deps: UmbraDesktopReplaceDeps, item: UmbraDesktopMediaRef, file: File): UmbraDesktopOperationStep {
  return {
    item,
    affects: [item.parent],
    run: async () => {
      const dot = file.name.lastIndexOf('.');
      const extension = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : '';
      if (!extension || !(await deps.accepts(extension)).includes(item.mediaType)) return { error: deps.refusal(extension) };
      const saved = await deps.save({ file, name: item.name, folder: item.parent, existing: item.unique, resetFocalPoint: true, versioned: true });
      return saved.ok ? {} : { error: saved.message || deps.refusal(extension) };
    },
  };
}
