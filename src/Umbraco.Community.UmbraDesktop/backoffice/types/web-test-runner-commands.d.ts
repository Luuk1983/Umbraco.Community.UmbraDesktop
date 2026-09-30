/**
 * The exports of `@web/test-runner-commands` the tests use, declared here so `tsc` reads this
 * rather than the package's own types. `paths` in `tsconfig.json` points the specifier at this file,
 * so an export a test starts using has to be added here too, or `npm run build` fails on the import.
 *
 * The package's browser entry re-exports its payload types from the server-side build, and that
 * chain brings in `@types/node`. Its globals then replace the DOM's: `setTimeout` starts
 * returning `NodeJS.Timeout` instead of a number, and `app-host.element.test.ts`, which stubs the
 * timer, stops compiling. Only `tsc` sees this file. At runtime the dev server resolves the real
 * package as usual.
 */

/**
 * Run a command registered by a plugin in `web-test-runner.config.mjs`, in the test runner's Node
 * process, and wait for its result.
 * @param command The command name the plugin answers to.
 * @param payload Whatever the plugin expects, sent as JSON.
 * @returns The plugin's result.
 */
export function executeServerCommand<R = unknown, P = unknown>(command: string, payload?: P): Promise<R>;

/** A point in the test page's viewport, in CSS pixels: the same numbers as `clientX`/`clientY`. */
type MousePosition = [x: number, y: number];

/** Which mouse button a press uses. The browser's default is `left`. */
type MouseButton = 'left' | 'middle' | 'right';

/** One real mouse action: moving, a whole click, or pressing and releasing a button separately. */
type SendMousePayload =
  | { type: 'move'; position: MousePosition }
  | { type: 'click'; position: MousePosition; button?: MouseButton }
  | { type: 'down'; button?: MouseButton }
  | { type: 'up'; button?: MouseButton };

/** One real key action: typing text, pressing a key, or holding and releasing one. */
type SendKeysPayload = { type: string } | { press: string } | { down: string } | { up: string };

/**
 * Move or press the real mouse, through the browser rather than a dispatched event, so the press
 * does everything a user's does: moves focus, starts a selection, lands on whatever is on top.
 * @param payload The action, and where for a move or a click.
 * @returns Once the browser has handled it.
 */
export function sendMouse(payload: SendMousePayload): Promise<void>;

/**
 * Put the mouse back where a test page starts it, with no button held. Called after tests that
 * press the mouse, so a button left down or a hover left behind cannot reach the next test.
 * @returns Once the mouse is reset.
 */
export function resetMouse(): Promise<void>;

/**
 * Type or press real keys, delivered to whatever has focus, the way a user's keys are.
 * @param payload The text to type, or the key to press, hold or release. Keys go by their
 *   `KeyboardEvent.key` value, except the space bar, which is `Space` here and arrives as `' '`.
 * @returns Once the browser has handled it.
 */
export function sendKeys(payload: SendKeysPayload): Promise<void>;
