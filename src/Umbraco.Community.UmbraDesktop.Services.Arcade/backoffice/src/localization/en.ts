/**
 * English (en) strings for the `umbraDesktopArcade` area.
 *
 * This package's own dictionary: the Games launcher group's heading, and later everything the hub,
 * the boards and the profile say.
 *
 * The elements pass each key to `localize.termOrDefault` with the same English as its fallback, so a
 * backoffice where this dictionary failed to load renders words rather than raw tokens. The
 * duplication is deliberate: the dictionary wins when it is there, and these are the strings the
 * Dutch file translates.
 */
export default {
  umbraDesktopArcade: {
    // The launcher group the Arcade's catalogue defines.
    groupGames: 'Games',
    // The one-time privacy question (design D7).
    privacyHeadline: 'Show your scores on the Arcade?',
    privacyText:
      'Your best scores can appear on the Arcade leaderboards for everyone who uses the desktop. You can change this later in the Arcade.',
    displayName: 'Display name',
    keepPrivate: 'Keep them private',
    showThem: 'Show them',
    // Toasts the Arcade context raises (design D4, D10). {0}, {1}, {2} are filled in by the dictionary.
    newBest: 'New best on {0}: {1}',
    newBestRanked: 'New best on {0}: {1}, number {2}',
    beaten: '{0} took first place on {1} from you ({2}). Open the Arcade to see the board.',
    // The hub (design §7).
    hub: 'Arcade',
    needsDesktop: 'The Arcade only works on the desktop.',
    play: 'Play',
    profile: 'Profile',
    boardEmpty: 'Nobody has played this yet.',
    boardUnavailable: 'The board could not be loaded.',
    private: 'Private: only you see this',
    // Moderation, shown to administrators only.
    remove: 'Remove',
    removeScoreHeadline: 'Remove this score?',
    resetName: 'Reset name',
    resetBoard: 'Reset board',
    reset: 'Reset',
    resetBoardHeadline: 'Reset this board?',
    resetBoardText: 'Every score on it is removed. This cannot be undone.',
    resetNameHeadline: 'Reset this name?',
    resetNameText: 'The player goes back to their Umbraco name: {0}',
    actionFailed: 'That did not work. Try again.',
    retry: 'Retry',
    colRank: 'Rank',
    colPlayer: 'Player',
    colScore: 'Score',
    colDate: 'Date',
    colActions: 'Actions',
    // The Profile tab.
    save: 'Save',
    privacy: 'Privacy',
    showScores: 'Show my scores on the leaderboards',
    notifyBeaten: 'Tell me when somebody takes first place from me',
    yourData: 'Your scores',
    deleteMyScores: 'Delete my scores',
    deleteHeadline: 'Delete your scores?',
    deleteText: 'Your scores and Arcade settings are removed from every board. This cannot be undone.',
    saveFailed: 'Your changes could not be saved.',
    deleteFailed: 'Your scores could not be deleted.',
    delete: 'Delete',
  },
};
