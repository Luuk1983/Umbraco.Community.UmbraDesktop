/**
 * The longest display name a player can type, in the profile and in the one-time question.
 *
 * Mirrors the server's `ScoreRules.MaxDisplayNameLength` (`Scores/ScoreRules.cs`, D6), which cuts a
 * longer name down when it saves it. Stopping the typing at the same length means the player never
 * saves a name and sees a different, shortened one on the boards. Change both together.
 */
export const ARCADE_NAME_MAX_LENGTH = 32;
