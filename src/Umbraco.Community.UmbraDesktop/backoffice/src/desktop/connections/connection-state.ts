/**
 * How a connection's reported status is put in front of a reader: what it is called, and how alarmed
 * to look about it.
 *
 * Pure and separate from any element, for the reason `docs/theming.md` §4 gives about numbers: this
 * mapping is read by both the Status app and the Connections settings screen, and the two saying
 * different things about the same status is exactly the bug nobody notices until a client rings up.
 */

/** How loudly a status should present itself. Matches Umbraco's own UUI tone names. */
export type UmbraDesktopConnectionTone = 'default' | 'positive' | 'warning' | 'danger';

/**
 * The statuses the server reports, and the localisation token naming each one.
 *
 * Keyed by the string the API sends rather than by a number, which is why the C# side serialises the
 * enum by name: reordering that enum would otherwise silently change what every row here says.
 */
const LABELS: Readonly<Record<string, string>> = {
  Ok: 'umbraDesktop_connectionStateOk',
  Unreachable: 'umbraDesktop_connectionStateUnreachable',
  InvalidCredentials: 'umbraDesktop_connectionStateInvalidCredentials',
  Forbidden: 'umbraDesktop_connectionStateForbidden',
  NotConfigured: 'umbraDesktop_connectionStateNotConfigured',
  Checking: 'umbraDesktop_connectionStateChecking',
};

/**
 * How alarmed each status should look.
 *
 * Only `Unreachable` is danger, and the split is the point. A site that is down is somebody's
 * emergency; credentials that were pasted with a trailing space, or an API user in the wrong group,
 * are five minutes of admin. Painting all four the same red is how the difference the server works
 * to preserve gets thrown away in the last inch.
 */
const TONES: Readonly<Record<string, UmbraDesktopConnectionTone>> = {
  Ok: 'positive',
  Unreachable: 'danger',
  InvalidCredentials: 'warning',
  Forbidden: 'warning',
  NotConfigured: 'warning',
  // Neither good news nor bad: nobody has asked yet. A warning colour here would have every row
  // flash amber on the way to being fine.
  Checking: 'default',
};

/**
 * The localisation token naming a status.
 * @param status The status as the server reported it.
 * @returns The token, or the "unknown" token for a status this version has never heard of.
 */
export function connectionStateLabel(status: string): string {
  return LABELS[status] ?? 'umbraDesktop_connectionStatusUnknown';
}

/**
 * How alarmed a status should look.
 *
 * An unrecognised status is a warning rather than positive: a connected instance may run a newer
 * package than this one, and the safe reading of a state we cannot interpret is "something to look
 * at", never "fine".
 * @param status The status as the server reported it.
 * @returns The tone.
 */
export function connectionStateTone(status: string): UmbraDesktopConnectionTone {
  return TONES[status] ?? 'warning';
}

/**
 * Whether a connection can actually be read from.
 * @param status The status as the server reported it.
 * @returns True only for a connection that is working.
 */
export function isConnectionUsable(status: string): boolean {
  return status === 'Ok';
}
