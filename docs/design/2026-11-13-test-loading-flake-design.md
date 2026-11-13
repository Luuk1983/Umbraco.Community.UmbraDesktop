# Entertainment's test-loading flake: design

> Entertainment's suite sometimes lost a whole test file, nearly always the media player's
> `control-bar.element.test.ts`, with `Failed to fetch dynamically imported module`. That is not a
> bug in the package or the runner: Chrome drops every request in flight when Windows reports a
> network change, and on this Wi-Fi laptop that happens about 30 times a day. Two other tests could
> fail on a busy machine for a different reason, because their time budget covered a cold module
> load. Those two are fixed; the network one can only be recognised and rerun.

- **Status:** Built 2026-11-13, not merged
- **Date:** 2026-11-13
- **Branch:** `208-pnpm`, found while switching to pnpm (#208)

---

## 1. What was seen

- **A test file fails to load.** `control-bar.element.test.ts` fails with `TypeError: Failed to
  fetch dynamically imported module` and `Could not import your test module`, and its 38 tests do not
  run. It happened in 1 of 4 full runs under npm and 2 of 3 under pnpm on 2026-11-12, then in none of
  14 runs the next morning.
- **Solitaire's first tests time out** with `Timeout: cards drawn`, mostly when
  `solitaire.element.test.ts` runs on its own.

## 2. Cause one: Chrome aborts requests on a network change

A test file's module graph is fetched one module per request. `control-bar.element.test.ts` is the
first file that loads `@umbraco-cms/backoffice/lit-element`, and with it most of UUI, culori and rxjs:
**923 requests** on a cold server, about five seconds on a quiet machine. No other file holds that many
requests open for that long, which is why the failure nearly always lands there.

When Windows reports a network change, Chrome fails every request in flight with
`net::ERR_NETWORK_CHANGED`, including requests to `localhost`. One failed module fails the whole
graph, and the test framework's import of the test file rejects with exactly the error above.

The evidence is a run logging every failed request (a throwaway config spreading this one, with
`chromeLauncher({ createPage })` listening for `requestfailed`). On 2026-11-13 at 11:08:05 local time
a single control-bar run, on an otherwise quiet machine, logged:

```
requestfailed .../uui/dist/components/keyboard-shortcut/key.element.js :: net::ERR_NETWORK_CHANGED
```

followed by every other pending UUI module failing the same way. The Windows WLAN log shows
`Beveiliging van draadloos netwerk is gestopt` / `gestart` (wireless security stopped, started:
the adapter re-securing its connection) at 11:08:01 to 11:08:02. All three failures of the day before
match one of those events to within seconds: 14:12 to 14:13, 14:42:20 and 14:45:25.

The adapter does this about 30 times a day. CI is wired, so it never happens there, which fits no
Entertainment failure in the last 60 CI runs.

**Not fixed, on purpose.** Chrome has no setting this repository can rely on to keep requests across
a network change, the runner has no retry for a test file, and a page cannot retry a failed module
import (the browser's module map remembers the failure for the life of the page). What remains is to
recognise it, so it is in `CLAUDE.md`: a test file that fails to import with this error on a Wi-Fi
machine is rerun before anyone investigates.

## 3. Cause two: a time budget that included a cold load

Under heavy load (another suite running, thousands of files being copied) the same cold load slows
from five seconds to over two minutes, and two tests that waited on a dynamic import inside a short
budget failed. A throwaway config that delays chosen paths on the dev server made both fail on demand,
with the same errors (the red runs), and pass after the fix:

| Test | Budget | Slowed path | Fix |
| --- | --- | --- | --- |
| Solitaire's first render cases | `waitUntil`'s 1 s | the classic face set, 1.5 s | the test file imports `faces/classic/classic.js` itself |
| umbraCoffee's console "on the page as soon as..." | mocha's 5 s | the two elements, 6 s | that case's timeout is 30 s |

- **Solitaire** loads its face set with a dynamic `import()`, and the classic set pulls in the 850 KB
  `courts.generated.ts`. Importing it in the test file moves that cost into loading the file, which
  has the runner's 120 s, and the element's own `import()` then finds the module already loaded. The
  fallback to classic is still exercised: it imports the same module.
- **The console case** tests a side effect of importing the two elements, so the import cannot move
  out of it. Its budget is raised instead.

Under heavy load the control-bar file itself also went past the runner's 120 s
`testsFinishTimeout` twice in 12 runs. That is a machine too busy to run tests, not a test to fix.

## 4. Considered and dropped

- **Leaving esbuild's `target` out.** With a target string set (`'es2020'`), the esbuild plugin
  also compiles every `.js` file from `node_modules`, all ~900 of them on a cold load, which Chrome
  does not need. Leaving it out saved 0.7 s of a 5.5 s cold load (three runs each). Too little to
  change all six packages' configs for.
- **HTTP/2**, to get past Chrome's six connections per host. The runner's `http2: true` failed with
  `ERR_EMPTY_RESPONSE` before loading anything, and the load is not slow enough to chase it.
- **A port clash between two runners.** Two suites started together took ports 8000 and 8001 and
  both passed.
