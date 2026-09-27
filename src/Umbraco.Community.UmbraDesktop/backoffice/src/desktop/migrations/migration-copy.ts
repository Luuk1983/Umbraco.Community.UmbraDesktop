import type { UmbraDesktopMigrationPhase } from './types';

/** The localization keys one state of the migration screen renders. */
export interface UmbraDesktopMigrationCopy {
  /** Key for the heading. */
  titleKey: string;

  /** Key for the paragraph under it. */
  bodyKey: string;

  /**
   * Key for the button that closes the screen, or absent when this state offers no way out.
   *
   * Absent is how "running" is expressed, rather than a separate flag: a state with nothing to press
   * cannot be left, and there is then no second place where that could be got wrong.
   */
  dismissKey?: string;
}

/**
 * What the screen says in one state.
 *
 * Keys rather than sentences, so the screen element stays a renderer and the wording stays in the
 * dictionaries where both languages can be checked against each other.
 *
 * The three states are deliberately not symmetric. **Running** cannot be dismissed, because half a
 * migration is the one moment nobody should be able to walk away from into a desktop that is about
 * to change under them. **Done** waits for the person rather than a timer, because an event nobody
 * saw finish did not visibly happen, and a timer has to guess how fast somebody reads. **Failed**
 * says what is still true — the settings are in this browser and it will try again — because a red
 * screen at sign-in otherwise reads as data loss.
 * @param phase Which state the screen is in.
 * @returns The keys that state renders.
 */
export function migrationScreenCopy(phase: UmbraDesktopMigrationPhase): UmbraDesktopMigrationCopy {
  switch (phase) {
    case 'done':
      return {
        titleKey: 'umbraDesktop_migrationDoneTitle',
        bodyKey: 'umbraDesktop_migrationDoneBody',
        dismissKey: 'umbraDesktop_migrationContinue',
      };
    case 'failed':
      return {
        titleKey: 'umbraDesktop_migrationFailedTitle',
        bodyKey: 'umbraDesktop_migrationFailedBody',
        dismissKey: 'umbraDesktop_migrationContinue',
      };
    default:
      return {
        titleKey: 'umbraDesktop_migrationTitle',
        bodyKey: 'umbraDesktop_migrationBody',
      };
  }
}
