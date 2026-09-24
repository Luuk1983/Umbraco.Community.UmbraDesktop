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
