/**
 * What the Transfers window shows (design §7, plan task 7.5), worked out from a transfer's state and
 * nothing else: its title, the bar, the line under it, the rows of a finished one, and when the window
 * opens and closes. Pure, so every rule here is tested without a window. Words come back as dictionary
 * keys with their arguments; the window puts them into the person's language.
 */

/** What a transfer does. */
export type UmbraDesktopTransferKind = 'move' | 'copy' | 'trash' | 'restore' | 'rename' | 'upload' | 'replace';

/** Where one item of a transfer is. */
export type UmbraDesktopTransferRowStatus = 'waiting' | 'running' | 'done' | 'failed' | 'cancelled';

/** One item of a transfer. */
export interface UmbraDesktopTransferRow {
  /** Its key, unique in the transfer. */
  key: string;
  /** Its name. */
  name: string;
  /** Where it is going, when that is not the transfer's own target: the folders of an upload. */
  path?: string;
  /** Where it is. */
  status: UmbraDesktopTransferRowStatus;
  /** How far it has gone, from 0 to 1, when that is known. */
  progress?: number;
  /** Umbraco's reason, when it failed. */
  reason?: string;
  /** Its size in bytes, for an upload's file. */
  bytes?: number;
  /** Whether it is a folder. */
  folder?: boolean;
}

/** A transfer: an operation, or a batch of uploads. */
export interface UmbraDesktopTransfer {
  /** Its id. */
  id: string;
  /** What it does. */
  kind: UmbraDesktopTransferKind;
  /** The folder it goes into, null for the root, undefined for the recycle bin. */
  target: string | null | undefined;
  /** That folder's name, once read. */
  targetName?: string;
  /** When it started, in milliseconds. */
  startedAt: number;
  /** Running, paused, cancelled or finished. */
  state: 'running' | 'paused' | 'cancelled' | 'finished';
  /** Whether it can be paused: an operation can, an upload cannot, since core cannot. */
  canPause: boolean;
  /** Its items. */
  rows: UmbraDesktopTransferRow[];
  /** How much was done at moments while it ran, in its own unit (items, or bytes for an upload). */
  samples: Array<{ at: number; done: number }>;
}

/** A word to show: a dictionary key and its arguments. */
export interface UmbraDesktopTransferWords {
  /** The key. */
  key: string;
  /** Its arguments. */
  args: Array<string | number>;
}

/**
 * How long an operation runs before the window opens for it: time, not a count, because fifty small
 * icons are quick and one big video is not. The OS copy windows wait about as long.
 */
export const OPEN_AFTER_MS = 2000;

/** How far back the rate is read, so time left follows the speed now rather than the average. */
const RATE_WINDOW_MS = 10_000;

/** The words for each kind, running and finished. */
const VERBS: Readonly<Record<UmbraDesktopTransferKind, [string, string]>> = {
  move: ['Moving', 'Moved'],
  copy: ['Copying', 'Copied'],
  trash: ['Trashing', 'Trashed'],
  restore: ['Restoring', 'Restored'],
  rename: ['Renaming', 'Renamed'],
  upload: ['Uploading', 'Uploaded'],
  replace: ['Replacing', 'Replaced'],
};

/**
 * Whether the window should open for a transfer now.
 * @param transfer The transfer.
 * @param now The time now.
 * @returns True for one still running, or paused, two seconds after it started.
 */
export function opensNow(transfer: UmbraDesktopTransfer, now: number): boolean {
  return (transfer.state === 'running' || transfer.state === 'paused') && now - transfer.startedAt >= OPEN_AFTER_MS;
}

/**
 * The rows that are the items themselves: not the folders an upload creates on the way.
 * @param transfer The transfer.
 * @returns The rows.
 */
function itemRows(transfer: UmbraDesktopTransfer): UmbraDesktopTransferRow[] {
  return transfer.kind === 'upload' ? transfer.rows.filter((each) => !each.folder) : transfer.rows;
}

/**
 * A transfer's title: what it does, to what, and where.
 * @param transfer The transfer.
 * @returns The words.
 */
export function titleOf(transfer: UmbraDesktopTransfer): UmbraDesktopTransferWords {
  const [running, finished] = VERBS[transfer.kind];
  const verb = transfer.state === 'running' || transfer.state === 'paused' ? running : finished;
  const where = transfer.targetName ?? '';
  // An upload of one folder is named after the folder, as the OS names a copy of one.
  const topFolders = transfer.kind === 'upload' ? transfer.rows.filter((each) => each.folder && !each.path) : [];
  const items = transfer.kind === 'upload' && topFolders.length === 1 ? topFolders : itemRows(transfer);
  if (items.length === 1) return { key: `umbraDesktopMedia_transfer${verb}One`, args: [items[0].name, where] };
  return { key: `umbraDesktopMedia_transfer${verb}`, args: [items.length, where] };
}

/**
 * How much of an upload's bytes have gone, and how many there are.
 * @param transfer The upload.
 * @returns Done and total, in bytes.
 */
