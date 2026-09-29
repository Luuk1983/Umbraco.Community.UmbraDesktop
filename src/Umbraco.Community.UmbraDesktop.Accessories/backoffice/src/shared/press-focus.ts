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
 * Each app adds this to its host in `connectedCallback`. The same function added twice is one
 * listener, so reconnecting needs no matching removal. Left alone:
 *
 * - anything that is not in a button, so a select still opens and a field still takes the caret;
 * - a draggable button, such as a Sticky Notes handle, because a cancelled mousedown never starts
 *   an HTML drag.
 * @param event The mousedown, heard on the app's host after it left the shadow root.
 */
export function keepFocusOnPress(event: MouseEvent): void {
  const target = event.composedPath()[0];
  if (!(target instanceof Element)) return;
  const button = target.closest('button');
  if (button && !button.draggable) event.preventDefault();
}
