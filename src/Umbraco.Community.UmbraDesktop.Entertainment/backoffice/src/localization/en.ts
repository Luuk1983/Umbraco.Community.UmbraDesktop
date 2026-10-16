/**
 * English (en) strings for the `umbraDesktopEntertainment` area.
 *
 * This package's own dictionary: the Media group's heading, which this package's catalogue
 * manifest defines, each app's name, which its manifest points at through `meta.label`, and
 * everything the apps themselves say. The Games heading is the Arcade's, since its catalogue
 * defines that group.
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
    // Snake's one Arcade board, and the Best chip's tooltip once it opens the leaderboard.
    snakeClassic: 'Classic',
    snakeOpenLeaderboard: 'Open the leaderboard',
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
    // Solitaire on the Arcade: its rule line, the card's bonus line ({0} is the bonus), and the
    // settings dialog's Leaderboard section.
    solitaireRule: 'Highest score wins, time bonus included',
    solitaireBonus: 'incl. {0} time bonus',
    solitaireLeaderboard: 'Leaderboard',
    solitaireShowLeaderboard: 'Show the leaderboard',
    // umbraCoffee. The group it sits in, then its name as an app and as a tray switch, the same word
    // in both places because the switch in Desktop settings is found by the show's name.
    groupMedia: 'Media',
    umbraCoffee: 'umbraCoffee',
    umbraCoffeeTray: 'umbraCoffee',
    umbraCoffeeTrayAbout:
      'A coffee cup by the clock when umbraCoffee is about to start or live, and a reminder ten minutes before and when it goes live.',
    // The cup's tooltip and the reminder. %0% is a formatted time.
    umbraCoffeeStartsAt: 'Starts at %0%',
    // Says where the switch is, not whether it is on: packages cannot read the desktop's settings.
    // "Taskbar" and "Desktop settings" are the host's own names for them, so match those if they change.
    umbraCoffeeRemindersWhere: 'The tray cup and the reminders can be switched off under Taskbar in Desktop settings.',
    // The two reminders and their buttons.
    umbraCoffeeSoonHeadline: 'Put the kettle on, umbraCoffee starts soon',
    umbraCoffeeLiveHeadline: 'Grab a cuppa, umbraCoffee is live!',
    // The reminder toast's own words; the two headlines above are what the history lists.
    umbraCoffeeToastSoon: 'Put the kettle on',
    umbraCoffeeToastLive: 'Grab a cuppa!',
    umbraCoffeeOnAir: 'On air',
    umbraCoffeeWatchNow: 'Watch now',
    umbraCoffeeStartingNow: 'Starting now',
    umbraCoffeeClockMin: 'min',
    umbraCoffeeClockSec: 'sec',
    umbraCoffeeWatch: 'Watch',
    umbraCoffeeStopReminding: 'Stop reminding me',
    // The cup's tooltip. %0% is minutes and %1% the episode title when upcoming; %0% the title when live.
    umbraCoffeeTrayUpcoming: 'umbraCoffee in %0% min: %1%',
    umbraCoffeeTrayLive: 'umbraCoffee is live: %0%',
    // ---- umbraCoffee window (round 2, addendum 2026-10-01 (2)) ----
    // The tag on the date line under the title, and the list's first row while one is on or coming.
    umbraCoffeeLive: 'Live',
    umbraCoffeeUpcoming: 'Upcoming',
    umbraCoffeeLatest: 'Latest episode',
    // The date line. %0% is a formatted day and time.
    umbraCoffeeStartedAt: 'Started %0%',
    // The guests on the date line: "With Matt Brailsford, Umbraco HQ and Lucy Smith".
    umbraCoffeeWith: 'With',
    umbraCoffeeAnd: 'and',
    // In the control bar before a stream. %0% is a relative time from the browser, "in 28 days".
    umbraCoffeeStartsRelative: 'Starts %0%',
    // The countdown in the picture's place.
    umbraCoffeeStartsIn: 'Starts in',
    umbraCoffeeDays: 'days',
    umbraCoffeeHours: 'hours',
    umbraCoffeeMinutes: 'minutes',
    umbraCoffeeWatchLast: 'Watch the last episode',
    // The tabs while live.
    umbraCoffeeChat: 'Chat',
    umbraCoffeeEpisodes: 'Episodes',
    umbraCoffeeChatNote: 'Anyone can read. To post, sign in to YouTube in this browser and allow third-party cookies.',
    // The gear, and the dialog it opens. The switch is the tray item's switch in Desktop settings, so its
    // state is read from there, and "umbraCoffee" is that switch's name under Taskbar.
    umbraCoffeeSettings: 'Settings',
    umbraCoffeeClose: 'Close',
    umbraCoffeeDone: 'Done',
    umbraCoffeeReminders: 'Reminders',
    umbraCoffeeRemindMe: 'Remind me',
    umbraCoffeeRemindAbout:
      'A reminder ten minutes before an episode starts, and when it goes live. The same switch as umbraCoffee under Taskbar in Desktop settings.',
    umbraCoffeeRemindOffline: "Can't reach the umbraCoffee feed, so reminders are off until it is back.",
    // The warning beside the gear when the feed cannot be reached: its name, and its tooltip. %0% is a formatted date.
    umbraCoffeeFeedUnavailable: 'Feed unavailable',
    umbraCoffeeUnavailable:
      "Can't reach the umbraCoffee feed. Showing episodes up to %0%. Reminders are off until it is back.",
    umbraCoffeeUnavailableNoDate:
      "Can't reach the umbraCoffee feed. Showing the episodes that came with the package. Reminders are off until it is back.",
    // The episode list: its search field's label, read by assistive technology, its placeholder and its clear button.
    umbraCoffeeSearchLabel: 'Search episodes',
    umbraCoffeeSearchPlaceholder: 'Title, topic or guest',
    umbraCoffeeClearSearch: 'Clear search',
    // How many episodes match, shown only while searching. %0% is the number.
    umbraCoffeeMatches: '%0% episodes',
    umbraCoffeeMatchesOne: '1 episode',
    // When nothing matches, and the button that clears the search.
    umbraCoffeeNoMatches: 'No episodes match.',
    umbraCoffeeClearFilters: 'Show all episodes',
    // The row of the episode in the player, by whether it is playing.
    umbraCoffeeNowPlaying: 'Now playing',
    umbraCoffeePaused: 'Paused',
    umbraCoffeeShowMore: 'Show more',
    umbraCoffeeAllEpisodes: 'All episodes on YouTube',
    // ---- end umbraCoffee window ----
    // ---- media-player (shared player and control bar) ----
    mediaPlayerFrame: 'Video',
    mediaPlayerPlay: 'Play',
    mediaPlayerSeek: 'Seek',
    mediaPlayerLive: 'Live',
    mediaPlayerMute: 'Mute',
    mediaPlayerVolume: 'Volume',
    mediaPlayerCaptions: 'Captions',
    mediaPlayerFullscreen: 'Full screen',
    mediaPlayerWatchOnYouTube: 'Watch on YouTube',
    // The jumps, %0% being how many seconds, and the speed button, %0% being the speed as it shows, "1.5×".
    mediaPlayerBack: 'Back %0% seconds',
    mediaPlayerForward: 'Forward %0% seconds',
    mediaPlayerSpeed: 'Playback speed: %0%',
    // Spoken value of the seek slider. %0% is the position and %1% the length, as clocks.
    mediaPlayerSeekValue: '%0% of %1%',
    // ---- end media-player ----
  },
};
