/**
 * English (en) strings for the `umbraDesktopEntertainment` area.
 *
 * This package's own dictionary: each game's name, which its manifest points at through `meta.label`, and everything the
 * games themselves say.
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
    minesweeperEasy: 'Easy',
    // Snake: the window title, then everything the game says.
    snake: 'Snake',
    snakeNewGame: 'New game',
    snakeScore: 'Score',
    snakeBest: 'Best',
    snakeBoard: 'Snake board. Use the arrow keys to steer',
    snakeStart: 'Press an arrow key to start',
    snakePaused: 'Paused. Press space to carry on',
    snakeOver: 'Game over. Press space to play again',
    snakeWon: 'You filled the board!',
    // Solitaire: the window title, then everything the game says.
    solitaire: 'Solitaire',
    solitaireNewGame: 'New game',
    solitaireSettings: 'Settings',
    solitaireScore: 'Score',
    solitaireTime: 'Time',
    solitaireMoves: 'Moves',
    solitaireTable: 'Card table',
    solitaireAutoFinish: 'Finish',
    solitaireWon: 'You won',
    solitairePlayAgain: 'Play again',
    solitaireSettingsTitle: 'Settings',
    solitaireGame: 'Game',
    solitaireDrawOne: 'Draw one',
    solitaireDrawThree: 'Draw three',
    solitaireDrawNextGame: 'A change here starts with your next game.',
    solitaireCardBack: 'Card back',
    solitaireCardFaces: 'Card faces',
    solitaireDone: 'Done',
    solitaireClose: 'Close',
    solitaireBackTheme: 'Match theme',
    solitaireBackRabbit: 'Rabbit',
    solitaireBackCodegarden: 'Codegarden',
    solitaireBackCodeCabin: 'CodeCabin',
    solitaireBackDutchUmbracoAlliance: 'Dutch Umbraco Alliance',
    solitaireFacesClassic: 'Classic',
    // A card's name for screen readers: {0} is the rank, {1} the suit.
    solitaireCardName: '{0} of {1}',
    solitaireFaceDown: 'Face-down card',
    solitaireRank1: 'Ace',
    solitaireRank11: 'Jack',
    solitaireRank12: 'Queen',
    solitaireRank13: 'King',
    solitaireSuitS: 'spades',
    solitaireSuitH: 'hearts',
    solitaireSuitD: 'diamonds',
    solitaireSuitC: 'clubs',
  },
};
