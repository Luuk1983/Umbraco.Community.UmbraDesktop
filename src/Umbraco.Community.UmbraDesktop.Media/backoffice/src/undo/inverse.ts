import type { UmbraDesktopMediaApi, UmbraDesktopMediaRef } from '../operations/media-api.js';
import type { UmbraDesktopOperationResult } from '../operations/engine.js';

/**
 * What undoes what (design §10, plan task 8.1): a move is moved back, a copy's copies go to the
 * recycle bin, a rename is renamed back, a trash is restored. An upload is not undone, and neither is
 * a restore. Before an undo, every item is checked to still be as the operation left it; if anyone has
 * changed one since, nothing is undone.
 */

/** One step in the undo history: what an operation did, as far as undoing it needs. */
export type UmbraDesktopUndoStep =
  /** Items moved: each as it was before, and the folder it went to. */
  | { kind: 'move'; items: Array<{ item: UmbraDesktopMediaRef; to: string | null }> }
  /** Copies made: each new top item, named after its original. */
  | { kind: 'copy'; copies: UmbraDesktopMediaRef[] }
  /** An item renamed: as it was before, and the name it was given. */
  | { kind: 'rename'; item: UmbraDesktopMediaRef; to: string }
  /** Items trashed: each as it was before, in its folder. */
  | { kind: 'trash'; items: UmbraDesktopMediaRef[] };

/** One operation that undoes (part of) a step. */
export type UmbraDesktopUndoAction =
  | { kind: 'move'; items: UmbraDesktopMediaRef[]; target: string | null }
  | { kind: 'trash'; items: UmbraDesktopMediaRef[] }
  | { kind: 'rename'; item: UmbraDesktopMediaRef; name: string }
  | { kind: 'restore'; items: UmbraDesktopMediaRef[]; target: string | null };

/**
 * The step to record for an operation.
 * @param kind What it did.
 * @param target The folder it went into, null for the root, undefined for the recycle bin.
 * @param result How it ended.
 * @param extra For a rename, the name it gave.
 * @returns The step, or undefined when nothing worked or it is not undone (a restore).
 */
export function stepFrom(
  kind: 'move' | 'copy' | 'trash' | 'restore' | 'rename',
  target: string | null | undefined,
  result: UmbraDesktopOperationResult,
  extra: { name?: string } = {},
): UmbraDesktopUndoStep | undefined {
  const worked = result.succeeded;
  if (!worked.length) return undefined;
  switch (kind) {
    case 'move':
      return { kind, items: worked.map((each) => ({ item: each.item, to: target ?? null })) };
    case 'copy': {
      const copies = worked.flatMap((each) => (each.created?.[0] ? [{ ...each.item, unique: each.created[0], parent: target ?? null }] : []));
      return copies.length ? { kind, copies } : undefined;
    }
    case 'rename':
      return extra.name === undefined ? undefined : { kind, item: worked[0].item, to: extra.name };
    case 'trash':
      return { kind, items: worked.map((each) => each.item) };
    default:
      return undefined;
  }
}

/**
 * Group items by the folder they were in, keeping their order.
 * @param items The items.
 * @returns One list per folder.
 */
function byFolder(items: ReadonlyArray<UmbraDesktopMediaRef>): Array<[string | null, UmbraDesktopMediaRef[]]> {
  const groups = new Map<string | null, UmbraDesktopMediaRef[]>();
  for (const item of items) groups.set(item.parent, [...(groups.get(item.parent) ?? []), item]);
  return [...groups];
}

/**
 * What undoes a step.
 * @param step The step.
 * @returns The operations to run, in order.
 */
export function undoOf(step: UmbraDesktopUndoStep): UmbraDesktopUndoAction[] {
  switch (step.kind) {
    case 'move':
      // Grouped by the folder each came from, and moved as it is now, in the folder it went to, so
      // the move is not refused as one into the folder it is already in.
      return byFolder(step.items.map((each) => each.item)).map(([target, items]) => ({
        kind: 'move',
        items: items.map((item) => ({ ...item, parent: step.items.find((each) => each.item === item)!.to })),
        target,
      }));
    case 'copy':
      return [{ kind: 'trash', items: step.copies }];
    case 'rename':
      return [{ kind: 'rename', item: { ...step.item, name: step.to }, name: step.item.name }];
    case 'trash':
      return byFolder(step.items).map(([target, items]) => ({ kind: 'restore', items, target }));
  }
}

/**
 * The first item someone has changed since the step: moved again, renamed again, its copy gone, or
 * taken out of the recycle bin.
 * @param step The step.
 * @param api The server.
 * @returns That item's name, or undefined when every item is as the step left it.
 */
export async function changedSince(step: UmbraDesktopUndoStep, api: UmbraDesktopMediaApi): Promise<string | undefined> {
  const now = async (unique: string) => (await api.item(unique)).data as (UmbraDesktopMediaRef & { isTrashed?: boolean }) | undefined;
  switch (step.kind) {
    case 'move':
      for (const { item, to } of step.items) {
        const current = await now(item.unique);
        if (!current || current.isTrashed || current.parent !== to) return item.name;
      }
      return undefined;
    case 'copy':
      for (const copy of step.copies) {
        const current = await now(copy.unique);
        if (!current || current.isTrashed) return copy.name;
      }
      return undefined;
    case 'rename': {
      const current = await now(step.item.unique);
      return !current || current.isTrashed || current.name !== step.to ? step.to : undefined;
    }
    case 'trash':
      for (const item of step.items) {
        const current = await now(item.unique);
        if (!current?.isTrashed) return item.name;
      }
      return undefined;
  }
}
