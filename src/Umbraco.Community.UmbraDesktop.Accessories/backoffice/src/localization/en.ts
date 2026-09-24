/**
 * English (en) strings for the `umbraDesktopAccessories` area.
 *
 * This package's own dictionary, and only this package's: the `accessories` launcher group's
 * heading belongs to the host and ships there, per the group contract in `docs/desktop-apps.md` §6.
 * What lives here is each app's name, which its manifest points at through `meta.label`, and
 * everything the apps themselves say.
 *
 * The elements pass each key to `localize.termOrDefault` with the same English as its fallback, so a
 * backoffice where this dictionary failed to load renders words rather than raw tokens. The
 * duplication is deliberate: the dictionary wins when it is there, and these are the strings the
 * Dutch file translates.
 */
export default {
  umbraDesktopAccessories: {
    // The window titles, taskbar labels and launcher tile text, all from meta.label.
    notepad: 'Notepad',
    paint: 'Paint',
    calculator: 'Calculator',
    clock: 'Clock',
    // Notepad.
    notepadNew: 'New',
    notepadOpen: 'Open…',
    notepadSave: 'Save',
    notepadWordWrap: 'Word wrap',
    notepadUntitled: 'Untitled',
    notepadLine: 'Ln',
    notepadColumn: 'Col',
    notepadCharacters: 'characters',
    // Paint.
    paintPencil: 'Pencil',
    paintBrush: 'Brush',
    paintEraser: 'Eraser',
    paintFill: 'Fill',
    paintSize: 'Size',
    paintUndo: 'Undo',
    paintNew: 'New',
    paintSave: 'Save',
    paintUntitled: 'Untitled',
    paintCanvas: 'Picture',
    paintForeground: 'Foreground',
    paintBackground: 'Background',
    // Sticky Notes. The board is shared by everyone who uses the desktop.
    stickynotes: 'Sticky Notes',
    stickyNotesNew: 'New note',
    stickyNotesShared: 'Shared with everyone who uses this desktop',
    stickyNotesOffline: 'Cannot reach the board. Your notes are kept and will be saved when it is back.',
    stickyNotesEmpty: 'No notes yet. Add one and everyone who uses this desktop will see it.',
    stickyNotesNote: 'Note by %0%',
    stickyNotesUnsaved: 'Not saved yet',
    stickyNotesDelete: 'Delete note',
    stickyNotesDeleteHeadline: 'Delete this note?',
    stickyNotesDeleteQuestion: 'It is deleted for everyone who uses this desktop.',
    stickyNotesConflict: '%0% changed this note while you were editing it.',
    stickyNotesUseTheirs: 'Use theirs',
    stickyNotesKeepMine: 'Keep mine',
    stickyNotesDeletedElsewhere: 'Someone deleted this note while you were editing it.',
    stickyNotesRestore: 'Put it back',
    stickyNotesDiscard: 'Discard',
    stickyNotesColour_yellow: 'Yellow',
    stickyNotesColour_green: 'Green',
    stickyNotesColour_pink: 'Pink',
    stickyNotesColour_purple: 'Purple',
    stickyNotesColour_blue: 'Blue',
    // Opening and saving, shared by Notepad and Paint. Every file lives in the media library.
    openTitle: 'Open from the media library (Ctrl+O)',
    saveTitle: 'Save to the media library (Ctrl+S)',
    documentName: 'Name',
    savedToMedia: 'Saved to the media library.',
    saveFailed: 'Not saved. %0%',
    openFailed: '%0% could not be read.',
    notepadNotText: 'Notepad opens text files, and %0% is not one.',
    paintNotImage: 'Paint edits pictures, and %0% is not one it can edit.',
    paintTooLarge: '%0% is too large for Paint, which opens pictures up to %1% pixels across.',
    // The Accessories category of Desktop settings.
    settingsCategory: 'Accessories',
    settingsCategoryAbout: 'Where new Notepad and Paint files are saved',
    settingsSaveTo: 'Save new files to',
    settingsSaveToAbout: 'Where Notepad and Paint put a file the first time it is saved. A file opened from the media library is saved back where it is.',
    settingsMediaRoot: 'Media library root',
    settingsChooseFolder: 'Choose folder…',
    settingsUseRoot: 'Use the root',
    // Calculator. The key names are what a screen reader says for a key whose face is a symbol,
    // and they follow the Windows calculator's own wording.
    calculatorAdd: 'Plus',
    calculatorSubtract: 'Minus',
    calculatorMultiply: 'Multiply by',
    calculatorDivide: 'Divide by',
    calculatorEquals: 'Equals',
    calculatorPercent: 'Percent',
    calculatorDecimal: 'Decimal separator',
    calculatorNegate: 'Positive negative',
    calculatorBackspace: 'Backspace',
    calculatorClear: 'Clear',
    calculatorClearEntry: 'Clear entry',
    calculatorDivideByZero: 'Cannot divide by zero',
  },
};