function bytesOf(transfer: UmbraDesktopTransfer): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const each of itemRows(transfer)) {
    const size = each.bytes ?? 0;
    total += size;
    done += each.status === 'done' ? size : each.status === 'running' ? size * (each.progress ?? 0) : 0;
  }
  return { done, total };
}

/**
 * How far the transfer has gone, for its bar.
 * @param transfer The transfer.
 * @returns From 0 to 1: by size for an upload whose sizes are known, by count otherwise.
 */
export function overallOf(transfer: UmbraDesktopTransfer): number {
  if (transfer.kind === 'upload') {
    const { done, total } = bytesOf(transfer);
    if (total > 0) return done / total;
  }
  const rows = itemRows(transfer);
  if (!rows.length) return 0;
  return rows.filter((each) => each.status === 'done' || each.status === 'failed').length / rows.length;
}

/**
 * How long is left, from the rate over the last ten seconds.
 * @param transfer The transfer, with its samples.
 * @param now The time now.
 * @returns Seconds, rounded up, or undefined while the rate is not known.
 */
export function timeLeftOf(transfer: UmbraDesktopTransfer, now: number): number | undefined {
  const recent = transfer.samples.filter((each) => now - each.at <= RATE_WINDOW_MS);
  if (recent.length < 2) return undefined;
  const first = recent[0];
  const last = recent[recent.length - 1];
  const rate = (last.done - first.done) / Math.max(1, last.at - first.at);
  if (rate <= 0) return undefined;
  const remaining =
    transfer.kind === 'upload' && bytesOf(transfer).total > 0
      ? bytesOf(transfer).total - bytesOf(transfer).done
      : itemRows(transfer).filter((each) => each.status === 'waiting' || each.status === 'running').length;
  return Math.ceil(remaining / rate / 1000);
}

/**
 * The line under a transfer's bar: counts, an upload's size, and time left or Paused; once it is over,
 * what worked and what failed.
 * @param transfer The transfer.
 * @param now The time now.
 * @returns The words, in order.
 */
export function metaOf(transfer: UmbraDesktopTransfer, now: number): UmbraDesktopTransferWords[] {
  const rows = itemRows(transfer);
  if (transfer.state === 'finished' || transfer.state === 'cancelled') {
    // Over: what worked, and what did not, as the OS copy windows end.
    const failed = rows.filter((each) => each.status === 'failed').length;
    const worked: UmbraDesktopTransferWords = { key: 'umbraDesktopMedia_transferWorkedOf', args: [rows.filter((each) => each.status === 'done').length, rows.length] };
    return failed ? [worked, { key: 'umbraDesktopMedia_transferFailedCount', args: [failed] }] : [worked];
  }
  const finished = rows.filter((each) => each.status === 'done' || each.status === 'failed').length;
  const words: UmbraDesktopTransferWords[] = [
    { key: transfer.kind === 'upload' ? 'umbraDesktopMedia_transferCountFiles' : 'umbraDesktopMedia_transferCount', args: [finished, rows.length] },
  ];
  if (transfer.kind === 'upload') {
    const { done, total } = bytesOf(transfer);
    if (total > 0) words.push({ key: 'umbraDesktopMedia_transferSize', args: [formatBytes(done), formatBytes(total)] });
  }
  if (transfer.state === 'paused') words.push({ key: 'umbraDesktopMedia_transferPaused', args: [] });
  else if (transfer.state === 'running') {
    const left = timeLeftOf(transfer, now);
    if (left !== undefined) words.push(left >= 90 ? { key: 'umbraDesktopMedia_transferLeftMinutes', args: [Math.round(left / 60)] } : { key: 'umbraDesktopMedia_transferLeftSeconds', args: [left] });
  }
  return words;
}

/**
 * The rows of a transfer as the window lists them: every row while it runs; once it has finished,
 * folded to what failed or was cancelled, with one row counting what worked.
 * @param transfer The transfer.
 * @returns The rows.
 */
export function foldRows(transfer: UmbraDesktopTransfer): UmbraDesktopTransferRow[] {
  if (transfer.state === 'running' || transfer.state === 'paused') return transfer.rows;
  const rows = itemRows(transfer);
  const kept = rows.filter((each) => each.status === 'failed' || each.status === 'cancelled');
  const worked = rows.filter((each) => each.status === 'done').length;
  return worked ? [...kept, { key: '#worked', name: 'umbraDesktopMedia_transferWorked', status: 'done', path: String(worked) }] : kept;
}

/**
 * Whether the window closes itself: every transfer finished and everything in them worked. A failure,
 * or a transfer someone cancelled, keeps it open until they close it.
 * @param transfers The transfers.
 * @returns True when it closes.
 */
export function closesItself(transfers: ReadonlyArray<UmbraDesktopTransfer>): boolean {
  return transfers.length > 0 && transfers.every((each) => each.state === 'finished' && itemRows(each).every((row) => row.status === 'done'));
}

/**
 * A size, as a file manager writes it: bytes, then KB, MB and GB, one decimal below ten.
 * @param bytes The size.
 * @returns The text.
 */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const shown = unit === 0 || value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${shown} ${units[unit]}`;
}
