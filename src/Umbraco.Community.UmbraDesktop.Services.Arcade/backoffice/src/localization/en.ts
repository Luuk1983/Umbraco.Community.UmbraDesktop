/**
 * English (en) strings for the `umbraDesktopArcade` area.
 *
 * This package's own dictionary: the Games launcher group's heading, and everything the hub, the
 * pieces (the result card and the leaderboard) and the toasts say.
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
    // The hub (design P11, P12).
    hub: 'Arcade',
    needsDesktop: 'The Arcade only works on the desktop.',
    play: 'Play',
    allGames: 'All games',
    yourProfile: 'Your profile',
    standLead: 'Boards you lead',
    standTopThree: 'More in your top three',
    standColleagues: 'Colleagues playing',
    notPlayed: 'Not played yet',
    next: 'Next: {0}',
    boardEmpty: 'Nobody has played this yet.',
    boardUnavailable: 'The board could not be loaded.',
    overviewUnavailable: 'The Arcade could not be loaded.',
    retry: 'Retry',
    // How to win, derived from each board (phrases.ts).
    ruleFastest: 'Fastest time wins',
    ruleHighest: 'Highest score wins',
    ruleLowest: 'Lowest score wins',
    ruleLongest: 'Longest time wins',
    // Ranks and numbers. `ordinalRules` is the language whose plural rules pick the ordinal below,
    // so a backoffice language without this dictionary gets English rules with the English words.
    ordinalRules: 'en',
    ordinalOne: '{0}st',
    ordinalTwo: '{0}nd',
    ordinalFew: '{0}rd',
    ordinalOther: '{0}th',
    unitSeconds: 'sec',
    unitPoints: 'points',
    players: (count: number) => (count === 1 ? '1 player' : `${count} players`),
    you: 'You',
    // The result card (design P2, P4 to P7, P10).
    outcomeWon: 'You won',
    outcomeOver: 'Game over',
    ribbonNewBest: 'New best',
    ribbonFirst: 'First place',
    standing: '{0} of {1}',
    wouldBe: 'would be {0}',
    yourBest: 'Your best {0}',
    stillLeads: 'Your best {0} still leads',
    passed: "past {0}'s {1}",
    chase: '{0} behind {1}',
    leaderboardLink: 'Leaderboard',
    playAgain: 'Play again',
    // Showing and hiding scores (P7 to P9). Never "private", "public" or "name": wording.test.ts.
    askStanding: "That's {0} of {1}.",
    ask: 'Show your scores on the Arcade leaderboard, where colleagues can see them?',
    answerShow: 'Yes, show my scores',
    answerHide: 'No, only I see them',
    hiddenLine: 'Your scores are hidden from the leaderboard.',
    showThemLink: 'Show them',
    onlyYou: 'Only you see this',
    // The fallback question, for a game that shows no card (P3).
    fallbackHeadline: 'Show your scores on the Arcade leaderboard?',
    fallbackText:
      "The Arcade keeps everyone's best scores in the desktop's games and ranks them on leaderboards. Show yours there, where colleagues can see them? You can change this in the Arcade at any time.",
    // The panel (P2, P10).
    leaderboard: 'Leaderboard',
    openInArcade: 'Open in the Arcade',
    close: 'Close',
    // Toasts (P13).
    newBest: 'New best on {0}: {1}',
    newBestRanked: 'New best on {0}: {1}, number {2}',
    beatenHeadline: '{0} took first place from you on {1}',
    beatenScore: '{0} beats your {1}.',
    beatenRank: 'You are {0} now.',
    beatenWith: 'With {0}.',
    beatenOpen: 'Select to open the leaderboard.',
    beatenOpenLink: 'Open the leaderboard',
    // The profile (P11).
    leaderboardName: 'Your name on the leaderboards',
    leaderboardNameHelp: 'What colleagues see next to your scores. It starts as your Umbraco name.',
    save: 'Save',
    showScores: 'Show my scores on the leaderboards',
    showScoresHelp: "Off: colleagues don't see them; you still see your own rank.",
    notifyBeaten: 'Tell me when someone takes first place from me',
    notifyBeatenHelp: 'Shown the next time you open the desktop.',
    deleteMyScores: 'Delete my scores',
    deleteHelp: 'Removes every score and your name from the Arcade. This cannot be undone.',
    deleteHeadline: 'Delete your scores?',
    deleteText: 'Your scores and Arcade settings are removed from every board. This cannot be undone.',
    delete: 'Delete',
    saveFailed: 'Your changes could not be saved.',
    deleteFailed: 'Your scores could not be deleted.',
    // Moderation, for users with the Users section (D11).
    moreActions: 'More actions for {0}',
    removeScore: 'Remove score',
    removeScoreHeadline: 'Remove this score?',
    remove: 'Remove',
    resetName: 'Reset name',
    resetNameHeadline: 'Reset this name?',
    resetNameText: 'The player goes back to their Umbraco name: {0}',
    resetBoard: 'Reset this board',
    resetBoardHeadline: 'Reset this board?',
    resetBoardText: 'Every score on it is removed. This cannot be undone.',
    reset: 'Reset',
    actionFailed: 'That did not work. Try again.',
  },
};
