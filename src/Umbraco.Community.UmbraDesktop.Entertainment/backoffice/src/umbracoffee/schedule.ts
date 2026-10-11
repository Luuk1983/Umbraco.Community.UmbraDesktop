/**
 * Every decision umbraCoffee's client makes, as functions of the store's data and the clock, so
 * the rules in the designs (v2 §3.2 and §5, first design D4, D6, D7) are tested by calling them.
 *
 * Pure on purpose: the window, the cup and the reminders each ask this module rather than reading the
 * data themselves, so "is it upcoming?" has one answer on the whole desktop and no element needs a
 * fake clock to be tested for it.
 */

import {
  UMBRACOFFEE_LATE_START_GRACE_MS,
  UMBRACOFFEE_NEXT_MAX_AGE_MS,
  UMBRACOFFEE_REMINDER_LEAD_MS,
} from './constants.js';
import type { UmbraCoffeeCurrent, UmbraCoffeeData, UmbraCoffeeEpisode } from './types.js';

/** One minute in ms, for turning a time left into the minutes the countdown shows. */
const MINUTE_MS = 60_000;

/** What the window leads with. */
export type UmbraCoffeeView =
  | { kind: 'live'; episode: UmbraCoffeeCurrent }
  | { kind: 'upcoming'; episode: UmbraCoffeeCurrent; start: Date; minutesLeft: number }
  | { kind: 'latest'; episode: UmbraCoffeeEpisode }
  | { kind: 'empty' };

/** The cup's three looks. */
export type UmbraCoffeeTrayState = 'hidden' | 'upcoming' | 'live';

/** The two reminders. */
export type UmbraCoffeeReminderKind = 'soon' | 'live';

/** A reminder that should be raised now. */
export interface UmbraCoffeeDueReminder {
  /** Which of the two. */
  kind: UmbraCoffeeReminderKind;
  /** The episode it is about, for its title and for the key it is recorded under. */
  episode: UmbraCoffeeCurrent;
}

/**
 * The current episode, unless it cannot be trusted, and the rule is a missed reminder, never a wrong
 * one (first design D4). Distrusted are: data that is `offline`, which has no confirmed `current` at
 * all; a next-episode file with no `updatedAt` or one older than {@link UMBRACOFFEE_NEXT_MAX_AGE_MS},
 * which means the Action has stopped writing, since it stamps the file on every run while an episode
 * is set (design §3.2); an upcoming episode whose start is missing or unreadable, since there is
 * nothing to count down to or remind ahead of; and an upcoming episode more than
 * {@link UMBRACOFFEE_LATE_START_GRACE_MS} past its start, which is a show that was badly delayed or
 * abandoned rather than about to begin.
 * @param data The store's data, if any.
 * @param now Epoch ms.
 * @returns The trustworthy current episode, or null.
 */
function trusted(data: UmbraCoffeeData | undefined, now: number): UmbraCoffeeCurrent | null {
  if (!data || data.offline || !data.current) return null;
  if (data.currentUpdatedAt === undefined || now - data.currentUpdatedAt > UMBRACOFFEE_NEXT_MAX_AGE_MS) return null;
  const current = data.current;
  if (current.state === 'upcoming') {
    const start = Date.parse(current.scheduledStart ?? '');
    if (Number.isNaN(start) || now > start + UMBRACOFFEE_LATE_START_GRACE_MS) return null;
  }
  return current;
}

/**
 * The key a shown reminder is recorded under: one per episode per kind, which is what "each shown
 * once per episode" in D7 means.
 * @param videoId The episode.
 * @param kind Which reminder.
 * @returns The key.
 */
export function reminderKey(videoId: string, kind: UmbraCoffeeReminderKind): string {
  return `${videoId}:${kind}`;
}

/**
 * What the window leads with: the live stream, else the countdown, else the latest episode. Data too
 * old or too offline to trust still gives its episode list, which does not go out of date the way a
 * countdown does. That the data is offline is a flag the window reads itself, not a view: the notice
 * sits above whichever of these it leads with.
 * @param data The store's data, if any.
 * @param now Epoch ms.
 * @returns The view.
 */
export function viewFor(data: UmbraCoffeeData | undefined, now: number): UmbraCoffeeView {
  const current = trusted(data, now);
  if (current?.state === 'live') return { kind: 'live', episode: current };
  if (current?.state === 'upcoming') {
    // `trusted` has already refused an upcoming episode without a readable start, so this is a time.
    const start = new Date(current.scheduledStart!);
    // Rounded up, so "starts in 1 min" lasts until the start rather than reading 0 a minute early,
    // and floored at zero for the minutes between the scheduled start and YouTube saying live.
    const minutesLeft = Math.max(0, Math.ceil((start.getTime() - now) / MINUTE_MS));
    return { kind: 'upcoming', episode: current, start, minutesLeft };
  }
  const latest = data?.episodes[0];
  return latest ? { kind: 'latest', episode: latest } : { kind: 'empty' };
}

/**
 * The cup's look (design D6): only while something is upcoming or live.
 * @param data The store's data, if any.
 * @param now Epoch ms, which decides whether the next-episode file is still fresh enough to show a cup for.
 * @returns The state; always hidden while offline.
 */
export function trayStateFor(data: UmbraCoffeeData | undefined, now: number): UmbraCoffeeTrayState {
  return trusted(data, now)?.state ?? 'hidden';
}

/**
 * The reminders due now that have not been shown (design D7).
 *
 * "Soon" is due from ten minutes before the start and stays due until it is shown, which is what
 * makes a first sighting inside the ten minutes, or after the start but before live, still remind.
 * Once live only "live" is asked about, so a stream first seen live raises that one alone.
 * @param data The store's data, if any.
 * @param now Epoch ms.
 * @param shown Keys of reminders this browser has already shown.
 * @returns Zero or one reminder.
 */
export function dueReminders(
  data: UmbraCoffeeData | undefined,
  now: number,
  shown: ReadonlySet<string>,
): UmbraCoffeeDueReminder[] {
  const current = trusted(data, now);
  if (!current) return [];
  if (current.state === 'live') {
    return shown.has(reminderKey(current.videoId, 'live')) ? [] : [{ kind: 'live', episode: current }];
  }
  const start = Date.parse(current.scheduledStart!);
  if (start - now > UMBRACOFFEE_REMINDER_LEAD_MS) return [];
  return shown.has(reminderKey(current.videoId, 'soon')) ? [] : [{ kind: 'soon', episode: current }];
}
