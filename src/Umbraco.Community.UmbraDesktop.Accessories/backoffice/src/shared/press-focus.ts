/**
 * Keep keyboard focus where it was when the mouse presses a button in an app.
 *
 * A clicked button takes focus in Chrome, and the browser then draws its `:focus-visible` ring as
 * soon as any key is pressed, including Shift, Ctrl or the Windows key on their own. So a tab or
 * toolbar button someone had clicked wore the accent ring the next time they touched the keyboard:
 * to take a screenshot, to switch windows, to type the rest of a sum into Calculator. Nothing on
 * the desktop's own chrome does that, because none of it takes focus on a click. Cancelling the
 * mousedown's default stops the button taking focus, and nothing else: the click still fires,
 * `:active` still draws the press, and Tab still reaches every button and still shows its ring.
 *
 * A field is different, because it has to take focus: a select to open, a text field or text area
 * to take the caret. And Chrome rings a clicked field straight away, with no key pressed, so
 * choosing a screen saver left the ring round the list and clicking into Notepad's page put one
 * round the page. So a field the mouse pressed is marked with {@link PRESSED_FOCUS} until focus
 * leaves it, and the shared stylesheet draws no ring on anything marked. Reached with Tab, a field is
 * unmarked and ringed as before.
 *
 * Each app adds this to its host in `connectedCallback`. The same function added twice is one
 * listener, so reconnecting needs no matching removal. A draggable button, such as a Sticky Notes
 * handle, is left alone, because a cancelled mousedown never starts an HTML drag.
 * @param event The mousedown, heard on the app's host after it left the shadow root.
 */
export function keepFocusOnPress(event: MouseEvent): void {
  const target = event.composedPath()[0];
  if (!(target instanceof Element)) return;
  const button = target.closest('button');
  if (button && !button.draggable) event.preventDefault();
  const field = target.closest('select, input, textarea');
  if (field) {
    field.setAttribute(PRESSED_FOCUS, '');
    field.addEventListener('blur', () => field.removeAttribute(PRESSED_FOCUS), { once: true });
  }
}

/**
 * Marks a field the mouse focused, for as long as it keeps focus, so `styles.ts` can leave its ring
 * off. An attribute rather than a class, so Lit's own class bindings never overwrite it.
 */
export const PRESSED_FOCUS = 'data-pressed-focus';
