/**
 * English (en) strings for the `umbraDesktopEntertainment` area.
 *
 * This package's own dictionary, and deliberately only this package's: the `games` launcher group's
 * heading belongs to the host and already ships in both locales there, per the contract in
 * `docs/desktop-apps.md` §6. What lives here is the app's name, which the manifest points at
 * through `meta.label`, and everything the game itself says.
 *
 * The element passes each of these to `localize.termOrDefault` with the same English as its
 * fallback, so a backoffice where this dictionary failed to load renders words rather than raw
 * tokens. That makes the duplication deliberate rather than drift: the dictionary always wins when
 * it is there, and these are the strings the Dutch file is a translation of.
 */
export default {
  umbraDesktopEntertainment: {
    // The window title, taskbar label and launcher tile text, all from meta.label.
    minesweeper: 'Minesweeper',
    // In-game chrome.
    minesweeperNewGame: 'New game',
    minesweeperMinesLeft: 'Mines left',
    minesweeperElapsed: 'Seconds elapsed',
    minesweeperBoard: 'Minefield',
    minesweeperWon: 'Cleared.',
    minesweeperLost: 'Boom.',
    // What a cell announces to a screen reader. A count reads as its own number, so there is no
    // token for one; these are the four states a number cannot express.
    minesweeperClosed: 'closed',
    minesweeperFlagged: 'flagged',
    minesweeperMine: 'mine',
    minesweeperEmpty: 'empty',
  },
};
