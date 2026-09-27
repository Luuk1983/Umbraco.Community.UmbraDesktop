/**
 * The one export of `@web/test-runner-commands` the tests use, declared here so `tsc` reads this
 * rather than the package's own types. `paths` in `tsconfig.json` points the specifier at this file.
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
