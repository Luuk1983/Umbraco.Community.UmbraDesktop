# Overwrite guard implementation plan (phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** A desktop window notices when its own document changed, was trashed or was deleted on the
server, refreshes itself when that is safe, and when it is not says so in its chrome, on its taskbar
button and in every dialog that could throw the work away.

**Architecture:** One consumer of Umbraco's SignalR server-event context in the shell's own
document matches event keys against what each window is showing. A dirty window on a changed node
fetches the server's copy through the workspace's own `loadWithoutPersist()` and a pure function
classifies base/mine/theirs, which is what makes a window's own save suppress itself without timers
or identity. The result is written as flags on the window model, from which a pure `windowNotices()`
derives a list of `info`/`warning`/`error` notices; every visible surface reads that one list.

**Tech stack:** TypeScript, Lit, `@umbraco-cms/backoffice` v17, `@open-wc/testing` under
`web-test-runner` in real Chrome.

**Design:** [`2026-09-08-overwrite-guard-design.md`](2026-09-08-overwrite-guard-design.md). Phase 2
(§10, the diff panel) is out of scope here and is a nice to have.

**No commit steps.** Luuk reviews one diff and decides when it becomes a commit, so every task ends
by running the gates rather than by committing. Leave the work in the tree.

**Two gates, and neither subsumes the other.** Run both at the end of every task:

```bash
cd src/Umbraco.Community.UmbraDesktop && npm run build && npm test
```

`npm test` transpiles through esbuild and does not type-check; `tsc` (inside `npm run build`) never
renders anything. A green test run over a broken build has shipped here.

Single-file runs, used inside tasks:

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/conflict/classify.test.ts" --node-resolve
```

---

## File structure

All paths relative to `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/`.

**New:**

| File | Responsibility |
| --- | --- |
| `conflict/value-compare.ts` | Are two content models the same in the parts an editor can write? Strips server-managed fields. |
| `conflict/value-compare.test.ts` | |
| `conflict/classify.ts` | base/mine/theirs to one verdict. Pure. |
| `conflict/classify.test.ts` | |
| `conflict/server-event.router.ts` | Match events to windows, coalesce, fetch, classify, write flags. Testable with no backoffice. |
| `conflict/server-event.router.test.ts` | |
| `conflict/server-event.controller.ts` | The 20 lines that consume the real context and feed the router. |
| `notices/types.ts` | `UmbraDesktopNotice`, severity, ids, actions. |
| `notices/notices.ts` | `windowNotices()` and `worstSeverity()`. Pure, and the single source for every surface. |
| `notices/notices.test.ts` | |
| `components/window-notices.element.ts` | The banner stack. |
| `components/window-notices.test.ts` | |
| `theme/notice.test.ts` | No theme removes, starves or hides any severity, the banner or the badge. |

**Modified:**

| File | Change |
| --- | --- |
| `types.ts` | Four flags on `UmbraDesktopWindow`. |
| `window-model.ts` | `setWindowServerState`, `setWindowAcknowledged`, `conflictedWindows`. |
| `dirty-watcher.ts` | Callback widens to report the tracked subjects alongside the dirty answer. |
| `window-manager.context.ts` | `setServerState`, `setSubjects`, `subjectsOf`, `acknowledge`, guard wording. |
| `exit-message.ts` | The conflicted clause. |
| `components/window.element.ts` | Marker severity, the spinning reload glyph, renders the notice stack. |
| `components/taskbar.element.ts` | The badge, and the new `exitDialogContent` signature. |
| `constants.ts` | Badge size. |
| `theme/types.ts` | Eight tokens. |
| `theme/tokens.test.ts` | Add the fifth chrome element to the scan. |
| `theme/themes/{umbraco4,macos,win11,win98}/{window,taskbar}.css.ts` | Per-theme expression. |
| `localization/{en,nl}.ts` | New keys, both files. |

---

## Task 1: Value comparison

The load-bearing part. `theirs` is the server's response and carries `updateDate`, `state` and other
fields the editor never had, so a literal deep comparison finds your own save unequal to itself and
alarms on it. Design §5.3, R1.

**Files:**
- Create: `conflict/value-compare.ts`
- Test: `conflict/value-compare.test.ts`

- [ ] **Step 1: Write the failing test**

`conflict/value-compare.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import { sameEditableContent } from './value-compare.js';

/**
 * The comparison that decides whether a server event was this window's own write. It runs over the
 * parts of a content model an editor can actually write, because the server's copy carries fields
 * the editor never had: `updateDate` and `state` change on every save, so a literal deep comparison
 * would find a window's own save unequal to itself and raise a data-loss alarm on it. See design
 * §5.3 and R1.
 */

/** A document detail model as the workspace holds it, with only the fields this module reads. */
function doc(over: Record<string, unknown> = {}) {
  return {
    unique: 'a1',
    documentType: { unique: 'dt1' },
    template: null,
    isTrashed: false,
    values: [
      { alias: 'title', culture: 'en-US', segment: null, value: 'Welcome', editorAlias: 'Umbraco.TextBox' },
      { alias: 'title', culture: 'de-DE', segment: null, value: 'Willkommen', editorAlias: 'Umbraco.TextBox' },
    ],
    variants: [
      { culture: 'en-US', segment: null, name: 'Home', createDate: '2026-01-01', updateDate: '2026-01-01', state: 'Draft' },
      { culture: 'de-DE', segment: null, name: 'Startseite', createDate: '2026-01-01', updateDate: '2026-01-01', state: 'Draft' },
    ],
    ...over,
  };
}

it('calls a model the same as itself', () => {
  expect(sameEditableContent(doc(), doc())).to.equal(true);
});

it('ignores the server-managed fields a save comes back with', () => {
  // The single most important case in this file: this is a window's own save returning from the
  // server, and treating it as a difference is what flashes a false alarm on every save.
  const theirs = doc({
    variants: [
      { culture: 'en-US', segment: null, name: 'Home', createDate: '2026-01-01', updateDate: '2026-09-08T11:22:33Z', state: 'Published', publishDate: '2026-09-08T11:22:33Z' },
      { culture: 'de-DE', segment: null, name: 'Startseite', createDate: '2026-01-01', updateDate: '2026-09-08T11:22:33Z', state: 'Draft' },
    ],
    isTrashed: true,
  });
  expect(sameEditableContent(doc(), theirs)).to.equal(true);
});

it('sees a changed property value', () => {
  const theirs = doc({
    values: [
      { alias: 'title', culture: 'en-US', segment: null, value: 'Welcome to Acme', editorAlias: 'Umbraco.TextBox' },
      { alias: 'title', culture: 'de-DE', segment: null, value: 'Willkommen', editorAlias: 'Umbraco.TextBox' },
    ],
  });
  expect(sameEditableContent(doc(), theirs)).to.equal(false);
});

it('sees a change in a culture other than the one being edited', () => {
  // Design §6: this is the case Umbraco's save silently reverts, so it must never compare equal.
  const theirs = doc({
    values: [
      { alias: 'title', culture: 'en-US', segment: null, value: 'Welcome', editorAlias: 'Umbraco.TextBox' },
      { alias: 'title', culture: 'de-DE', segment: null, value: 'Willkommen bei Acme Ltd', editorAlias: 'Umbraco.TextBox' },
    ],
  });
  expect(sameEditableContent(doc(), theirs)).to.equal(false);
});

it('treats culture and segment as part of a value identity', () => {
  const theirs = doc({
    values: [
      { alias: 'title', culture: 'en-US', segment: 'mobile', value: 'Welcome', editorAlias: 'Umbraco.TextBox' },
      { alias: 'title', culture: 'de-DE', segment: null, value: 'Willkommen', editorAlias: 'Umbraco.TextBox' },
    ],
  });
  expect(sameEditableContent(doc(), theirs)).to.equal(false);
});

it('sees a renamed variant', () => {
  const theirs = doc({
    variants: [
      { culture: 'en-US', segment: null, name: 'Homepage', createDate: '2026-01-01', updateDate: '2026-01-01', state: 'Draft' },
      { culture: 'de-DE', segment: null, name: 'Startseite', createDate: '2026-01-01', updateDate: '2026-01-01', state: 'Draft' },
    ],
  });
  expect(sameEditableContent(doc(), theirs)).to.equal(false);
});

it('sees a changed template', () => {
  expect(sameEditableContent(doc(), doc({ template: { unique: 't2' } }))).to.equal(false);
});

it('does not care what order the server returns values in', () => {
  const theirs = doc({ values: [...doc().values].reverse() });
  expect(sameEditableContent(doc(), theirs)).to.equal(true);
});

it('does not care what order the server returns variants in', () => {
  // The values array has the same test above. Variants need their own, because they carry the
  // editor-visible name: a lost sort here would report a document as changed by somebody else on
  // nothing more than the order two cultures came back in.
  const theirs = doc({ variants: [...doc().variants].reverse() });
  expect(sameEditableContent(doc(), theirs)).to.equal(true);
});

it('compares a model with no values or variants field by stripping known server keys', () => {
  // A data type or member type workspace: not content-shaped, still comparable.
  const mine = { unique: 'x', name: 'My type', updateDate: '2026-01-01' };
  const theirs = { unique: 'x', name: 'My type', updateDate: '2026-09-08' };
  expect(sameEditableContent(mine, theirs)).to.equal(true);
  expect(sameEditableContent(mine, { ...theirs, name: 'Renamed' })).to.equal(false);
});

it('answers false when either side is missing, because equality is unknowable', () => {
  expect(sameEditableContent(undefined, doc())).to.equal(false);
  expect(sameEditableContent(doc(), undefined)).to.equal(false);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/conflict/value-compare.test.ts" --node-resolve
```

Expected: fails to load, `Failed to fetch dynamically imported module` / `value-compare.js` not found.

- [ ] **Step 3: Write the implementation**

`conflict/value-compare.ts`:

```ts
import { jsonStringComparison } from '@umbraco-cms/backoffice/observable-api';

/**
 * Whether two versions of a workspace's data agree in the parts an editor can actually write.
 *
 * This is not `jsonStringComparison` on the whole model, and the difference is the whole point. The
 * server's copy of a document carries fields the editor never had: `updateDate` and `state` change
 * on every save, `publishDate` appears on a publish, `isTrashed` flips when somebody bins it. A
 * literal comparison therefore finds a window's own save unequal to the data it just sent, and
 * `classify.ts` would read that as somebody else's write and raise a data-loss alarm at the moment
 * a save succeeded. That false positive is the one failure that would cost this feature its
 * credibility, so the projection below is deliberately narrow: property values keyed by alias,
 * culture and segment, variant names, and the template. Nothing else.
 */

/**
 * Top-level keys a server owns rather than an editor, dropped from a model that is not
 * content-shaped.
 *
 * Only consulted on the fallback path: a content model is projected field by field instead, so a
 * server field nested inside a variant is excluded by not being read rather than by being listed.
 */
const SERVER_MANAGED_KEYS: ReadonlyArray<string> = [
  'createDate',
  'updateDate',
  'state',
  'publishDate',
  'scheduledPublishDate',
  'scheduledUnpublishDate',
  'isTrashed',
  'flags',
  'id',
];

/** One property value in a content-shaped model, with only the fields the projection reads. */
interface ContentValue {
  /** The property's alias. */
  alias?: string;
  /** The culture this value belongs to, or null for an invariant one. */
  culture?: string | null;
  /** The segment this value belongs to, or null for none. */
  segment?: string | null;
  /** The stored value. */
  value?: unknown;
}

/** One variant in a content-shaped model, with only the fields the projection reads. */
interface ContentVariant {
  /** The variant's culture, or null for an invariant document. */
  culture?: string | null;
  /** The variant's segment, or null for none. */
  segment?: string | null;
  /** The editor-visible name. */
  name?: string;
}

/** The shape the content projection needs; anything else takes the fallback path. */
interface ContentLike {
  /** Property values, if this model has any. */
  values?: ReadonlyArray<ContentValue>;
  /** Variants, if this model has any. */
  variants?: ReadonlyArray<ContentVariant>;
  /** The chosen template, which an editor can set. */
  template?: unknown;
}

/**
 * A stable sort key for a value or variant, so two models that list the same things in a different
 * order still compare equal. The server is under no obligation to preserve the client's order.
 * @param parts The identity fields, in order.
 * @returns A comparable string.
 */
function identity(...parts: ReadonlyArray<string | null | undefined>): string {
  return parts.map((part) => part ?? '').join('|');
}

/**
 * A shallow copy of an object without the keys a server owns. The fallback for a model that is not
 * content-shaped: a data type, a member type, a webhook.
 *
 * Shallow deliberately. Going deeper would need to know which nested objects are server-owned, and
 * guessing that for every workspace type in Umbraco is how this module would start lying. A nested
 * server field on a non-content model shows up as a difference, which errs towards warning the
 * editor rather than towards silence.
 * @param model The model to strip.
 * @returns A copy without the server-managed keys.
 */
function stripServerManaged(model: Record<string, unknown>): Record<string, unknown> {
  const stripped: Record<string, unknown> = {};
  for (const key of Object.keys(model).sort()) {
    if (SERVER_MANAGED_KEYS.includes(key)) continue;
    stripped[key] = model[key];
  }
  return stripped;
}

/**
 * The editable projection of a workspace model: everything an editor could have typed and nothing
 * the server decides.
 *
 * Exported for its tests and for phase 2's diff, which needs the same notion of "a value" to bucket
 * changes by property.
 * @param model The workspace's data, persisted data, or the server's copy.
 * @returns A normalised object safe to compare by value.
 */
export function editableProjection(model: unknown): unknown {
  if (!model || typeof model !== 'object') return model;
  const candidate = model as ContentLike & Record<string, unknown>;
  const isContentShaped = Array.isArray(candidate.values) || Array.isArray(candidate.variants);
  if (!isContentShaped) return stripServerManaged(candidate);
  return {
    template: candidate.template ?? null,
    values: [...(candidate.values ?? [])]
      .map((value) => ({
        alias: value.alias ?? '',
        culture: value.culture ?? null,
        segment: value.segment ?? null,
        value: value.value ?? null,
      }))
      .sort((a, b) =>
        identity(a.alias, a.culture, a.segment).localeCompare(identity(b.alias, b.culture, b.segment)),
      ),
    variants: [...(candidate.variants ?? [])]
      .map((variant) => ({
        culture: variant.culture ?? null,
        segment: variant.segment ?? null,
        name: variant.name ?? '',
      }))
      .sort((a, b) => identity(a.culture, a.segment).localeCompare(identity(b.culture, b.segment))),
  };
}

/**
 * Whether two versions of a workspace's data agree in every part an editor can write.
 *
 * `jsonStringComparison` is core's own comparison, the one `dirty-watcher.ts` already uses, applied
 * to the projection rather than to the raw models. A missing side answers false rather than
 * throwing: equality with data that has not arrived is unknowable, and the callers all treat
 * "unknown" as "do not act".
 * @param a One version.
 * @param b The other.
 * @returns True when they agree on everything editable.
 */
export function sameEditableContent(a: unknown, b: unknown): boolean {
  if (a === undefined || a === null || b === undefined || b === null) return false;
  return jsonStringComparison(editableProjection(a), editableProjection(b)) === true;
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/conflict/value-compare.test.ts" --node-resolve
```

Expected: 11 passing.

- [ ] **Step 5: Run both gates**

```bash
cd src/Umbraco.Community.UmbraDesktop && npm run build && npm test
```

---

## Task 2: Classification

**Files:**
- Create: `conflict/classify.ts`
- Test: `conflict/classify.test.ts`

- [ ] **Step 1: Write the failing test**

`conflict/classify.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import { classifyConflict } from './classify.js';

/**
 * The verdict a server event produces for a window that is holding unsaved changes. Design §5.3.
 *
 * The first case below is the one this whole feature turns on: a server event carries no user or
 * client identity, so a window's own save arrives indistinguishable from a colleague's, and a
 * false alarm on every save would teach people to ignore the real one inside a day.
 */

/** A content model with one value, so a case can state only what it is about. */
function doc(title: string, over: Record<string, unknown> = {}) {
  return {
    unique: 'a1',
    values: [{ alias: 'title', culture: null, segment: null, value: title, editorAlias: 'Umbraco.TextBox' }],
    variants: [{ culture: null, segment: null, name: 'Home', updateDate: '2026-01-01', state: 'Draft' }],
    ...over,
  };
}

it('suppresses a window own write, even when the server stamps it', () => {
  const base = doc('Welcome');
  const mine = doc('Welcome to Acme');
  // What comes back from the server is what we sent, plus the fields the server owns.
  const theirs = doc('Welcome to Acme', {
    variants: [{ culture: null, segment: null, name: 'Home', updateDate: '2026-09-08T10:00:00Z', state: 'Published' }],
  });
  expect(classifyConflict({ base, mine, theirs })).to.equal('own-write');
});

it('does nothing when the server still holds what we last saved', () => {
  const base = doc('Welcome');
  expect(classifyConflict({ base, mine: doc('Welcome to Acme'), theirs: doc('Welcome') })).to.equal('no-change');
});

it('refreshes when this window has nothing of its own', () => {
  // Reachable even though a clean window skips the fetch: the editor can save while the fetch is
  // in flight, and then the window that was dirty when we asked is clean when the answer lands.
  const base = doc('Welcome');
  expect(classifyConflict({ base, mine: doc('Welcome'), theirs: doc('Welcome to Acme') })).to.equal('refresh');
});

it('reports a conflict when the server differs from both sides', () => {
  expect(
    classifyConflict({ base: doc('Welcome'), mine: doc('Welcome to ACME'), theirs: doc('Welcome to Acme Ltd') }),
  ).to.equal('conflict');
});

it('reports a conflict for a change in another culture', () => {
  // Design §6: saving one culture sends stale values for the others, so this is a real conflict
  // and not the harmless case the earlier design assumed.
  const base = {
    unique: 'a1',
    values: [
      { alias: 'title', culture: 'en-US', segment: null, value: 'Welcome', editorAlias: 'Umbraco.TextBox' },
      { alias: 'title', culture: 'de-DE', segment: null, value: 'Willkommen', editorAlias: 'Umbraco.TextBox' },
    ],
    variants: [],
  };
  const mine = structuredClone(base);
  mine.values[0].value = 'Welcome to Acme';
  const theirs = structuredClone(base);
  theirs.values[1].value = 'Willkommen bei Acme Ltd';
  expect(classifyConflict({ base, mine, theirs })).to.equal('conflict');
});

it('does nothing when a side has not loaded', () => {
  expect(classifyConflict({ base: undefined, mine: doc('a'), theirs: doc('b') })).to.equal('no-change');
  expect(classifyConflict({ base: doc('a'), mine: undefined, theirs: doc('b') })).to.equal('no-change');
  expect(classifyConflict({ base: doc('a'), mine: doc('b'), theirs: undefined })).to.equal('no-change');
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/conflict/classify.test.ts" --node-resolve
```

Expected: module not found.

- [ ] **Step 3: Write the implementation**

`conflict/classify.ts`:

```ts
import { sameEditableContent } from './value-compare.js';

/**
 * What a server event means for one window, decided from three snapshots rather than from anything
 * the event says about itself.
 *
 * The event payload is `{ eventSource, eventType, key, clientTimestamp }` and carries no user or
 * client identity, so a window's own save is indistinguishable from a colleague's by inspection.
 * Recognising the ways a window can write does not work either: `saveAndPublish`, `schedule` and
 * `unpublish` bypass `requestSubmit()` entirely and dispatch no `UmbEntityUpdatedEvent`, so a
 * window watching its own submit path would alarm itself on every publish. See design §5.2.
 *
 * So the question is asked of the data instead. It answers for every write path there is, including
 * the same person saving from another browser tab, because it never tries to enumerate them.
 */

/** What one server event turned out to mean for one window. */
export type UmbraDesktopConflictVerdict =
  /** This window wrote it, whichever path it used. Do nothing. */
  | 'own-write'
  /** Nothing changed relative to what this window last saved. A duplicate or stale event. */
  | 'no-change'
  /** This window holds nothing of its own, so take the server's version in place. */
  | 'refresh'
  /** The server holds something neither side has. The editor has to decide. */
  | 'conflict';

/** The three versions a verdict is decided from. */
export interface UmbraDesktopConflictInput {
  /** What this window last saved: `persistedData`. */
  base: unknown;
  /** What the editor is holding: `data`. */
  mine: unknown;
  /** What the server holds now, from `loadWithoutPersist()`. */
  theirs: unknown;
}

/**
 * Decide what a server event means for one window.
 *
 * The order of the checks is load-bearing. `own-write` is asked first because when a save is
 * landing all three of these are true at once and only that answer is safe: the server matches what
 * the editor is holding, and a moment later `persistedData` will match it too. Asking `refresh`
 * first would reload a window over the top of a save that is still settling.
 * @param input The three versions; see {@link UmbraDesktopConflictInput}.
 * @returns The verdict.
 */
export function classifyConflict({ base, mine, theirs }: UmbraDesktopConflictInput): UmbraDesktopConflictVerdict {
  // A side that has not arrived makes every comparison unknowable, and "do nothing" is the only
  // safe answer to a question we cannot ask. A workspace mid-load reaches here.
  if (base === undefined || mine === undefined || theirs === undefined) return 'no-change';
  if (sameEditableContent(theirs, mine)) return 'own-write';
  if (sameEditableContent(theirs, base)) return 'no-change';
  if (sameEditableContent(mine, base)) return 'refresh';
  return 'conflict';
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/conflict/classify.test.ts" --node-resolve
```

Expected: 6 passing.

- [ ] **Step 5: Run both gates**

```bash
cd src/Umbraco.Community.UmbraDesktop && npm run build && npm test
```

---

## Task 3: Window state flags

**Files:**
- Modify: `types.ts` (after the `dirty` member, around line 158)
- Modify: `window-model.ts` (append after `unsavedWindows`, around line 305)
- Test: `window-model.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `window-model.test.ts`:

```ts
describe('server state', () => {
  /**
   * Two windows, so a test can prove the other one is left alone. Built with this file's own
   * `win(id, z, over)` helper rather than a second fixture.
   */
  const two = (): UmbraDesktopWindow[] => [win('a', 1, { active: true }), win('b', 2)];

  it('sets a flag on one window', () => {
    const next = setWindowServerState(two(), 'a', { changedElsewhere: true });
    expect(next[0].changedElsewhere).to.equal(true);
    expect(next[1].changedElsewhere).to.equal(undefined);
  });

  it('hands back the same list when nothing changed', () => {
    const windows = setWindowServerState(two(), 'a', { changedElsewhere: true });
    expect(setWindowServerState(windows, 'a', { changedElsewhere: true })).to.equal(windows);
  });

  it('hands back the same list for a window that is not open', () => {
    const windows = two();
    expect(setWindowServerState(windows, 'gone', { deleted: true })).to.equal(windows);
  });

  it('leaves the flags it was not given alone', () => {
    const windows = setWindowServerState(two(), 'a', { trashed: true });
    const next = setWindowServerState(windows, 'a', { changedElsewhere: true });
    expect(next[0].trashed).to.equal(true);
    expect(next[0].changedElsewhere).to.equal(true);
  });

  it('records an acknowledgement', () => {
    const next = setWindowAcknowledged(two(), 'a', true);
    expect(next[0].acknowledged).to.equal(true);
    expect(setWindowAcknowledged(next, 'a', true)).to.equal(next);
  });

  it('records a refresh in flight', () => {
    const next = setWindowRefreshing(two(), 'a', true);
    expect(next[0].refreshing).to.equal(true);
    expect(next[1].refreshing).to.equal(undefined);
    expect(setWindowRefreshing(next, 'a', true)).to.equal(next);
  });

  it('lists windows whose unsaved work is at risk', () => {
    let windows = setWindowDirty(two(), 'a', true);
    windows = setWindowDirty(windows, 'b', true);
    windows = setWindowServerState(windows, 'a', { changedElsewhere: true });
    expect(conflictedWindows(windows).map((w) => w.id)).to.eql(['a']);
  });

  it('does not count a changed window that has nothing unsaved', () => {
    const windows = setWindowServerState(two(), 'a', { changedElsewhere: true });
    expect(conflictedWindows(windows)).to.eql([]);
  });
});
```

Add `setWindowServerState`, `setWindowAcknowledged`, `setWindowRefreshing` and `conflictedWindows` to
the file's existing import from `./window-model`, plus `setWindowDirty` if it is not already there.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/window-model.test.ts" --node-resolve
```

Expected: FAIL, `setWindowServerState is not a function`.

- [ ] **Step 3: Add the flags to the model**

In `types.ts`, immediately after the `dirty?: boolean;` member of `UmbraDesktopWindow`:

```ts
  /**
   * Whether the server holds a version of this window's subject that neither this window's editor
   * nor its last save produced, i.e. somebody else wrote it.
   *
   * Optional and absent rather than `false`, like {@link dirty}, and set only by the server-event
   * router after it has classified an event. Meaningful only alongside `dirty`: a window with
   * nothing unsaved takes the server's version in place instead of carrying this.
   */
  changedElsewhere?: boolean;

  /**
   * Whether this window's subject has been moved to the recycle bin.
   *
   * A trashed node still exists, but core's document workspace context adds a read-only guard while
   * `isTrashed` is true, so it cannot be saved once the window has reloaded to see that. It stays
   * fully editable until then, because `isTrashed` comes from the workspace's own data and a dirty
   * window has not reloaded. Either way, a restore undoes it completely, which is why this is a
   * warning and not the error {@link deleted} is.
   */
  trashed?: boolean;

  /**
   * Whether this window's subject has been permanently deleted.
   *
   * The one state that marks a clean window, because it is the one with nothing to refresh to.
   * `submit()` branches on `getIsNew()`, which is false for a loaded document, so a save from here
   * always takes the `PUT` path and receives a 404: it cannot succeed and it recreates nothing.
   */
  deleted?: boolean;

  /**
   * Whether the editor has confirmed they mean to keep their own version over somebody else's.
   *
   * Quiets that notice's banner and nothing else: the marker and the taskbar badge stay, so an
   * acknowledged window never goes back to looking safe.
   */
  acknowledged?: boolean;

  /**
   * Whether a workspace in this window is re-fetching itself after somebody else changed it.
   *
   * Drives the titlebar reload glyph and nothing else. Deliberately not the window element's own
   * `_loading`, which also raises the body overlay: covering the content is the exact opposite of
   * what a refresh in place is for, since the editor keeps their scroll position, their open tab
   * and their split view and the only thing that should move is the glyph. On the model rather than
   * in the element because both refresh paths are triggered from outside it, by the server-event
   * router and by the banner's discard action. Design D7.
   */
  refreshing?: boolean;
```

- [ ] **Step 4: Add the operations**

Append to `window-model.ts`:

```ts
/** The flags the server-event router writes; see {@link UmbraDesktopWindow}. */
export type UmbraDesktopServerStatePatch = Pick<
  UmbraDesktopWindow,
  'changedElsewhere' | 'trashed' | 'deleted'
>;

/**
 * Return a new list with `id`'s server-state flags merged, or **the same list** when nothing
 * changed.
 *
 * The identity shortcut is the same one {@link setWindowDirty} needs and for the same reason: a
 * burst of server events for one node would otherwise hand back a new array per event and re-render
 * every window on the desktop each time. A patch names only the flags it sets, so the router can
 * report "trashed" without claiming anything about the other two. Pure.
 * @param windows The current window list.
 * @param id The window to update.
 * @param patch The flags to set.
 * @returns A new list, or the input list when it already said this.
 */
export function setWindowServerState(
  windows: UmbraDesktopWindow[],
  id: string,
  patch: UmbraDesktopServerStatePatch,
): UmbraDesktopWindow[] {
  const target = windows.find((w) => w.id === id);
  if (!target) return windows;
  const keys = Object.keys(patch) as Array<keyof UmbraDesktopServerStatePatch>;
  if (keys.every((key) => (target[key] ?? false) === (patch[key] ?? false))) return windows;
  return windows.map((w) => (w.id === id ? { ...w, ...patch } : w));
}

/**
 * Return a new list with `id`'s acknowledgement recorded, or the same list when it already said
 * this. Pure.
 * @param windows The current window list.
 * @param id The window to update.
 * @param acknowledged Whether the editor has confirmed they mean to keep their own version.
 * @returns A new list, or the input list.
 */
export function setWindowAcknowledged(
  windows: UmbraDesktopWindow[],
  id: string,
  acknowledged: boolean,
): UmbraDesktopWindow[] {
  const target = windows.find((w) => w.id === id);
  if (!target || (target.acknowledged ?? false) === acknowledged) return windows;
  return windows.map((w) => (w.id === id ? { ...w, acknowledged } : w));
}

/**
 * Return a new list with `id` marked as refreshing, or the same list when it already said this.
 *
 * Its own setter rather than part of {@link UmbraDesktopServerStatePatch}, because it is not a fact
 * about the server: it is a transient fact about this window, and folding it into a patch named for
 * server state would make the next reader wonder which the other three are. Pure.
 * @param windows The current window list.
 * @param id The window to update.
 * @param refreshing Whether a workspace in it is re-fetching itself.
 * @returns A new list, or the input list.
 */
export function setWindowRefreshing(
  windows: UmbraDesktopWindow[],
  id: string,
  refreshing: boolean,
): UmbraDesktopWindow[] {
  const target = windows.find((w) => w.id === id);
  if (!target || (target.refreshing ?? false) === refreshing) return windows;
  return windows.map((w) => (w.id === id ? { ...w, refreshing } : w));
}

/**
 * Every open window whose unsaved work is at risk from somebody else's write, in list order.
 *
 * Requires `dirty`, because a window with nothing unsaved has nothing to lose and takes the
 * server's version in place. This is what the Exit dialog counts for its second sentence. Pure.
 * @param windows The current window list.
 * @returns The windows at risk.
 */
export function conflictedWindows(
  windows: ReadonlyArray<UmbraDesktopWindow>,
): ReadonlyArray<UmbraDesktopWindow> {
  return windows.filter((w) => w.dirty === true && w.changedElsewhere === true);
}
```

- [ ] **Step 5: Run it and watch it pass**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/window-model.test.ts" --node-resolve
```

Expected: the existing tests plus 8 new, all passing.

- [ ] **Step 6: Run both gates**

```bash
cd src/Umbraco.Community.UmbraDesktop && npm run build && npm test
```

---

## Task 4: The notice model

**Files:**
- Create: `notices/types.ts`, `notices/notices.ts`
- Test: `notices/notices.test.ts`

- [ ] **Step 1: Write the failing test**

`notices/notices.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import { windowNotices, worstSeverity } from './notices.js';
import type { UmbraDesktopWindow } from '../types.js';

/**
 * Design §3. Four facts, not four alternatives: a document can be in the recycle bin *and* have
 * been changed by somebody else *and* hold unsaved changes, and each is its own notice with its own
 * wording and its own actions. Everything visible reads this one list, so these are the tests that
 * pin the behaviour of the marker, the banners and the taskbar badge at once.
 */

/** A window carrying only the state these functions read. */
function win(over: Partial<UmbraDesktopWindow> = {}): UmbraDesktopWindow {
  return {
    id: 'w1',
    app: { alias: 'a', name: 'A', icon: 'icon-umbraco', content: { kind: 'iframe', url: 'about:blank' } },
    rect: { x: 0, y: 0, w: 10, h: 10 },
    z: 1,
    active: true,
    state: 'normal',
    ...over,
  } as UmbraDesktopWindow;
}

it('says nothing about a clean untouched window', () => {
  expect(windowNotices(win())).to.eql([]);
  expect(worstSeverity(windowNotices(win()))).to.equal(undefined);
});

it('gives unsaved changes an info notice with no banner', () => {
  const notices = windowNotices(win({ dirty: true }));
  expect(notices.map((n) => n.id)).to.eql(['unsaved']);
  expect(notices[0].severity).to.equal('info');
  expect(notices[0].banner).to.equal(false);
  expect(worstSeverity(notices)).to.equal('info');
});

it('gives a conflict a warning notice with a banner and two actions', () => {
  const notices = windowNotices(win({ dirty: true, changedElsewhere: true }));
  expect(notices.map((n) => n.id)).to.eql(['changed-elsewhere', 'unsaved']);
  expect(notices[0].severity).to.equal('warning');
  expect(notices[0].banner).to.equal(true);
  expect(notices[0].actions).to.eql(['acknowledge', 'discard-and-load']);
  expect(worstSeverity(notices)).to.equal('warning');
});

it('drops the conflict banner once acknowledged but keeps the notice', () => {
  const notices = windowNotices(win({ dirty: true, changedElsewhere: true, acknowledged: true }));
  expect(notices.map((n) => n.id)).to.eql(['changed-elsewhere', 'unsaved']);
  expect(notices[0].banner).to.equal(false);
  expect(notices[0].actions).to.eql([]);
  // The marker and the badge read this, so the window must not go back to looking safe.
  expect(worstSeverity(notices)).to.equal('warning');
});

it('gives a trashed window with unsaved work a warning and no actions', () => {
  const notices = windowNotices(win({ dirty: true, trashed: true }));
  expect(notices.map((n) => n.id)).to.eql(['trashed', 'unsaved']);
  expect(notices[0].actions).to.eql([]);
  expect(notices[0].banner).to.equal(true);
});

it('says nothing about a trashed window with nothing unsaved', () => {
  // Design D8: it reloaded in place and Umbraco's own UI shows the bin state.
  expect(windowNotices(win({ trashed: true }))).to.eql([]);
});

it('raises two notices when a document was trashed and changed', () => {
  const notices = windowNotices(win({ dirty: true, trashed: true, changedElsewhere: true }));
  expect(notices.map((n) => n.id)).to.eql(['trashed', 'changed-elsewhere', 'unsaved']);
  expect(notices.filter((n) => n.banner).length).to.equal(2);
});

it('gives a deleted window an error notice, dirty or not', () => {
  const dirty = windowNotices(win({ dirty: true, deleted: true }));
  expect(dirty.map((n) => n.id)).to.eql(['deleted', 'unsaved']);
  expect(dirty[0].severity).to.equal('error');
  expect(dirty[0].actions).to.eql(['close']);
  expect(worstSeverity(dirty)).to.equal('error');

  const clean = windowNotices(win({ deleted: true }));
  expect(clean.map((n) => n.id)).to.eql(['deleted']);
  expect(clean[0].severity).to.equal('error');
});

it('says different things about a deleted window depending on unsaved work', () => {
  const dirty = windowNotices(win({ dirty: true, deleted: true }))[0];
  const clean = windowNotices(win({ deleted: true }))[0];
  expect(dirty.body).to.not.equal(clean.body);
});

it('drops the lesser notices once a document is gone', () => {
  // There is nothing to conflict with and nothing to restore from the bin.
  const notices = windowNotices(win({ dirty: true, deleted: true, trashed: true, changedElsewhere: true }));
  expect(notices.map((n) => n.id)).to.eql(['deleted', 'unsaved']);
});

it('orders notices worst first', () => {
  const notices = windowNotices(win({ dirty: true, deleted: true }));
  expect(notices.map((n) => n.severity)).to.eql(['error', 'info']);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/notices/notices.test.ts" --node-resolve
```

Expected: module not found.

- [ ] **Step 3: Write the types**

`notices/types.ts`:

```ts
/**
 * What a window tells its editor about the state of the document inside it.
 *
 * Three severities and one list, rather than a mechanism per condition. Today's unsaved-changes dot
 * is the `info` level of this, so the conflict work adds two levels above it instead of a parallel
 * marker beside it, and every future condition a window might report (a validation failure, a
 * scheduled publish, an environment mismatch) is a new entry rather than new chrome. Design D1.
 */

/** How loud a notice is, which is the only thing that decides where it appears. */
export type UmbraDesktopNoticeSeverity = 'info' | 'warning' | 'error';

/** Which condition a notice is about. Stable, because CSS and tests both key off it. */
export type UmbraDesktopNoticeId = 'unsaved' | 'changed-elsewhere' | 'trashed' | 'deleted';

/**
 * Something the editor can do about a notice.
 *
 * `acknowledge` opens the confirmation that says saving will lose the other editor's change;
 * `discard-and-load` takes the server's version; `close` closes the window. Phase 2 adds
 * `show-changes`.
 */
export type UmbraDesktopNoticeAction = 'acknowledge' | 'discard-and-load' | 'close';

/** One thing a window has to say about its document. */
export interface UmbraDesktopNotice {
  /** Which condition this is about. */
  id: UmbraDesktopNoticeId;
  /** How loud it is. */
  severity: UmbraDesktopNoticeSeverity;
  /** Localization key for the heading. */
  title: string;
  /** Localization key for the explanation. */
  body: string;
  /**
   * Whether this notice is drawn as a banner in the window's chrome.
   *
   * Derived rather than asked, and it is where two rules live: `info` never gets a banner, because a
   * strip on every window with unsaved changes would be intolerable and would change today's
   * behaviour; and an acknowledged conflict loses its banner while keeping its severity, so the
   * marker and the badge stay.
   */
  banner: boolean;
  /** What the editor can do about it, in the order the buttons are drawn. */
  actions: ReadonlyArray<UmbraDesktopNoticeAction>;
}
```

- [ ] **Step 4: Write the derivation**

`notices/notices.ts`:

```ts
import type { UmbraDesktopWindow } from '../types.js';
import type { UmbraDesktopNotice, UmbraDesktopNoticeSeverity } from './types.js';

/**
 * Everything a window has to say about its document, and how bad the worst of it is.
 *
 * Two pure functions, and between them they decide the titlebar marker, the banner stack, the
 * taskbar badge and both close guards. Keeping that in one place is what stops the four surfaces
 * disagreeing about whether a window is in trouble.
 */

/** Sort weight per severity: lower is worse, so the worst notice sorts first. */
const SEVERITY_WEIGHT: Readonly<Record<UmbraDesktopNoticeSeverity, number>> = {
  error: 0,
  warning: 1,
  info: 2,
};

/** Only the window state these functions read, so a test need not build a whole window. */
type NoticeRelevantWindow = Pick<
  UmbraDesktopWindow,
  'dirty' | 'changedElsewhere' | 'trashed' | 'deleted' | 'acknowledged'
>;

/**
 * Everything a window has to say about its document, worst first.
 *
 * The `deleted` branch swallows the other two conditions deliberately: there is nothing left to
 * conflict with and nothing to restore from the bin, so reporting them alongside would be three
 * banners saying one thing. `trashed` and `changed-elsewhere` both require `dirty`, because a
 * window with nothing unsaved has nothing at risk and has already taken the server's version in
 * place (design D8). `deleted` does not, because it is the one condition with nothing to refresh to.
 * Pure.
 * @param w The window to describe.
 * @returns The notices, ordered error, warning, info.
 */
export function windowNotices(w: NoticeRelevantWindow): UmbraDesktopNotice[] {
  const notices: UmbraDesktopNotice[] = [];
  if (w.deleted) {
    notices.push({
      id: 'deleted',
      severity: 'error',
      title: 'umbraDesktop_noticeDeletedTitle',
      body: w.dirty ? 'umbraDesktop_noticeDeletedDirtyBody' : 'umbraDesktop_noticeDeletedBody',
      banner: true,
      actions: ['close'],
    });
  } else {
    if (w.trashed && w.dirty) {
      notices.push({
        id: 'trashed',
        severity: 'warning',
        title: 'umbraDesktop_noticeTrashedTitle',
        body: 'umbraDesktop_noticeTrashedBody',
        banner: true,
        // Nothing to offer: every action still works exactly as it did, so this is a statement of
        // fact rather than a decision. The bin is somebody's to undo, not this window's.
        actions: [],
      });
    }
    if (w.changedElsewhere && w.dirty) {
      notices.push({
        id: 'changed-elsewhere',
        severity: 'warning',
        title: 'umbraDesktop_noticeChangedTitle',
        body: 'umbraDesktop_noticeChangedBody',
        banner: !w.acknowledged,
        actions: w.acknowledged ? [] : ['acknowledge', 'discard-and-load'],
      });
    }
  }
  if (w.dirty) {
    notices.push({
      id: 'unsaved',
      severity: 'info',
      title: 'umbraDesktop_unsavedChanges',
      body: 'umbraDesktop_unsavedChanges',
      banner: false,
      actions: [],
    });
  }
  return notices.sort((a, b) => SEVERITY_WEIGHT[a.severity] - SEVERITY_WEIGHT[b.severity]);
}

/**
 * The worst severity present, which is what the marker and the taskbar badge paint. Pure.
 * @param notices The window's notices.
 * @returns The worst severity, or undefined when there is nothing to say.
 */
export function worstSeverity(
  notices: ReadonlyArray<UmbraDesktopNotice>,
): UmbraDesktopNoticeSeverity | undefined {
  return notices.reduce<UmbraDesktopNoticeSeverity | undefined>(
    (worst, notice) =>
      worst === undefined || SEVERITY_WEIGHT[notice.severity] < SEVERITY_WEIGHT[worst]
        ? notice.severity
        : worst,
    undefined,
  );
}
```

- [ ] **Step 5: Run it and watch it pass**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/notices/notices.test.ts" --node-resolve
```

Expected: 11 passing.

- [ ] **Step 6: Run both gates**

```bash
cd src/Umbraco.Community.UmbraDesktop && npm run build && npm test
```

---

## Task 5: Localization keys

Done before the elements so nothing renders a missing key. `parity.test.ts` already fails when the
two files disagree.

**Files:**
- Modify: `localization/en.ts` (after `exitUnsaved`, around line 90)
- Modify: `localization/nl.ts` (after `exitUnsaved`, around line 84)

- [ ] **Step 1: Add the English keys**

In `localization/en.ts`, directly after the `exitUnsaved` line:

```ts
    exitConflictedSole: 'That window has also been changed by someone else.',
    exitConflictedOne: 'One of them has also been changed by someone else.',
    exitConflictedMany: '%0% of them have also been changed by someone else.',
    // changed, trashed or deleted underneath a window
    noticeChangedTitle: 'Someone else changed this while you were editing it',
    noticeChangedBody: 'Saving now replaces their version with yours.',
    noticeTrashedTitle: 'Someone moved this to the recycle bin',
    noticeTrashedBody:
      'Items in the recycle bin are read-only, so this window will stop accepting changes as soon as it reloads. Copy anything you need now, or ask someone to restore it.',
    noticeDeletedTitle: 'This no longer exists',
    noticeDeletedBody: 'Someone deleted it permanently.',
    noticeDeletedDirtyBody:
      'Someone deleted it permanently. Your unsaved changes cannot be saved, because there is nothing left to save them to. Copy anything you need before you close this window.',
    noticeKeepMine: 'Keep my changes',
    noticeDiscardMine: 'Discard my changes and load the new version',
    noticeCloseWindow: 'Close window',
    noticeKeepHeadline: 'Keep your changes?',
    noticeKeepQuestion:
      'When you save, the changes the other person made will be lost. This window will keep warning you until you save or discard.',
    noticeKeepConfirm: 'Keep my changes',
    noticeAcknowledged: 'Changed by someone else',
    discardConflictedHeadline: 'Close this window?',
    discardConflictedQuestion:
      'Closing is the safe option here: your unsaved changes are discarded and the version someone else saved is kept.',
```

- [ ] **Step 2: Add the Dutch keys**

In `localization/nl.ts`, directly after its `exitUnsaved` line:

```ts
    exitConflictedSole: 'Dat venster is ook door iemand anders gewijzigd.',
    exitConflictedOne: 'Eén daarvan is ook door iemand anders gewijzigd.',
    exitConflictedMany: '%0% daarvan zijn ook door iemand anders gewijzigd.',
    // gewijzigd, in de prullenbak of verwijderd onder een venster
    noticeChangedTitle: 'Iemand anders heeft dit gewijzigd terwijl je eraan werkte',
    noticeChangedBody: 'Als je nu opslaat, vervang je hun versie door de jouwe.',
    noticeTrashedTitle: 'Iemand heeft dit naar de prullenbak verplaatst',
    noticeTrashedBody:
      'Je kunt je wijzigingen nog opslaan, maar het blijft in de prullenbak tot iemand het terugzet.',
    noticeDeletedTitle: 'Dit bestaat niet meer',
    noticeDeletedBody: 'Iemand heeft het definitief verwijderd.',
    noticeDeletedDirtyBody:
      'Iemand heeft het definitief verwijderd. Je niet-opgeslagen wijzigingen kunnen niet worden opgeslagen, want er is niets meer om ze in op te slaan. Kopieer wat je nodig hebt voordat je dit venster sluit.',
    noticeKeepMine: 'Mijn wijzigingen behouden',
    noticeDiscardMine: 'Mijn wijzigingen weggooien en de nieuwe versie laden',
    noticeCloseWindow: 'Venster sluiten',
    noticeKeepHeadline: 'Je wijzigingen behouden?',
    noticeKeepQuestion:
      'Als je opslaat, gaan de wijzigingen van de ander verloren. Dit venster blijft waarschuwen tot je opslaat of weggooit.',
    noticeKeepConfirm: 'Mijn wijzigingen behouden',
    noticeAcknowledged: 'Door iemand anders gewijzigd',
    discardConflictedHeadline: 'Dit venster sluiten?',
    discardConflictedQuestion:
      'Sluiten is hier de veilige keuze: je niet-opgeslagen wijzigingen gaan verloren en de versie die iemand anders heeft opgeslagen blijft staan.',
```

- [ ] **Step 3: Run the parity test**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/localization/parity.test.ts" --node-resolve
```

Expected: PASS. A failure names the key one file is missing.

- [ ] **Step 4: Run both gates**

```bash
cd src/Umbraco.Community.UmbraDesktop && npm run build && npm test
```

---

## Task 6: The Exit dialog's second sentence

**Files:**
- Modify: `exit-message.ts`
- Modify: `components/taskbar.element.ts` (the `exitDialogContent` call, around line 159)
- Test: `exit-message.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `exit-message.test.ts`:

```ts
describe('windows that also changed elsewhere', () => {
  /** A localizer that returns the key and its arguments, so a test can read what was asked for. */
  const term = (key: string, ...args: unknown[]) => (args.length ? `${key}(${args.join(',')})` : key);

  it('says nothing extra when nothing changed elsewhere', () => {
    expect(exitDialogContent(2, 0, term)).to.equal(
      'umbraDesktop_exitUnsaved(2) umbraDesktop_exitQuestion',
    );
  });

  it('names the single window directly rather than as one of them', () => {
    expect(exitDialogContent(1, 1, term)).to.equal(
      'umbraDesktop_exitUnsavedOne umbraDesktop_exitConflictedSole umbraDesktop_exitQuestion',
    );
  });

  it('says one of them when several windows are unsaved', () => {
    expect(exitDialogContent(3, 1, term)).to.equal(
      'umbraDesktop_exitUnsaved(3) umbraDesktop_exitConflictedOne umbraDesktop_exitQuestion',
    );
  });

  it('counts more than one', () => {
    expect(exitDialogContent(3, 2, term)).to.equal(
      'umbraDesktop_exitUnsaved(3) umbraDesktop_exitConflictedMany(2) umbraDesktop_exitQuestion',
    );
  });

  it('ignores a conflicted count with no unsaved windows, which cannot happen', () => {
    expect(exitDialogContent(0, 2, term)).to.equal('umbraDesktop_exitQuestion');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/exit-message.test.ts" --node-resolve
```

Expected: FAIL, the third argument is ignored so the conflicted clause never appears.

- [ ] **Step 3: Rewrite the builder**

Replace the body of `exitDialogContent` in `exit-message.ts`, keeping the existing module doc:

```ts
/**
 * The body of the Exit dialog: the question it has always asked, plus a sentence naming how much
 * unsaved work is about to go with it, plus a second sentence when some of that work is also about
 * to lose somebody else's.
 *
 * The second sentence is not a nicety. Everywhere else on this desktop closing is what loses work,
 * so the Exit dialog is written to discourage it; for a window that has also changed on the server,
 * closing is the *safe* act and discarding is what keeps the other person's version. An editor
 * deciding whether to exit needs to know which of the two situations they are in, and the count is
 * the shortest way to say it. Design §9.
 *
 * Pure, and taking its localizer as an argument, so the singular and plural choices and the "say
 * nothing when there is nothing" cases can be checked without a booted backoffice.
 * @param unsavedCount How many open windows are holding unsaved changes.
 * @param conflictedCount How many of those have also been changed by somebody else.
 * @param term The localizer, e.g. `this.localize.term` bound to the calling element.
 * @returns The dialog body.
 */
export function exitDialogContent(
  unsavedCount: number,
  conflictedCount: number,
  term: UmbraDesktopTerm,
): string {
  const question = term('umbraDesktop_exitQuestion');
  if (unsavedCount < 1) return question;
  const warning =
    unsavedCount === 1
      ? term('umbraDesktop_exitUnsavedOne')
      : term('umbraDesktop_exitUnsaved', unsavedCount);
  if (conflictedCount < 1) return `${warning} ${question}`;
  // "One of them" needs more than one to be one of, so a single unsaved window gets its own
  // wording rather than a sentence that reads as a counting error.
  const conflict =
    unsavedCount === 1
      ? term('umbraDesktop_exitConflictedSole')
      : conflictedCount === 1
        ? term('umbraDesktop_exitConflictedOne')
        : term('umbraDesktop_exitConflictedMany', conflictedCount);
  return `${warning} ${conflict} ${question}`;
}
```

The three tests already in this file call `exitDialogContent(n, term)`. The signature change puts
`term` in the new parameter's position, so update those three calls to pass `0` for
`conflictedCount`: their intent is unchanged, which is the unsaved-count wording with no conflict.

- [ ] **Step 4: Update the caller**

In `components/taskbar.element.ts`, the `exitDialogContent` call becomes:

```ts
          exitDialogContent(
            this.#manager?.unsavedWindows().length ?? 0,
            this.#manager?.conflictedWindows().length ?? 0,
            this.localize.term,
          ),
```

- [ ] **Step 5: Run it and watch it pass**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/exit-message.test.ts" --node-resolve
```

Expected: existing tests plus 5 new, all passing. `npm run build` will still fail until Task 7 adds
`conflictedWindows` to the manager; that is expected and the next task closes it.

---

## Task 7: The manager's new state and guards

**Files:**
- Modify: `window-manager.context.ts`
- Test: `window-manager.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `window-manager.test.ts`:

```ts
describe('server state and its guards', () => {
  /** A manager whose two dialogs are recorded answers instead of modals. */
  class GuardProbe extends UmbraDesktopWindowManagerContext {
    /** What the discard dialog answers. */
    public discardAnswer = true;
    /** What the keep-mine confirmation answers. */
    public keepAnswer = true;
    /** Which dialogs were opened, in order. */
    public opened: string[] = [];

    protected override async _askToDiscard(): Promise<boolean> {
      this.opened.push('discard');
      return this.discardAnswer;
    }

    protected override async _askToDiscardConflicted(): Promise<boolean> {
      this.opened.push('discard-conflicted');
      return this.discardAnswer;
    }

    protected override async _askToKeepMine(): Promise<boolean> {
      this.opened.push('keep');
      return this.keepAnswer;
    }
  }

  let manager: GuardProbe;

  beforeEach(() => {
    manager = new GuardProbe(new UmbElementControllerHost(document.createElement('div')));
    manager.open(APP);
  });

  /** The one open window's id. */
  const only = () => manager.getWindows()[0].id;

  it('asks the ordinary discard question for a dirty window', async () => {
    manager.setDirty(only(), true);
    expect(await manager.confirmDiscard(only())).to.equal(true);
    expect(manager.opened).to.eql(['discard']);
  });

  it('asks the inverted question when the window also changed elsewhere', async () => {
    manager.setDirty(only(), true);
    manager.setServerState(only(), { changedElsewhere: true });
    expect(await manager.confirmDiscard(only())).to.equal(true);
    expect(manager.opened).to.eql(['discard-conflicted']);
  });

  it('asks nothing at all for a deleted window', async () => {
    manager.setDirty(only(), true);
    manager.setServerState(only(), { deleted: true });
    expect(await manager.confirmDiscard(only())).to.equal(true);
    expect(manager.opened).to.eql([]);
  });

  it('records an acknowledgement only when the confirmation is confirmed', async () => {
    manager.setDirty(only(), true);
    manager.setServerState(only(), { changedElsewhere: true });
    manager.keepAnswer = false;
    await manager.acknowledge(only());
    expect(manager.getWindows()[0].acknowledged).to.equal(undefined);
    manager.keepAnswer = true;
    await manager.acknowledge(only());
    expect(manager.getWindows()[0].acknowledged).to.equal(true);
  });

  it('counts the windows whose work is at risk', () => {
    manager.setDirty(only(), true);
    expect(manager.conflictedWindows().length).to.equal(0);
    manager.setServerState(only(), { changedElsewhere: true });
    expect(manager.conflictedWindows().length).to.equal(1);
  });

  it('keeps a window subjects out of the render model', () => {
    const subjects = [{ entityType: 'document', unique: 'a1' }];
    manager.setSubjects(only(), subjects as never);
    expect(manager.subjectsOf(only())).to.equal(subjects);
    expect(JSON.stringify(manager.getWindows()[0])).to.not.contain('a1');
  });

  it('forgets a closed window subjects', () => {
    const id = only();
    manager.setSubjects(id, [{ entityType: 'document', unique: 'a1' }] as never);
    manager.close(id);
    expect(manager.subjectsOf(id)).to.eql([]);
  });
});
```

`getWindows()` is a small read-only accessor added in step 2; if `window-manager.test.ts` already
has a helper for reading the current list, use that instead and drop the accessor from step 2.

- [ ] **Step 2: Declare the subject types the manager stores**

These belong to `dirty-watcher.ts`, which produces them, but they are declared here because the
manager is the first file to name them and its build gate would otherwise fail on an import of a
type that does not exist yet. Task 8 fills in the behaviour behind them; this step is two interfaces
and no logic.

Add to `dirty-watcher.ts`, after the `ComparableWorkspace` interface:

```ts
/**
 * The parts of a workspace context the server-event router needs, lifted out of the frame's realm
 * into plain functions the shell can hold.
 *
 * Functions rather than the instance itself, so nothing outside this module depends on the shape of
 * a core class, and so a subject stays valid to *read* even as the data behind it moves: the two
 * getters close over the values this module is already subscribed to, which is what lets the router
 * fetch and compare against a live pair rather than a snapshot taken when the event arrived.
 */
export interface UmbraDesktopWorkspaceSubject {
  /** The entity type, e.g. `document`. */
  entityType: string;
  /** The entity's unique id, which is the GUID a server event carries as its `key`. */
  unique: string;
  /** Re-fetch and apply in place, keeping scroll position, the open tab and split view. */
  reload: () => Promise<void>;
  /**
   * The server's current copy, without applying it to the workspace.
   *
   * Optional: it is declared on `UmbEntityDetailWorkspaceContextBase`, and a comparable workspace
   * that lacks it simply cannot be classified rather than being an exception to handle. Design R3.
   */
  loadWithoutPersist?: () => Promise<unknown>;
  /** What this workspace last saved, live. */
  getPersistedData: () => unknown;
  /** What the editor is holding, live. */
  getData: () => unknown;
}

/** What a frame currently is, as far as the shell is concerned. */
export interface UmbraDesktopFrameState {
  /** Whether anything in the frame is holding unsaved changes. */
  dirty: boolean;
  /** What the frame's workspaces are showing, for matching server events against. */
  subjects: ReadonlyArray<UmbraDesktopWorkspaceSubject>;
}
```

- [ ] **Step 3: Extend the manager**

In `window-manager.context.ts`, extend the imports from `./window-model`:

```ts
  setWindowServerState,
  setWindowAcknowledged,
  setWindowRefreshing,
  conflictedWindows,
```

and add to the imports from `@umbraco-cms/backoffice/modal`:

```ts
import { UMB_DISCARD_CHANGES_MODAL, umbConfirmModal, umbOpenModal } from '@umbraco-cms/backoffice/modal';
```

Add the type import:

```ts
import type { UmbraDesktopServerStatePatch } from './window-model';
import type { UmbraDesktopWorkspaceSubject } from './dirty-watcher';
import { windowNotices, worstSeverity } from './notices/notices';
```

Add the subject store as a field beside `#windows`:

```ts
  /**
   * What each window is showing, by window id, for the server-event router to match events
   * against.
   *
   * Deliberately **not** on the window model. The model is an observable list whose identity drives
   * rendering, and a subject carries live functions (`reload`, `loadWithoutPersist`) that change
   * whenever a frame reloads: putting them there would re-render every window on the desktop each
   * time any frame navigated, and would put unserialisable members into state that is otherwise
   * plain data. The router reads this on demand instead, which is the only access pattern it needs.
   */
  #subjects = new Map<string, ReadonlyArray<UmbraDesktopWorkspaceSubject>>();
```

Add the methods, after `unsavedWindows`:

```ts
  /** The current window list, for callers that need a snapshot rather than the observable. */
  public getWindows(): ReadonlyArray<UmbraDesktopWindow> {
    return this.#windows.getValue();
  }

  /**
   * Record what the server says happened to a window's subject. Written by the server-event router.
   * @param id The window to mark.
   * @param patch The flags to set; see {@link UmbraDesktopServerStatePatch}.
   */
  public setServerState(id: string, patch: UmbraDesktopServerStatePatch): void {
    this.#windows.setValue(setWindowServerState(this.#windows.getValue(), id, patch));
  }

  /**
   * Record what a window is showing, so the router can match server events against it. Written by
   * the window element each time its frame's workspaces change.
   * @param id The window.
   * @param subjects What it is showing.
   */
  public setSubjects(id: string, subjects: ReadonlyArray<UmbraDesktopWorkspaceSubject>): void {
    this.#subjects.set(id, subjects);
  }

  /**
   * What a window is showing.
   * @param id The window.
   * @returns Its subjects, or an empty list for a window that has none or is gone.
   */
  public subjectsOf(id: string): ReadonlyArray<UmbraDesktopWorkspaceSubject> {
    return this.#subjects.get(id) ?? [];
  }

  /**
   * Every open window whose unsaved work is also about to overwrite somebody else's. What the Exit
   * dialog counts for its second sentence.
   * @returns The windows at risk, in list order.
   */
  public conflictedWindows(): ReadonlyArray<UmbraDesktopWindow> {
    return conflictedWindows(this.#windows.getValue());
  }

  /**
   * Mark a window as re-fetching itself, which spins its titlebar reload glyph.
   *
   * Called by the server-event router around every workspace reload it performs, and by the
   * banner's discard action. Both are refreshes the editor did not ask for at that moment, and the
   * spinning glyph is the whole of what the desktop says about them: design D7 settles that a
   * silent refresh is right, because desktop applications update while you read them without
   * announcing it, but a refresh with no visible cause at all reads as a glitch.
   * @param id The window.
   * @param refreshing Whether a fetch is in flight.
   */
  public setRefreshing(id: string, refreshing: boolean): void {
    this.#windows.setValue(setWindowRefreshing(this.#windows.getValue(), id, refreshing));
  }

  /**
   * Confirm that the editor means to keep their own version over somebody else's, and record it if
   * they do.
   *
   * Gated by a confirmation rather than applied on click, because "keep my changes" is the one
   * action here that chooses data loss: it is the other editor's change that goes, and it goes
   * later, at a save the editor has not made yet. Confirming quiets this notice's banner and
   * nothing else. Design D10.
   * @param id The window whose conflict is being acknowledged.
   */
  public async acknowledge(id: string): Promise<void> {
    if (!(await this._askToKeepMine())) return;
    this.#windows.setValue(setWindowAcknowledged(this.#windows.getValue(), id, true));
  }

  /**
   * Open the confirmation behind "keep my changes".
   *
   * Split out for the same reason {@link _askToDiscard} is: a modal manager context only resolves
   * inside a booted backoffice, and the decision is worth testing without one.
   * @returns True when the editor confirmed.
   */
  protected async _askToKeepMine(): Promise<boolean> {
    try {
      await umbConfirmModal(this, {
        headline: this.localize.term('umbraDesktop_noticeKeepHeadline'),
        content: this.localize.term('umbraDesktop_noticeKeepQuestion'),
        confirmLabel: this.localize.term('umbraDesktop_noticeKeepConfirm'),
        color: 'warning',
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Open the close-this-window question for a window whose document also changed on the server.
   *
   * A second wording rather than a reuse of core's discard dialog, because the two say opposite
   * things. Core's is built to discourage closing, which is right when closing is what loses work.
   * Here saving is what loses work, closing is the safe act, and a dialog that warns against the
   * safe act pushes the editor towards the destructive one. Design §9.
   * @returns True when the editor chose to close.
   */
  protected async _askToDiscardConflicted(): Promise<boolean> {
    try {
      await umbConfirmModal(this, {
        headline: this.localize.term('umbraDesktop_discardConflictedHeadline'),
        content: this.localize.term('umbraDesktop_discardConflictedQuestion'),
        confirmLabel: this.localize.term('umbraDesktop_noticeCloseWindow'),
        color: 'warning',
      });
      return true;
    } catch {
      return false;
    }
  }
```

Replace `confirmDiscard`'s body, keeping its existing doc comment and adding the two new paragraphs:

```ts
  public async confirmDiscard(id: string): Promise<boolean> {
    const target = this.#windows.getValue().find((w) => w.id === id);
    if (!target?.dirty) return true;
    // A document that no longer exists cannot be saved to, so "discard your changes?" offers a
    // choice that does not exist. Closing is the only thing left and it asks nothing.
    if (target.deleted) return true;
    // Keyed on `changedElsewhere` rather than on severity, which is the distinction that decides
    // which of the two things closing does. Somebody else's change is at stake only here: closing
    // keeps their version and discards yours, so closing is the safe act and the dialog says so.
    // A trashed document is also a warning, and there the ordinary question is the right one:
    // core's read-only guard means the work cannot be saved from that window at all once it
    // reloads, so closing still loses only your own work and nobody else's.
    if (target.changedElsewhere) return this._askToDiscardConflicted();
    return this._askToDiscard();
  }
```

This does not need `windowNotices` or `worstSeverity`, so do not import them here.

Add subject cleanup to `close`:

```ts
  public close(id: string): void {
    this.#subjects.delete(id);
    this.#windows.setValue(removeWindow(this.#windows.getValue(), id));
  }
```

**`UmbContextBase` does not provide `this.localize`** — that comes from `UmbLitElement`, and this is
a context, not an element. So add the controller explicitly, as a field beside `#windows`:

```ts
  /**
   * The localizer for the two dialogs this context opens.
   *
   * A controller of its own because `this.localize` is a member of `UmbLitElement` and this is a
   * context: the guards are the only part of the manager that produces text, and they need the same
   * localizer the elements use rather than raw keys.
   */
  #localize = new UmbLocalizationController(this);
```

with `import { UmbLocalizationController } from '@umbraco-cms/backoffice/localization-api';`, and use
`this.#localize.term(...)` in both `_askToKeepMine` and `_askToDiscardConflicted` in place of
`this.localize.term(...)`.

- [ ] **Step 4: Run it and watch it pass**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/window-manager.test.ts" --node-resolve
```

Expected: existing tests plus 7 new, all passing.

- [ ] **Step 5: Run both gates**

```bash
cd src/Umbraco.Community.UmbraDesktop && npm run build && npm test
```

---

## Task 8: The dirty watcher reports subjects

The riskiest edit in the plan: this file is delicate, its doc comments are load-bearing, and its one
existing behaviour (not republishing on every keystroke) is easy to break while widening it.

**Files:**
- Modify: `dirty-watcher.ts`
- Test: `dirty-watcher.test.ts` (append, and update the existing callback assertions)

- [ ] **Step 1: Write the failing test**

Append to `dirty-watcher.test.ts`:

This file already has `fakeState`, `fakeWorkspace` (returning `{ instance, persisted, current, load }`),
`mountProvider` (returning `{ provide, unprovide, dispose }`), a `teardown` array with an `afterEach`,
and a `watch()` helper that collects booleans. Keep `watch()` and every existing assertion exactly as
they are by having it read the new record's `dirty`, and add a second helper beside it for the
subjects:

```ts
/**
 * Start a watcher over the test document and collect what it reports.
 * @returns The reported values, in order.
 */
function watch(): boolean[] {
  const reported: boolean[] = [];
  teardown.push(watchWorkspaceDirtyState(document, (state) => reported.push(state.dirty)));
  return reported;
}

/**
 * Start a watcher and collect the whole record rather than only the dirty half.
 *
 * A second helper rather than a change to {@link watch}, so every existing assertion in this file
 * stays exactly as it was: what those tests are about is the dirty answer, and rewriting them to
 * reach through a record would be churn that proves nothing.
 * @returns The reported states, in order.
 */
function watchState(): UmbraDesktopFrameState[] {
  const reported: UmbraDesktopFrameState[] = [];
  teardown.push(watchWorkspaceDirtyState(document, (state) => reported.push(state)));
  return reported;
}

/**
 * A workspace that also publishes an identity, so the watcher can build a subject from it.
 * @param unique The unique to start on.
 * @returns The workspace handles, plus the unique's state so a test can move it.
 */
function fakeSubjectWorkspace(unique = 'a1') {
  const uniqueState = fakeState<string | null | undefined>(unique);
  const workspace = fakeWorkspace({
    unique: uniqueState.observable,
    entityType: fakeState<string | undefined>('document').observable,
    reload: () => Promise.resolve(),
    loadWithoutPersist: () => Promise.resolve({}),
  });
  return { ...workspace, uniqueState };
}
```

Add the type to the file's import from `./dirty-watcher`:

```ts
import { watchWorkspaceDirtyState, type UmbraDesktopFrameState } from './dirty-watcher';
```

Then the new cases:

```ts
it('reports what a tracked workspace is showing', () => {
  const reported = watchState();
  const workspace = fakeSubjectWorkspace();
  const provider = mountProvider(workspace.instance);
  teardown.push(provider.dispose);

  provider.provide();
  workspace.load({ name: 'Home' });
  workspace.current.set({ name: 'Homepage' });

  const last = reported[reported.length - 1];
  expect(last.dirty).to.equal(true);
  expect(last.subjects.map((s) => `${s.entityType}:${s.unique}`)).to.deep.equal(['document:a1']);
});

it('gives a subject live access to both sides of the comparison', () => {
  // Getters rather than a snapshot, because the router reads them after an await: the editor has
  // been typing while the fetch was in flight, and the verdict is about the pair in force when the
  // answer arrived.
  const reported = watchState();
  const workspace = fakeSubjectWorkspace();
  const provider = mountProvider(workspace.instance);
  teardown.push(provider.dispose);

  provider.provide();
  workspace.load({ name: 'Home' });
  workspace.current.set({ name: 'Homepage' });

  const subject = reported[reported.length - 1].subjects[0];
  expect(subject.getPersistedData()).to.deep.equal({ name: 'Home' });
  expect(subject.getData()).to.deep.equal({ name: 'Homepage' });
  workspace.current.set({ name: 'Home page' });
  expect(subject.getData()).to.deep.equal({ name: 'Home page' });
});

it('reports a new subject when the window navigates to another document', () => {
  // What makes opening a second document in the same window work with no extra machinery: the
  // dirty answer has not moved, and what an event should match has.
  const reported = watchState();
  const workspace = fakeSubjectWorkspace();
  const provider = mountProvider(workspace.instance);
  teardown.push(provider.dispose);

  provider.provide();
  workspace.load({ name: 'Home' });
  workspace.uniqueState.set('b2');

  expect(reported[reported.length - 1].subjects[0].unique).to.equal('b2');
});

it('reports no subject for a workspace that publishes no identity', () => {
  // Design R3: not an exception to handle, simply not a match.
  const reported = watchState();
  const workspace = fakeWorkspace();
  const provider = mountProvider(workspace.instance);
  teardown.push(provider.dispose);

  provider.provide();
  workspace.load({ name: 'Home' });
  workspace.current.set({ name: 'Homepage' });

  expect(reported[reported.length - 1].subjects).to.deep.equal([]);
});

it('still does not report again for a keystroke that changes nothing about the answer', () => {
  const reported = watchState();
  const workspace = fakeSubjectWorkspace();
  const provider = mountProvider(workspace.instance);
  teardown.push(provider.dispose);

  provider.provide();
  workspace.load({ name: 'Home' });
  workspace.current.set({ name: 'Homepage' });
  const afterFirstEdit = reported.length;
  workspace.current.set({ name: 'Homepag' });
  workspace.current.set({ name: 'Homepa' });

  expect(reported.length, 'a keystroke in an already-dirty window repaints the whole desktop').to.equal(
    afterFirstEdit,
  );
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/dirty-watcher.test.ts" --node-resolve
```

Expected: FAIL, the callback is given a boolean so `state.subjects` is undefined.

- [ ] **Step 3: Widen the watcher**

The two interfaces are already in place from Task 7 step 2. This step is the behaviour behind them.

Widen `ComparableWorkspace` with the optional members, all of which
`UmbEntityDetailWorkspaceContextBase` declares:

```ts
interface ComparableWorkspace {
  /** The workspace's current data. */
  data: Subscribable<unknown>;
  /** The workspace's data as last saved. */
  persistedData: Subscribable<unknown>;
  /** The subject's unique id, when this workspace has one. */
  unique?: Subscribable<string | null | undefined>;
  /** The subject's entity type, when this workspace has one. */
  entityType?: Subscribable<string | undefined>;
  /** Re-fetch and apply in place. */
  reload?: () => Promise<void>;
  /** The server's copy, without applying it. */
  loadWithoutPersist?: () => Promise<unknown>;
}
```

Widen `TrackedWorkspace`:

```ts
interface TrackedWorkspace {
  /** Drops every subscription. */
  release: () => void;
  /** Whether this workspace is currently holding unsaved changes. */
  dirty: boolean;
  /** The subject it is showing, or undefined until its unique and entity type both arrive. */
  subject?: UmbraDesktopWorkspaceSubject;
}
```

Replace `publish` and `track` inside `watchWorkspaceDirtyState`, and change the callback type:

```ts
export function watchWorkspaceDirtyState(
  doc: Document,
  onChange: (state: UmbraDesktopFrameState) => void,
): () => void {
  const tracked = new Map<object, TrackedWorkspace>();
  /**
   * The last answer reported, as a signature string.
   *
   * **Seeded rather than left undefined, and derived rather than typed.** `track` registers an
   * entry in the map before subscribing, deliberately, so the first `evaluate` runs while both
   * halves are still `undefined` and computes the signature of an empty frame. Against an unset
   * baseline that reads as a change, and every window on the desktop would fire a report the
   * moment its frame loaded, which is the "never on start" rule this whole comparison exists to
   * keep. The old boolean version was safe only because `false` happened to be the empty state.
   */
  let reported = signatureOf(false, []);
  let stopped = false;

  /**
   * The frame's whole answer as one comparable string.
   *
   * Extracted rather than inlined into `publish` so the baseline above can be derived from it
   * instead of written out a second time, which is the repository's derive-never-type rule applied
   * to a string. The identity of a subject's functions is deliberately absent: re-evaluating the
   * same document reallocates the subject object on every keystroke, and including it would make
   * the comparison always report a change, which is the failure this comparison exists to prevent.
   * @param dirty Whether anything in the frame holds unsaved changes.
   * @param subjects What the frame's workspaces are showing.
   * @returns A string equal for two states the shell should treat as the same.
   */
  const signatureOf = (dirty: boolean, subjects: ReadonlyArray<UmbraDesktopWorkspaceSubject>) =>
    `${dirty}|${subjects.map((s) => `${s.entityType}:${s.unique}`).join(',')}`;

  /**
   * Push the frame's state out, but only when it has actually changed.
   *
   * The comparison is over a string of the whole answer rather than over the dirty boolean alone,
   * because the answer now has two halves and either can move on its own: a window navigating from
   * one clean document to another changes nothing about dirtiness and everything about what an
   * event should match. The identity of the subject's functions is deliberately not part of it, so
   * re-subscribing to the same document does not count as a change.
   */
  const publish = () => {
    const entries = [...tracked.values()];
    const dirty = entries.some((entry) => entry.dirty);
    const subjects = entries
      .map((entry) => entry.subject)
      .filter((subject): subject is UmbraDesktopWorkspaceSubject => subject !== undefined);
    const signature = signatureOf(dirty, subjects);
    if (signature === reported) return;
    reported = signature;
    onChange({ dirty, subjects });
  };

  /** Subscribe to a workspace's halves and its identity, and keep its entry up to date. */
  const track = (workspace: ComparableWorkspace) => {
    const key = workspace as unknown as object;
    if (stopped || tracked.has(key)) return;
    let persisted: unknown;
    let current: unknown;
    let unique: string | null | undefined;
    let entityType: string | undefined;
    const entry: TrackedWorkspace = { dirty: false, release: () => {} };
    /** Recompute this entry's dirty answer and its subject, then publish the frame's total. */
    const evaluate = () => {
      entry.dirty = hasUnsavedChanges(persisted, current);
      entry.subject =
        unique && entityType && workspace.reload
          ? {
              entityType,
              unique,
              reload: () => workspace.reload!(),
              loadWithoutPersist: workspace.loadWithoutPersist
                ? () => workspace.loadWithoutPersist!()
                : undefined,
              getPersistedData: () => persisted,
              getData: () => current,
            }
          : undefined;
      publish();
    };
    // Registered before subscribing, because every observable emits its current value straight
    // away and `evaluate` has to find the entry already in the map to publish a truthful total.
    tracked.set(key, entry);
    const subs = [
      workspace.persistedData.subscribe((value) => {
        persisted = value;
        evaluate();
      }),
      workspace.data.subscribe((value) => {
        current = value;
        evaluate();
      }),
      workspace.unique?.subscribe((value) => {
        unique = value;
        evaluate();
      }),
      workspace.entityType?.subscribe((value) => {
        entityType = value;
        evaluate();
      }),
    ];
    entry.release = () => {
      for (const sub of subs) sub?.unsubscribe();
    };
  };
```

The rest of the function, including `onProvide`, `onUnprovided` and the returned teardown, is
unchanged. `isComparableWorkspace` is unchanged too: the subject is best effort, and a workspace
without a `unique` is not an exception, it simply has no subject.

- [ ] **Step 4: Update the window element's use of the callback**

In `components/window.element.ts`, `#startDirtyWatch` clears the subjects alongside the dirty reset
it already does, and passes both halves of the record on:

```ts
    this.#manager?.setDirty(id, false);
    // Subjects cleared too, not left standing. A reload replaces the frame's document, so the
    // previous subjects' getters close over a dead realm, and between the reload starting and the
    // new watcher's first report a server event could match a document this window is no longer
    // showing.
    this.#manager?.setSubjects(id, []);
    this.#stopDirtyWatch = watchWorkspaceDirtyState(doc, (state) => {
      this.#manager?.setDirty(id, state.dirty);
      this.#manager?.setSubjects(id, state.subjects);
    });
```

- [ ] **Step 5: Run it and watch it pass**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/dirty-watcher.test.ts" --node-resolve
```

Expected: existing tests (with their callback assertions updated to read `state.dirty`) plus 5 new.

- [ ] **Step 6: Run both gates**

```bash
cd src/Umbraco.Community.UmbraDesktop && npm run build && npm test
```

---

## Task 9: The server-event router

**Files:**
- Create: `conflict/server-event.router.ts`
- Test: `conflict/server-event.router.test.ts`

- [ ] **Step 1: Write the failing test**

`conflict/server-event.router.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import { createServerEventRouter } from './server-event.router.js';
import type { UmbraDesktopServerStatePatch } from '../window-model.js';

/**
 * The orchestration between a server event and a window's flags. Everything decided here is
 * decided without a booted backoffice: the router takes a function that hands it the current
 * windows and a sink it writes flags to, so a test can drive it with plain objects. Design §5.
 */

/** A window the router can act on, with recording stand-ins for the workspace's two methods. */
function target(over: Record<string, unknown> = {}) {
  const calls = { reload: 0, fetch: 0 };
  const subject = {
    entityType: 'document',
    unique: 'a1',
    reload: async () => void (calls.reload += 1),
    loadWithoutPersist: async () => {
      calls.fetch += 1;
      return (over.theirs as unknown) ?? { values: [{ alias: 't', value: 'theirs' }] };
    },
    getPersistedData: () => (over.base as unknown) ?? { values: [{ alias: 't', value: 'base' }] },
    getData: () => (over.mine as unknown) ?? { values: [{ alias: 't', value: 'mine' }] },
  };
  return {
    calls,
    window: { id: (over.id as string) ?? 'w1', dirty: (over.dirty as boolean) ?? true },
    subjects: [subject],
  };
}

/** A router over a fixed set of targets, recording every flag written. */
function router(targets: ReturnType<typeof target>[]) {
  const written: Array<{ id: string; patch: UmbraDesktopServerStatePatch }> = [];
  const refreshes: Array<{ id: string; refreshing: boolean }> = [];
  const instance = createServerEventRouter({
    windows: () => targets.map((t) => t.window),
    subjectsOf: (id) => targets.find((t) => t.window.id === id)?.subjects ?? [],
    setServerState: (id, patch) => written.push({ id, patch }),
    setRefreshing: (id, refreshing) => refreshes.push({ id, refreshing }),
  });
  return { instance, written, refreshes };
}

/** A server event, with the fields that matter stated per test. */
const event = (over: Partial<{ eventType: string; key: string; eventSource: string }> = {}) => ({
  eventSource: 'Umbraco:CMS:Document',
  eventType: 'Updated',
  key: 'a1',
  clientTimestamp: '2026-09-08T10:00:00Z',
  ...over,
});

it('marks a dirty window whose node somebody else changed', async () => {
  const t = target();
  const { instance, written } = router([t]);
  await instance.handleEvent(event());
  expect(written).to.eql([{ id: 'w1', patch: { changedElsewhere: true } }]);
  expect(t.calls.fetch).to.equal(1);
});

it('leaves an unrelated node alone', async () => {
  const t = target();
  const { instance, written } = router([t]);
  await instance.handleEvent(event({ key: 'somebody-else' }));
  expect(written).to.eql([]);
  expect(t.calls.fetch).to.equal(0);
  expect(t.calls.reload).to.equal(0);
});

it('does not mark a window that wrote it itself', async () => {
  // The server's copy is what this window is holding, whichever path wrote it.
  const t = target({ theirs: { values: [{ alias: 't', value: 'mine' }] } });
  const { instance, written } = router([t]);
  await instance.handleEvent(event());
  expect(written).to.eql([]);
});

it('refreshes a clean window in place instead of fetching', async () => {
  const t = target({ dirty: false });
  const { instance, written } = router([t]);
  await instance.handleEvent(event());
  expect(t.calls.reload).to.equal(1);
  expect(t.calls.fetch).to.equal(0);
  expect(written).to.eql([]);
});

it('spins the glyph across a refresh and stops it afterwards', async () => {
  const t = target({ dirty: false });
  const { instance, refreshes } = router([t]);
  await instance.handleEvent(event());
  expect(refreshes).to.eql([
    { id: 'w1', refreshing: true },
    { id: 'w1', refreshing: false },
  ]);
});

it('stops the glyph even when the reload fails', async () => {
  // Otherwise a node that goes while we are re-fetching it leaves the glyph spinning for the life
  // of the window.
  const t = target({ dirty: false });
  t.subjects[0].reload = async () => {
    throw new Error('gone');
  };
  const { instance, refreshes } = router([t]);
  try {
    await instance.handleEvent(event());
  } catch {
    // The rejection is the router's caller's problem; what is under test is the flag.
  }
  expect(refreshes[refreshes.length - 1]).to.eql({ id: 'w1', refreshing: false });
});

it('marks a trashed node and still classifies it', async () => {
  const t = target();
  const { instance, written } = router([t]);
  await instance.handleEvent(event({ eventType: 'Trashed' }));
  expect(written).to.eql([
    { id: 'w1', patch: { trashed: true } },
    { id: 'w1', patch: { changedElsewhere: true } },
  ]);
});

it('refreshes a clean window whose node was trashed', async () => {
  const t = target({ dirty: false });
  const { instance, written } = router([t]);
  await instance.handleEvent(event({ eventType: 'Trashed' }));
  expect(t.calls.reload).to.equal(1);
  expect(written).to.eql([]);
});

it('marks a deleted node without asking the server', async () => {
  const t = target();
  const { instance, written } = router([t]);
  await instance.handleEvent(event({ eventType: 'Deleted' }));
  expect(written).to.eql([{ id: 'w1', patch: { deleted: true } }]);
  expect(t.calls.fetch).to.equal(0);
});

it('marks a deleted node on a clean window too, and does not reload it', async () => {
  const t = target({ dirty: false });
  const { instance, written } = router([t]);
  await instance.handleEvent(event({ eventType: 'Deleted' }));
  expect(written).to.eql([{ id: 'w1', patch: { deleted: true } }]);
  expect(t.calls.reload).to.equal(0);
});

it('ignores an event type it does not handle', async () => {
  const t = target();
  const { instance, written } = router([t]);
  await instance.handleEvent(event({ eventType: 'Moved' }));
  expect(written).to.eql([]);
  expect(t.calls.fetch).to.equal(0);
});

it('marks every window showing the node, and only those', async () => {
  const a = target({ id: 'w1' });
  const b = target({ id: 'w2' });
  const c = target({ id: 'w3' });
  c.subjects[0].unique = 'other';
  const { instance, written } = router([a, b, c]);
  await instance.handleEvent(event());
  expect(written.map((w) => w.id)).to.eql(['w1', 'w2']);
});

it('coalesces a burst into one fetch per window', async () => {
  const t = target();
  const { instance } = router([t]);
  await Promise.all([
    instance.handleEvent(event()),
    instance.handleEvent(event()),
    instance.handleEvent(event()),
  ]);
  // One fetch for the first event, and one more for everything that arrived while it was in
  // flight, rather than one per event.
  expect(t.calls.fetch).to.equal(2);
});

it('treats a 404 from the fetch as a deleted node', async () => {
  const t = target();
  t.subjects[0].loadWithoutPersist = async () => {
    throw new Error('Error loading entity', { cause: { status: 404 } });
  };
  const { instance, written } = router([t]);
  await instance.handleEvent(event());
  expect(written).to.eql([{ id: 'w1', patch: { deleted: true } }]);
});

it('says nothing when the fetch fails for any other reason', async () => {
  const t = target();
  t.subjects[0].loadWithoutPersist = async () => {
    throw new Error('Network down');
  };
  const { instance, written } = router([t]);
  await instance.handleEvent(event());
  expect(written).to.eql([]);
});

it('says nothing when the workspace cannot be asked', async () => {
  const t = target();
  t.subjects[0].loadWithoutPersist = undefined;
  const { instance, written } = router([t]);
  await instance.handleEvent(event());
  expect(written).to.eql([]);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/conflict/server-event.router.test.ts" --node-resolve
```

Expected: module not found.

- [ ] **Step 3: Write the router**

`conflict/server-event.router.ts`:

```ts
import { classifyConflict } from './classify.js';
import type { UmbraDesktopWorkspaceSubject } from '../dirty-watcher.js';
import type { UmbraDesktopServerStatePatch } from '../window-model.js';

/**
 * Turns Umbraco's server events into flags on the windows they concern.
 *
 * Separated from the context plumbing so all of it is testable with plain objects: the router is
 * handed a way to read the current windows and a sink to write flags to, and knows nothing about
 * `UMB_MANAGEMENT_API_SERVER_EVENT_CONTEXT`. `server-event.controller.ts` is the twenty lines that
 * connect the two.
 */

/** One event as the management API's hub delivers it. */
export interface UmbraDesktopServerEvent {
  /** e.g. `Umbraco:CMS:Document`. */
  eventSource: string;
  /** `Updated`, `Trashed` or `Deleted`; anything else is ignored. */
  eventType: string;
  /** The entity's GUID. */
  key: string;
  /** Stamped by the client on receipt, so it dates the delivery and not the change. */
  clientTimestamp: string;
}

/** The window state the router reads. */
export interface UmbraDesktopRouterWindow {
  /** The window's id. */
  id: string;
  /** Whether it is holding unsaved changes. */
  dirty?: boolean;
}

/** What the router needs of the world around it. */
export interface UmbraDesktopRouterHost {
  /** The currently open windows. */
  windows: () => ReadonlyArray<UmbraDesktopRouterWindow>;
  /** What a window is showing. */
  subjectsOf: (id: string) => ReadonlyArray<UmbraDesktopWorkspaceSubject>;
  /** Record what the server says happened to a window's subject. */
  setServerState: (id: string, patch: UmbraDesktopServerStatePatch) => void;
  /** Mark a window as re-fetching itself, which spins its titlebar reload glyph. */
  setRefreshing: (id: string, refreshing: boolean) => void;
}

/** The event sources this desktop acts on. Everything else is somebody else's cache to invalidate. */
const HANDLED_SOURCES: ReadonlyArray<string> = ['Umbraco:CMS:Document', 'Umbraco:CMS:Media'];

/** The event types this desktop acts on. */
const HANDLED_TYPES: ReadonlyArray<string> = ['Updated', 'Trashed', 'Deleted'];

/**
 * Whether a rejected fetch means the entity is gone rather than that the network is.
 *
 * `loadWithoutPersist` wraps the repository's failure as `new Error(…, { cause: error })`, and the
 * cause is the API error carrying the status. Anything that is not a 404 is treated as "we do not
 * know", because marking a window permanently deleted on a dropped connection would be a much worse
 * lie than saying nothing.
 * @param error Whatever the fetch rejected with.
 * @returns True when the server said the entity does not exist.
 */
function isMissing(error: unknown): boolean {
  const cause = (error as { cause?: { status?: number } } | undefined)?.cause;
  return cause?.status === 404;
}

/**
 * Build a router over the given host.
 * @param host How to read windows and write flags; see {@link UmbraDesktopRouterHost}.
 * @returns The router.
 */
export function createServerEventRouter(host: UmbraDesktopRouterHost) {
  /**
   * Reload one subject in place, with the window's glyph spinning while it happens.
   *
   * The `finally` matters more than it looks: a reload that rejects, because the entity went while
   * we were asking, would otherwise leave the glyph spinning for the life of the window.
   * @param id The window.
   * @param subject What it is showing.
   */
  const refresh = async (id: string, subject: UmbraDesktopWorkspaceSubject): Promise<void> => {
    host.setRefreshing(id, true);
    try {
      await subject.reload();
    } finally {
      host.setRefreshing(id, false);
    }
  };

  /**
   * Windows with a classification fetch in flight, and whether another event arrived while it was.
   *
   * A bulk operation, such as publish with descendants or a recycle-bin empty, delivers an event
   * per affected node, and a window can match several of them in a burst. Without this the window
   * would fetch once per event and classify against data that was already stale by the time the
   * first answer came back. One in flight per window, and at most one re-run after it, which is
   * what "coalesced" means here.
   */
  const inFlight = new Map<string, { pending: boolean }>();

  /**
   * Fetch the server's copy for one subject and act on the verdict.
   * @param id The window.
   * @param subject What it is showing.
   */
  const classify = async (id: string, subject: UmbraDesktopWorkspaceSubject): Promise<void> => {
    if (!subject.loadWithoutPersist) return;
    let theirs: unknown;
    try {
      theirs = await subject.loadWithoutPersist();
    } catch (error) {
      if (isMissing(error)) host.setServerState(id, { deleted: true });
      return;
    }
    // Read both sides *after* the await, not before: the editor has been typing throughout, and
    // the pair the verdict is about is the one in force when the answer arrived.
    const verdict = classifyConflict({
      base: subject.getPersistedData(),
      mine: subject.getData(),
      theirs,
    });
    if (verdict === 'conflict') host.setServerState(id, { changedElsewhere: true });
    else if (verdict === 'refresh') await refresh(id, subject);
  };

  /**
   * Run `classify` for a window, coalescing anything that arrives while it is in flight.
   * @param id The window.
   * @param subject What it is showing.
   */
  const classifyCoalesced = async (id: string, subject: UmbraDesktopWorkspaceSubject): Promise<void> => {
    const running = inFlight.get(id);
    if (running) {
      running.pending = true;
      return;
    }
    const entry = { pending: false };
    inFlight.set(id, entry);
    try {
      await classify(id, subject);
      if (entry.pending) await classify(id, subject);
    } finally {
      inFlight.delete(id);
    }
  };

  return {
    /**
     * Act on one server event.
     *
     * Matching is on the event's `key` against each window's subject. Umbraco keys are GUIDs and
     * globally unique, so the key alone is a sound match; the source is filtered first only to keep
     * the desktop out of events it has no business acting on.
     * @param event The event.
     */
    async handleEvent(event: UmbraDesktopServerEvent): Promise<void> {
      if (!HANDLED_SOURCES.includes(event.eventSource)) return;
      if (!HANDLED_TYPES.includes(event.eventType)) return;
      const work: Promise<void>[] = [];
      for (const window of host.windows()) {
        for (const subject of host.subjectsOf(window.id)) {
          if (subject.unique !== event.key) continue;
          if (event.eventType === 'Deleted') {
            // Nothing to fetch and nothing to compare: there is no version to refresh to, and a
            // save from here cannot succeed. It is the one state that marks a clean window.
            host.setServerState(window.id, { deleted: true });
            continue;
          }
          if (event.eventType === 'Trashed' && window.dirty) {
            host.setServerState(window.id, { trashed: true });
          }
          if (!window.dirty) {
            // Nothing of the editor's to lose, so take the server's version in place. This is the
            // same single request a classification would have spent, so a clean window costs
            // nothing extra.
            work.push(refresh(window.id, subject));
            continue;
          }
          work.push(classifyCoalesced(window.id, subject));
        }
      }
      await Promise.all(work);
    },
  };
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/conflict/server-event.router.test.ts" --node-resolve
```

Expected: 16 passing.

- [ ] **Step 5: Run both gates**

```bash
cd src/Umbraco.Community.UmbraDesktop && npm run build && npm test
```

---

## Task 10: Wire the router to the real context

**Files:**
- Create: `conflict/server-event.controller.ts`
- Modify: `components/desktop.element.ts`

- [ ] **Step 1: Write the controller**

`conflict/server-event.controller.ts`:

```ts
import { createServerEventRouter, type UmbraDesktopServerEvent } from './server-event.router.js';
import type { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMB_MANAGEMENT_API_SERVER_EVENT_CONTEXT } from '@umbraco-cms/backoffice/management-api';

/**
 * Connects Umbraco's live change notifications to the desktop's windows.
 *
 * Consumed **once, in the desktop's own document**, not once per frame. The context is a
 * `globalContext`, so there is one instance per backoffice document, and every window is a
 * backoffice document already holding its own hub connection: consuming it per window would
 * multiply a connection count that is already a known problem, to learn the same facts several
 * times over.
 *
 * Everything this class does beyond plumbing lives in `server-event.router.ts`, which is why this
 * file has no tests of its own: there is nothing here that can be wrong without the context itself
 * being wrong.
 */
export class UmbraDesktopServerEventController extends UmbControllerBase {
  /** The router this feeds. */
  #router: ReturnType<typeof createServerEventRouter>;

  /**
   * @param host The desktop element.
   * @param manager The window manager, which is both the window source and the flag sink.
   */
  constructor(host: UmbControllerHost, manager: UmbraDesktopWindowManagerContext) {
    super(host);
    this.#router = createServerEventRouter({
      windows: () => manager.getWindows(),
      subjectsOf: (id) => manager.subjectsOf(id),
      setServerState: (id, patch) => manager.setServerState(id, patch),
      setRefreshing: (id, refreshing) => manager.setRefreshing(id, refreshing),
    });
    this.consumeContext(UMB_MANAGEMENT_API_SERVER_EVENT_CONTEXT, (context) => {
      if (!context) return;
      this.observe(
        context.events,
        (event) => {
          if (event) void this.#router.handleEvent(event as UmbraDesktopServerEvent);
        },
        'observeServerEvents',
      );
    });
  }
}
```

If `@umbraco-cms/backoffice/management-api` does not export the token, find the export path with:

```bash
cd src/Umbraco.Community.UmbraDesktop && grep -rn "UMB_MANAGEMENT_API_SERVER_EVENT_CONTEXT" node_modules/@umbraco-cms/backoffice/package.json node_modules/@umbraco-cms/backoffice/dist-cms/packages/management-api/index.d.ts
```

- [ ] **Step 2: Construct it from the desktop element**

In `components/desktop.element.ts`, where the window manager context is constructed, add:

```ts
    new UmbraDesktopServerEventController(this, this.#manager);
```

using the same field name the element already uses for its manager, and import the controller.

- [ ] **Step 3: Run both gates**

```bash
cd src/Umbraco.Community.UmbraDesktop && npm run build && npm test
```

Expected: PASS. A missing export shows up here as a `tsc` error, which is the point of running the
build.

---

## Task 11: The marker, the notice stack and the spinning glyph

**Files:**
- Modify: `constants.ts`
- Modify: `theme/types.ts`
- Modify: `theme/tokens.test.ts`
- Create: `components/window-notices.element.ts`
- Modify: `components/window.element.ts`
- Test: `components/window-notices.test.ts`

- [ ] **Step 1: Write the failing test**

`components/window-notices.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import './window-notices.element.js';
import type { UmbraDesktopWindowNoticesElement } from './window-notices.element.js';
import type { UmbraDesktopWindow } from '../types.js';

/**
 * The banner stack. Design §3 and D3: severity decides where a notice appears, and `info` appears
 * as the titlebar marker only, so a window with ordinary unsaved changes must render no banner at
 * all. That is the assertion that keeps this feature from changing what today's desktop does.
 */

/** A window carrying only the state the element reads. */
function win(over: Partial<UmbraDesktopWindow> = {}): UmbraDesktopWindow {
  return {
    id: 'w1',
    app: { alias: 'a', name: 'A', icon: 'icon-umbraco', content: { kind: 'iframe', url: 'about:blank' } },
    rect: { x: 0, y: 0, w: 400, h: 300 },
    z: 1,
    active: true,
    state: 'normal',
    ...over,
  } as UmbraDesktopWindow;
}

/** Mount the element with a window and wait for its first render. */
async function mount(window: UmbraDesktopWindow) {
  const element = document.createElement('umbradesktop-window-notices') as UmbraDesktopWindowNoticesElement;
  element.window = window;
  document.body.appendChild(element);
  await element.updateComplete;
  return element;
}

/** Every banner the element drew. */
const banners = (element: UmbraDesktopWindowNoticesElement) =>
  [...element.renderRoot.querySelectorAll('.notice')];

it('draws nothing for a clean window', async () => {
  const element = await mount(win());
  expect(banners(element).length).to.equal(0);
  element.remove();
});

it('draws nothing for a window with ordinary unsaved changes', async () => {
  const element = await mount(win({ dirty: true }));
  expect(banners(element).length).to.equal(0);
  element.remove();
});

it('draws a warning banner with both actions for a conflict', async () => {
  const element = await mount(win({ dirty: true, changedElsewhere: true }));
  const drawn = banners(element);
  expect(drawn.length).to.equal(1);
  expect(drawn[0].getAttribute('data-severity')).to.equal('warning');
  expect(drawn[0].querySelectorAll('button').length).to.equal(2);
  element.remove();
});

it('drops the banner once acknowledged', async () => {
  const element = await mount(win({ dirty: true, changedElsewhere: true, acknowledged: true }));
  expect(banners(element).length).to.equal(0);
  element.remove();
});

it('draws two banners when a document was trashed and changed', async () => {
  const element = await mount(win({ dirty: true, trashed: true, changedElsewhere: true }));
  const drawn = banners(element);
  expect(drawn.length).to.equal(2);
  expect(drawn.map((n) => n.getAttribute('data-notice'))).to.eql(['trashed', 'changed-elsewhere']);
  element.remove();
});

it('draws an error banner with one action for a deleted document', async () => {
  const element = await mount(win({ dirty: true, deleted: true }));
  const drawn = banners(element);
  expect(drawn.length).to.equal(1);
  expect(drawn[0].getAttribute('data-severity')).to.equal('error');
  expect(drawn[0].querySelectorAll('button').length).to.equal(1);
  element.remove();
});

it('caps its own height so it cannot push the body out of a short window', async () => {
  const element = await mount(win({ dirty: true, trashed: true, changedElsewhere: true }));
  const stack = element.renderRoot.querySelector('.stack') as HTMLElement;
  expect(getComputedStyle(stack).overflowY).to.equal('auto');
  expect(getComputedStyle(stack).maxHeight).to.not.equal('none');
  element.remove();
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/components/window-notices.test.ts" --node-resolve
```

Expected: module not found.

- [ ] **Step 3: Add the constant**

Append to `constants.ts`:

```ts
/**
 * Diameter of the notice badge on a taskbar button, in px, behind
 * `--umbradesktop-notice-badge-size`.
 *
 * Its own constant rather than a reuse of {@link UMBRADESKTOP_UNSAVED_MARKER_SIZE}: the titlebar
 * marker sits in a line of caption text and this one sits on the corner of an icon, so they answer
 * to different geometry even when they happen to agree on a number.
 */
export const UMBRADESKTOP_NOTICE_BADGE_SIZE = 8;

/**
 * The share of a window's height the notice stack may take before it scrolls instead of growing,
 * as a fraction.
 *
 * A cap rather than a preference. Notices never resize the window, which is not an option for a
 * maximized one anyway, so they take their height out of the body; three notices on a window near
 * the chrome's own floor would leave nothing to read. Interpolated into `.stack`'s `max-height` in
 * `window-notices.element`.
 */
export const UMBRADESKTOP_NOTICE_STACK_MAX_SHARE = 0.45;
```

- [ ] **Step 4: Add the tokens**

In `theme/types.ts`, add to `UMBRADESKTOP_TOKENS`, after the two dirty entries:

```ts
  '--umbradesktop-notice-info-color',
  '--umbradesktop-notice-warning-color',
  '--umbradesktop-notice-error-color',
  '--umbradesktop-notice-marker-size',
  '--umbradesktop-notice-background',
  '--umbradesktop-notice-text',
  '--umbradesktop-notice-border-width',
  '--umbradesktop-notice-badge-size',
```

In `theme/tokens.test.ts`, add the fifth element to the imports and to the loop:

```ts
import { UmbraDesktopWindowNoticesElement } from '../components/window-notices.element.js';
```

```ts
  for (const ctor of [
    UmbraDesktopDesktopElement,
    UmbraDesktopTaskbarElement,
    UmbraDesktopLauncherElement,
    UmbraDesktopWindowElement,
    UmbraDesktopWindowNoticesElement,
  ]) {
```

and extend that file's module comment with a sentence saying why:

```ts
 * The notice element is in this list for the same reason the other four are: it owns the
 * `--umbradesktop-notice-*` group, and a token declared in `UMBRADESKTOP_TOKENS` whose only reader
 * is a component this test does not scan reads as dead weight and fails here.
```

- [ ] **Step 5: Write the notices element**

`components/window-notices.element.ts`:

```ts
import { css, html, nothing } from '@umbraco-cms/backoffice/external/lit';
import { customElement, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMBRADESKTOP_NOTICE_STACK_MAX_SHARE } from '../constants.js';
import { windowNotices } from '../notices/notices.js';
import type { UmbraDesktopNotice, UmbraDesktopNoticeAction } from '../notices/types.js';
import type { UmbraDesktopWindow } from '../types.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import type { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';

/**
 * The strip of notices between a window's titlebar and its body.
 *
 * In the desktop's own document rather than injected into the frame, which is what lets a theme
 * style it, keeps the shell out of the backoffice's DOM, and lets it survive the window navigating
 * internally.
 *
 * Its own element rather than more markup in `window.element`, which is already the largest file in
 * the package. It owns the `--umbradesktop-notice-*` token group, which is why `tokens.test.ts`
 * scans it alongside the other four chrome components.
 */
@customElement('umbradesktop-window-notices')
export class UmbraDesktopWindowNoticesElement extends UmbLitElement {
  /** The window being described. */
  @property({ attribute: false })
  public window?: UmbraDesktopWindow;

  /** The manager the actions go through. */
  #manager?: UmbraDesktopWindowManagerContext;

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, (ctx) => {
      this.#manager = ctx ?? undefined;
    });
  }

  /**
   * The label for an action.
   * @param action The action.
   * @returns Its localized label.
   */
  #label(action: UmbraDesktopNoticeAction): string {
    if (action === 'acknowledge') return this.localize.term('umbraDesktop_noticeKeepMine');
    if (action === 'discard-and-load') return this.localize.term('umbraDesktop_noticeDiscardMine');
    return this.localize.term('umbraDesktop_noticeCloseWindow');
  }

  /**
   * Run an action against the window this strip belongs to.
   *
   * `discard-and-load` goes to the workspace's own `reload()` through the manager's subjects rather
   * than reloading the iframe: an iframe reload would cost the editor their scroll position, the
   * open tab and any split view, all of which survive a workspace reload. It asks nothing first,
   * because the button already says what it does.
   * @param action The action to run.
   */
  async #run(action: UmbraDesktopNoticeAction): Promise<void> {
    const id = this.window?.id;
    if (!id || !this.#manager) return;
    if (action === 'acknowledge') {
      await this.#manager.acknowledge(id);
      return;
    }
    if (action === 'close') {
      await this.#manager.requestClose(id);
      return;
    }
    for (const subject of this.#manager.subjectsOf(id)) await subject.reload();
    this.#manager.setServerState(id, { changedElsewhere: false, trashed: false });
  }

  /**
   * One notice.
   * @param notice The notice to draw.
   * @returns Its template.
   */
  #renderNotice(notice: UmbraDesktopNotice) {
    return html`<div class="notice" data-severity=${notice.severity} data-notice=${notice.id}>
      <strong class="title">${this.localize.term(notice.title)}</strong>
      <span class="body">${this.localize.term(notice.body)}</span>
      ${notice.actions.length
        ? html`<span class="actions">
            ${notice.actions.map(
              (action) =>
                html`<button type="button" @click=${() => void this.#run(action)}>
                  ${this.#label(action)}
                </button>`,
            )}
          </span>`
        : nothing}
    </div>`;
  }

  override render() {
    const w = this.window;
    if (!w) return nothing;
    const banners = windowNotices(w).filter((notice) => notice.banner);
    if (!banners.length) return nothing;
    return html`<div class="stack">${banners.map((notice) => this.#renderNotice(notice))}</div>`;
  }

  static override styles = [
    css`
      :host {
        display: block;
        flex: none;
      }
      /* Capped rather than allowed to grow: notices take their height out of the body, so three of
         them on a window near the chrome's own floor would leave nothing to read. The share is a
         constant this file interpolates, so the number is stated once. */
      .stack {
        display: flex;
        flex-direction: column;
        max-height: ${UMBRADESKTOP_NOTICE_STACK_MAX_SHARE * 100}vh;
        overflow-y: auto;
      }
      .notice {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: var(--uui-size-space-2);
        padding: var(--uui-size-space-3) var(--uui-size-space-4);
        background: var(--umbradesktop-notice-background, var(--uui-color-warning));
        color: var(--umbradesktop-notice-text, var(--uui-color-warning-contrast));
        border-bottom: var(--umbradesktop-notice-border-width, 1px) solid
          var(--umbradesktop-notice-warning-color, var(--uui-color-warning-standalone));
        font-size: var(--uui-type-small-size);
      }
      /* Severity is expressed by swapping which colour the shared surface tokens fall back to, so a
         theme that sets only `--umbradesktop-notice-background` still gets both levels right. */
      .notice[data-severity='error'] {
        background: var(--umbradesktop-notice-background, var(--uui-color-danger));
        color: var(--umbradesktop-notice-text, var(--uui-color-danger-contrast));
        border-bottom-color: var(--umbradesktop-notice-error-color, var(--uui-color-danger-standalone));
      }
      .title {
        flex: 1 1 100%;
      }
      .actions {
        display: inline-flex;
        flex-wrap: wrap;
        gap: var(--uui-size-space-2);
      }
      .actions button {
        font: inherit;
        color: inherit;
        cursor: pointer;
        padding: var(--uui-size-space-1) var(--uui-size-space-3);
        background: transparent;
        border: var(--umbradesktop-notice-border-width, 1px) solid currentColor;
        border-radius: var(--uui-border-radius, 3px);
      }
    `,
  ];
}

export default UmbraDesktopWindowNoticesElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-window-notices': UmbraDesktopWindowNoticesElement;
  }
}
```

Match the import specifiers and the `declare global` pattern to whatever `window.element.ts` already
uses, since those are the ones known to resolve in this build.

- [ ] **Step 6: Render it, and give the marker its severity**

In `components/window.element.ts`:

Add the imports:

```ts
import './window-notices.element.js';
import { windowNotices, worstSeverity } from '../notices/notices.js';
```

No new element state is needed for the spinning glyph: `refreshing` is on the window model, so the
element reads `w.refreshing` and both refresh paths (the router's silent refresh of a clean window,
and the banner's discard action) reach it through the manager without an event of their own.

Replace the marker template in `render()`:

```ts
            ${(() => {
              const worst = worstSeverity(windowNotices(w));
              if (!worst) return '';
              // One slot, three severities. The class stays `.dirty` because all five themes style
              // it, `unsaved-marker.test.ts` keys off it and `docs/theming.md` documents it for
              // readers outside this repository: renaming it would silently drop every theme's
              // styling. Severity arrives as a modifier instead.
              const label =
                worst === 'info'
                  ? this.localize.term('umbraDesktop_unsavedChanges')
                  : this.localize.term(windowNotices(w)[0].title);
              return html`<span
                class="dirty notice-${worst}"
                title=${label}
                aria-label=${label}></span>`;
            })()}
```

Give the reload glyph the refresh state, replacing `${this._loading ? 'busy' : ''}`:

```ts
                  class="ctrl ctrl-reload ${this._loading || w.refreshing ? 'busy' : ''}"
```

Render the stack directly above `.bodywrap`:

```ts
        <umbradesktop-window-notices .window=${w}></umbradesktop-window-notices>
        <div class="bodywrap">
```

Add the severity colours to the marker's CSS, directly after the existing `.dirty` block:

```ts
      /* Severity on the one marker slot. `info` chains to the existing dirty token, so a theme that
         has never heard of notices keeps painting exactly what it painted before. */
      .dirty.notice-info {
        background: var(
          --umbradesktop-notice-info-color,
          var(--umbradesktop-titlebar-dirty-color, var(--umbradesktop-titlebar-text, var(--uui-color-text)))
        );
      }
      .dirty.notice-warning {
        background: var(--umbradesktop-notice-warning-color, var(--uui-color-warning-standalone));
      }
      .dirty.notice-error {
        background: var(--umbradesktop-notice-error-color, var(--uui-color-danger-standalone));
      }
      .dirty.notice-warning,
      .dirty.notice-error {
        width: var(--umbradesktop-notice-marker-size, var(--umbradesktop-titlebar-dirty-size, ${UMBRADESKTOP_UNSAVED_MARKER_SIZE}px));
        height: var(--umbradesktop-notice-marker-size, var(--umbradesktop-titlebar-dirty-size, ${UMBRADESKTOP_UNSAVED_MARKER_SIZE}px));
      }
```

Finally, make the banner's discard action spin the same glyph. In `window-notices.element.ts`,
`#run`'s `discard-and-load` branch becomes:

```ts
    this.#manager.setRefreshing(id, true);
    try {
      for (const subject of this.#manager.subjectsOf(id)) await subject.reload();
      // Both flags, because loading their version resolves both facts at once: the conflict is gone
      // and, if the node was in the bin, the reload has just brought back its current state.
      this.#manager.setServerState(id, { changedElsewhere: false, trashed: false });
    } finally {
      this.#manager.setRefreshing(id, false);
    }
```

replacing the two lines shown in step 5.

- [ ] **Step 7: Run it and watch it pass**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/components/window-notices.test.ts" --node-resolve
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/theme/tokens.test.ts" --node-resolve
```

Expected: 7 passing, and the token scan passing with the eight new names.

- [ ] **Step 8: Extend the window's own marker test**

Append to `components/window-dirty.test.ts`:

```ts
it('paints the marker at the worst severity present', async () => {
  manager.setDirty(id, true);
  manager.setServerState(id, { changedElsewhere: true });
  element.window = manager.getWindows()[0];
  await element.updateComplete;
  const marker = element.renderRoot.querySelector('.dirty');
  expect(marker?.classList.contains('notice-warning')).to.equal(true);
});

it('paints the marker on a clean window whose document was deleted', async () => {
  manager.setServerState(id, { deleted: true });
  element.window = manager.getWindows()[0];
  await element.updateComplete;
  const marker = element.renderRoot.querySelector('.dirty');
  expect(marker?.classList.contains('notice-error')).to.equal(true);
});
```

using the file's existing mount helpers and its name for the window id.

- [ ] **Step 9: Run both gates**

```bash
cd src/Umbraco.Community.UmbraDesktop && npm run build && npm test
```

---

## Task 12: The taskbar badge

**Files:**
- Modify: `components/taskbar.element.ts`
- Test: `components/desktop-chrome.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `components/desktop-chrome.test.ts`:

```ts
describe('the notice badge on a task button', () => {
  /**
   * Design D4: the taskbar carries warnings and errors, not info. Issue #20 decided the unsaved dot
   * stays out of the taskbar and that decision is right for its state: the editor caused it and
   * knows about it. Nobody causes a conflict, it arrives while you are elsewhere, and a warning on
   * a minimized window you cannot see is not a warning.
   */

  /**
   * A manager whose keep-mine confirmation answers yes without a modal, following `ProbeManager` in
   * `window-dirty.test.ts`. A modal manager context only resolves inside a booted backoffice.
   */
  class BadgeProbe extends UmbraDesktopWindowManagerContext {
    protected override async _askToKeepMine(): Promise<boolean> {
      return true;
    }
  }

  /** Mount a taskbar over a manager and return both. */
  async function mountTaskbar() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const manager = new BadgeProbe(new UmbElementControllerHost(host));
    new UmbContextProvider(host, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, manager).hostConnected();
    const taskbar = document.createElement('umbradesktop-taskbar') as UmbraDesktopTaskbarElement;
    host.appendChild(taskbar);
    await taskbar.updateComplete;
    manager.open(APP);
    await taskbar.updateComplete;
    return { host, manager, taskbar, id: manager.getWindows()[0].id };
  }

  /** The badge on the first task button, if any. */
  const badge = (taskbar: UmbraDesktopTaskbarElement) =>
    taskbar.renderRoot.querySelector('.task .notice-badge');

  it('draws no badge for a window with ordinary unsaved changes', async () => {
    const { host, manager, taskbar, id } = await mountTaskbar();
    manager.setDirty(id, true);
    await taskbar.updateComplete;
    expect(badge(taskbar)).to.equal(null);
    host.remove();
  });

  it('draws a badge for a conflict', async () => {
    const { host, manager, taskbar, id } = await mountTaskbar();
    manager.setDirty(id, true);
    manager.setServerState(id, { changedElsewhere: true });
    await taskbar.updateComplete;
    expect(badge(taskbar)?.getAttribute('data-severity')).to.equal('warning');
    host.remove();
  });

  it('keeps the badge after the conflict is acknowledged', async () => {
    // The point of acknowledging is that the window stops shouting, not that it starts looking
    // safe: a minimized window that will overwrite somebody still has to say so.
    const { host, manager, taskbar, id } = await mountTaskbar();
    manager.setDirty(id, true);
    manager.setServerState(id, { changedElsewhere: true });
    await manager.acknowledge(id);
    await taskbar.updateComplete;
    expect(badge(taskbar)?.getAttribute('data-severity')).to.equal('warning');
    host.remove();
  });

  it('draws an error badge for a deleted document', async () => {
    const { host, manager, taskbar, id } = await mountTaskbar();
    manager.setServerState(id, { deleted: true });
    await taskbar.updateComplete;
    expect(badge(taskbar)?.getAttribute('data-severity')).to.equal('error');
    host.remove();
  });

  it('names the state in the button accessible name, so colour is not the only carrier', async () => {
    const { host, manager, taskbar, id } = await mountTaskbar();
    manager.setDirty(id, true);
    manager.setServerState(id, { changedElsewhere: true });
    await taskbar.updateComplete;
    const button = taskbar.renderRoot.querySelector('.task') as HTMLElement;
    expect(button.getAttribute('title')).to.contain('changed');
    host.remove();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/components/desktop-chrome.test.ts" --node-resolve
```

Expected: FAIL, no `.notice-badge`.

- [ ] **Step 3: Add the badge**

In `components/taskbar.element.ts`, add the imports:

```ts
import { UMBRADESKTOP_NOTICE_BADGE_SIZE } from '../constants.js';
import { windowNotices, worstSeverity } from '../notices/notices.js';
```

Replace the task button template:

```ts
              (w) => {
                const notices = windowNotices(w);
                const worst = worstSeverity(notices);
                // Design D4: warnings and errors reach the taskbar, info does not.
                const badge = worst === 'warning' || worst === 'error' ? worst : undefined;
                const name = this.localize.string(w.app.name);
                // The words, not just the colour: this is the accessible name and the tooltip, so
                // the state is readable to a screen reader and on a monochrome display.
                const label = badge ? `${name} — ${this.localize.term(notices[0].title)}` : name;
                return html`
                  <button
                    class="task ${w.active ? 'active' : ''}"
                    title=${label}
                    aria-label=${label}
                    @click=${() => this.#onTaskClick(w)}>
                    <umb-icon name=${w.app.icon}></umb-icon>
                    <span class="task-label">${name}</span>
                    ${badge
                      ? html`<span class="notice-badge" data-severity=${badge}></span>`
                      : nothing}
                  </button>
                `;
              },
```

Import `nothing` from `@umbraco-cms/backoffice/external/lit` if the file does not already.

Add the CSS, after the `.task.active` block:

```ts
      /* Drawn INSIDE the button's own box, deliberately. '.running' keeps 'overflow: hidden' in the
         base and in every theme, so anything outside the button is clipped — the same constraint
         the active-window marker already answers to. A theme may move, reshape or resize this and
         may not remove it: 'theme/notice.test.ts' holds that over all five.

         A badge rather than a glyph after the label, because macOS and Windows 11 both set
         '.task-label { display: none }' and show icons only, so a glyph after the label would be
         invisible in two of the five. A corner badge is also each of their own notification
         idioms. */
      .task {
        position: relative;
      }
      .notice-badge {
        position: absolute;
        top: 3px;
        right: 3px;
        width: var(--umbradesktop-notice-badge-size, ${UMBRADESKTOP_NOTICE_BADGE_SIZE}px);
        height: var(--umbradesktop-notice-badge-size, ${UMBRADESKTOP_NOTICE_BADGE_SIZE}px);
        border-radius: 50%;
        background: var(--umbradesktop-notice-warning-color, var(--uui-color-warning-standalone));
      }
      .notice-badge[data-severity='error'] {
        background: var(--umbradesktop-notice-error-color, var(--uui-color-danger-standalone));
      }
```

`.task` already has `display: inline-flex` and no `position`, so adding `position: relative` to the
existing rule rather than a second block is equivalent; keep whichever reads better against the
file's existing ordering.

- [ ] **Step 4: Run it and watch it pass**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/components/desktop-chrome.test.ts" --node-resolve
```

Expected: existing tests plus 5 new.

- [ ] **Step 5: Run both gates**

```bash
cd src/Umbraco.Community.UmbraDesktop && npm run build && npm test
```

---

## Task 13: Five themes, and the test that holds them

**Files:**
- Create: `theme/notice.test.ts`
- Modify: `theme/themes/umbraco4/{window,taskbar}.css.ts`
- Modify: `theme/themes/macos/{window,taskbar}.css.ts`
- Modify: `theme/themes/win11/{window,taskbar}.css.ts`
- Modify: `theme/themes/win98/{window,taskbar}.css.ts`

The Umbraco theme ships no window stylesheet at all, being the base, and needs no change: the
fallbacks in Task 11 are its expression.

- [ ] **Step 1: Write the failing test**

`theme/notice.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import { UMBRADESKTOP_THEMES } from './themes/index.js';

/**
 * *A theme may restyle, never remove*, held for the notice surfaces across all five themes. The
 * general form of `theme/unsaved-marker.test.ts`, which does the same for the `info` marker.
 *
 * Three surfaces, and each fails differently, which is why each is checked rather than one standing
 * in for the others: hiding a banner leaves the editor unwarned, starving a badge leaves a
 * minimized window silent, and painting a severity colour into its own background leaves a marker
 * that is present, sized and invisible.
 */

/** Declarations that would take a surface away rather than restyle it. */
const REMOVALS = [
  /display\s*:\s*none/,
  /visibility\s*:\s*hidden/,
  /opacity\s*:\s*0(?!\.[1-9])/,
  /content\s*:\s*none/,
  /(width|height)\s*:\s*0(?:px)?\s*[;}]/,
];

/** Every rule block in a stylesheet whose selector mentions one of the given class names. */
function rulesFor(cssText: string, selectors: ReadonlyArray<string>): string[] {
  return cssText
    .split('}')
    .filter((block) => {
      const selector = block.split('{')[0] ?? '';
      return selectors.some((name) => new RegExp(`(^|[\\s,>+~])\\.${name}\\b`).test(selector));
    })
    .map((block) => `${block}}`);
}

for (const theme of UMBRADESKTOP_THEMES) {
  it(`does not let the ${theme.name} theme remove a notice banner`, async () => {
    const sheets = await theme.sheets?.();
    for (const rule of rulesFor(sheets?.window?.cssText ?? '', ['notice', 'stack'])) {
      for (const removal of REMOVALS) {
        expect(removal.test(rule), `the ${theme.name} theme hides a notice: ${rule.trim()}`).to.equal(
          false,
        );
      }
    }
  });

  it(`does not let the ${theme.name} theme remove the taskbar badge`, async () => {
    const sheets = await theme.sheets?.();
    for (const rule of rulesFor(sheets?.taskbar?.cssText ?? '', ['notice-badge'])) {
      for (const removal of REMOVALS) {
        expect(
          removal.test(rule),
          `the ${theme.name} theme hides the taskbar badge: ${rule.trim()}`,
        ).to.equal(false);
      }
    }
  });

  it(`does not let the ${theme.name} theme remove a severity from the marker`, async () => {
    const sheets = await theme.sheets?.();
    for (const rule of rulesFor(sheets?.window?.cssText ?? '', [
      'dirty\\.notice-warning',
      'dirty\\.notice-error',
    ])) {
      for (const removal of REMOVALS) {
        expect(
          removal.test(rule),
          `the ${theme.name} theme hides a severity marker: ${rule.trim()}`,
        ).to.equal(false);
      }
    }
  });

  it(`does not let the ${theme.name} theme paint a severity into nothing`, () => {
    for (const variant of ['light', 'dark'] as const) {
      const palette = theme.palettes[variant];
      if (!palette) continue;
      for (const token of [
        '--umbradesktop-notice-warning-color',
        '--umbradesktop-notice-error-color',
      ] as const) {
        const colour = palette[token];
        if (!colour) continue;
        expect(
          colour.trim().toLowerCase(),
          `${theme.name} (${variant}) paints ${token} in nothing`,
        ).to.not.be.oneOf(['transparent', 'rgba(0, 0, 0, 0)', 'none']);
        expect(
          colour.trim().toLowerCase(),
          `${theme.name} (${variant}) paints ${token} into its own notice background`,
        ).to.not.equal(palette['--umbradesktop-notice-background']?.trim().toLowerCase());
      }
    }
  });

  it(`does not let the ${theme.name} theme size the badge or the severity marker away`, () => {
    for (const variant of ['light', 'dark'] as const) {
      const palette = theme.palettes[variant];
      if (!palette) continue;
      for (const token of [
        '--umbradesktop-notice-badge-size',
        '--umbradesktop-notice-marker-size',
      ] as const) {
        const size = palette[token];
        if (!size) continue;
        expect(parseFloat(size), `${theme.name} (${variant}) sizes ${token} to nothing`).to.be.greaterThan(0);
      }
    }
  });
}
```

- [ ] **Step 2: Run it and watch it pass trivially, then make it meaningful**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/theme/notice.test.ts" --node-resolve
```

Expected: 25 passing, all vacuously, because no theme mentions a notice yet. That is the correct
starting state for a removal test: it is the theme edits below that give it something to check, and
it will catch the first theme that tries to hide one.

- [ ] **Step 3: Umbraco 4**

Append to `theme/themes/umbraco4/window.css.ts`:

```css
  /* A ruled strip on the panel ground, which is how this theme separates everything else. */
  .notice {
    background: var(--umbradesktop-notice-background, #f7f5f1);
    color: var(--umbradesktop-notice-text, #2b2b2b);
    border-bottom-width: 2px;
  }
```

Append to `theme/themes/umbraco4/taskbar.css.ts`:

```css
  /* This theme's task buttons carry a 1px border, so the badge sits on the corner of the border
     rather than inside the padding, where the label would crowd it. */
  .notice-badge {
    top: -2px;
    right: -2px;
    box-shadow: 0 0 0 1px #ebe8e2;
  }
```

- [ ] **Step 4: macOS**

Append to `theme/themes/macos/window.css.ts`:

```css
  /* Translucent sheet over the window's own ground, as this theme's sheets are. */
  .notice {
    background: var(--umbradesktop-notice-background, rgba(255, 255, 255, 0.82));
    color: var(--umbradesktop-notice-text, #1c1c1e);
    backdrop-filter: saturate(180%) blur(20px);
  }
  .notice .actions button {
    border-radius: 6px;
  }
```

Append to `theme/themes/macos/taskbar.css.ts`:

```css
  /* The dock's own badge idiom: a larger dot riding the tile's top-trailing corner, ringed in the
     dock's ground so it reads as attached to the tile rather than painted on the icon. The dock
     shows icons only, so this is the whole of the carrier here besides the accessible name. */
  .notice-badge {
    top: -3px;
    right: -3px;
    width: 12px;
    height: 12px;
    box-shadow: 0 0 0 2px var(--umbradesktop-taskbar-background-opaque, #e9e9ef);
  }
```

- [ ] **Step 5: Windows 11**

Append to `theme/themes/win11/window.css.ts`:

```css
  .notice {
    background: var(--umbradesktop-notice-background, rgba(255, 244, 206, 0.92));
    color: var(--umbradesktop-notice-text, #1a1a1a);
    border-bottom-width: 1px;
  }
  .notice .actions button {
    border-radius: 4px;
  }
```

Append to `theme/themes/win11/taskbar.css.ts`:

```css
  /* Bottom-trailing rather than top-trailing: the top of a Windows 11 task button is where the
     window preview flyout points from, and the accent underline that means "active" already owns
     the centre of the bottom edge, so the corner is the free space. */
  .notice-badge {
    top: auto;
    bottom: 4px;
    right: 4px;
    box-shadow: 0 0 0 1.5px var(--umbradesktop-taskbar-background-opaque, #f3f3f3);
  }
```

- [ ] **Step 6: Windows 98**

Append to `theme/themes/win98/window.css.ts`:

```css
  /* No alpha, no rounding, no shadow: a sunken well with a bevelled edge, which is the only way
     this theme says "read this". The severity colours come from the 16-colour palette, and the
     banner keeps black text on them because that is what a Win98 dialog does. */
  .notice {
    background: var(--umbradesktop-notice-background, ${WIN98_FACE});
    color: var(--umbradesktop-notice-text, ${WIN98_TEXT});
    border-bottom: none;
    box-shadow: ${WIN98_BEVEL_SUNKEN};
    margin: 2px;
    padding: 4px 6px;
  }
  .notice .actions button {
    border: none;
    border-radius: 0;
    box-shadow: ${WIN98_BEVEL_RAISED};
    background: ${WIN98_FACE};
    color: ${WIN98_TEXT};
    padding: 3px 8px;
  }
  .notice .actions button:active {
    box-shadow: ${WIN98_BEVEL_PRESSED};
  }
  /* Square, not round: nothing in this theme is a circle. */
  .dirty.notice-warning,
  .dirty.notice-error {
    border-radius: 0;
  }
```

Import the bevel and colour constants this file needs from `./palette.js`, following whatever the
file already imports.

Append to `theme/themes/win98/taskbar.css.ts`:

```css
  /* A square bevelled tile rather than a dot, and drawn over the button's own raised bevel. This
     theme has labels, so the badge could have gone before the text — the corner is used anyway so
     that all five themes put it in the same place, which is what makes the base rule's geometry
     mean something. */
  .notice-badge {
    top: 2px;
    right: 2px;
    width: 6px;
    height: 6px;
    border-radius: 0;
    box-shadow: inset -1px -1px ${WIN98_DKSHADOW}, inset 1px 1px ${WIN98_HILIGHT};
  }
```

Add the severity colours to `theme/themes/win98/palette.ts`, in both the light and dark palettes,
using the 16-colour palette rather than a modern warning colour:

```ts
  '--umbradesktop-notice-warning-color': '#808000',
  '--umbradesktop-notice-error-color': '#800000',
```

- [ ] **Step 7: Run the theme tests**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/theme/*.test.ts" --node-resolve
```

Expected: PASS, including the existing `unsaved-marker.test.ts`, `tokens.test.ts` and every theme's
`metrics.test.ts`.

- [ ] **Step 8: Run both gates**

```bash
cd src/Umbraco.Community.UmbraDesktop && npm run build && npm test
```

---

## Task 14: Documentation

**Files:**
- Modify: `README.md` (repository root)
- Modify: `umbraco-marketplace.json` (repository root)
- Modify: `docs/theming.md`

- [ ] **Step 1: README, in both places it belongs**

Check every place the feature could be named, not the first one found. Add to the Features list:

```markdown
- **Warns before you overwrite someone.** If somebody else saves, bins or deletes a document while
  you have it open with unsaved changes, the window says so, in its own chrome, on its taskbar
  button and in every dialog that could throw your work away. The plain backoffice does not warn
  about this at all.
```

And a section of its own, in the same style as the existing sections. Markdown only, no raw HTML:
this file is also the NuGet package readme (`PackageReadmeFile` in the csproj) and NuGet escapes HTML
rather than rendering it, so an `<img>` tag shows up on the package page as its own source code.
Images are `![alt](url)` and cannot carry `width` or `height`, so size a screenshot by capturing it
at the size you want it.

```markdown
### Overwrite protection

Open a page in two browsers, edit both, save both, and in a plain Umbraco backoffice the second save
wins silently: nobody is told and the first person's work is gone with no trace in the UI. Umbraco
broadcasts the change over SignalR and the backoffice uses that only to drop its cached copy.

UmbraDesktop listens to the same signal and tells you. A window whose document changed while you
were reading it refreshes itself in place, keeping your scroll position, the tab you were on and any
split view. A window whose document changed while you had *unsaved changes* raises a banner in its
own chrome, marks its titlebar and marks its taskbar button, so it reaches you on a window you had
minimized an hour ago. You can keep your version, after confirming that saving loses the other
person's change, or load theirs and lose yours.

It knows the difference between somebody else's save and your own, including your own publishes, and
it says something different when a document has been moved to the recycle bin (where saving still
works) than when it has been deleted for good (where it cannot).

Every theme carries it in its own idiom, and no theme is allowed to remove it.
```

- [ ] **Step 2: The marketplace listing**

In `umbraco-marketplace.json`, add to `Description`. This is the summary the Umbraco Marketplace
shows and the only thing most people read before installing, so a headline safety feature missing
from it is a feature nobody knows exists:

```
Warns you before you overwrite another editor's work, which the backoffice itself does not do.
```

Add to `Tags`:

```json
"concurrency", "collaboration", "overwrite protection"
```

If the feature changes what the package looks like, capture a screenshot of a window carrying the
banner into `docs/screenshots/` and add it to the `Screenshots` array.

- [ ] **Step 3: The theming guide**

In `docs/theming.md`, add the eight tokens to its table, in the same style as the rows already there:

| Token | What it paints |
| --- | --- |
| `--umbradesktop-notice-info-color` | The titlebar marker for unsaved changes. Chains to `--umbradesktop-titlebar-dirty-color`, so a theme that sets only the older token is already correct |
| `--umbradesktop-notice-warning-color` | The marker and the taskbar badge when something is wrong but recoverable: the document changed elsewhere, or it is in the recycle bin |
| `--umbradesktop-notice-error-color` | The same two surfaces when the document has been deleted for good |
| `--umbradesktop-notice-marker-size` | Diameter of the titlebar marker at `warning` and `error`. Chains to `--umbradesktop-titlebar-dirty-size` |
| `--umbradesktop-notice-background` | The banner's ground |
| `--umbradesktop-notice-text` | The banner's text, which is the theme's business because only the theme knows what reads on its own ground |
| `--umbradesktop-notice-border-width` | The banner's rule and its buttons' borders, so a theme can frame rather than tint |
| `--umbradesktop-notice-badge-size` | The taskbar badge |

And a short subsection on the two traps, next to the existing §5 and §6.3 warnings:

```markdown
### The notice badge must be drawn inside the button

`.running` keeps `overflow: hidden` in the base stylesheet and in every shipped theme, so a badge
positioned outside `.task`'s own box is clipped and simply never appears. The active-window marker
answers to the same constraint. Move the badge within the button, do not move it out of it.

### The badge cannot be a glyph after the label

The macOS and Windows 11 themes both set `.task-label { display: none }` and show icons only, so a
warning appended to the label is invisible in two of the five themes. Whatever a theme does with the
badge, it has to work on a button that shows nothing but an icon.
```

- [ ] **Step 4: Run both gates**

```bash
cd src/Umbraco.Community.UmbraDesktop && npm run build && npm test
```

---

## Task 15: Browser verification

Part of done, and not part of the suite. Two Umbraco instances or two browser profiles are needed;
see the `umbraco-parallel-test-instance` note about browsing a second instance on `127.0.0.1` rather
than `localhost` so the two do not share a session cookie.

- [ ] **Step 1: A colleague's save reaches the right window**

Open the same document in two desktop windows. Type in the first, save the second, and confirm the
first raises the banner, marks its titlebar and marks its taskbar button, while the second raises
nothing at all.

- [ ] **Step 2: A second browser session**

Open a document in a desktop window and type. Change the same document from a second browser
profile. Confirm the banner appears.

- [ ] **Step 3: Publishing your own document raises nothing**

The case that a submit-path suppression would have broken, and the reason the design asks the server
instead. Open a document, edit it, and press **Save and publish**. Confirm no banner, no titlebar
severity marker and no taskbar badge appear at any point, including in the moment between the
SignalR event and the save's HTTP response.

Repeat for **Save**, **Schedule** and **Unpublish**.

- [ ] **Step 4: A clean window refreshes in place**

Open a document in a window, scroll down, open a second tab within the workspace, and enable split
view. Change the document from another session. Confirm the content updates, the reload glyph spins
while it happens, and the scroll position, the open tab and the split view all survive.

- [ ] **Step 5: The recycle bin, then the bin emptied**

Open a document in a window and type. From another session, move it to the recycle bin. Confirm the
trashed banner appears and warns that the window will stop accepting changes once it reloads. Then
empty the recycle bin and confirm the error banner appears, the content stays readable, and the
frame can still navigate somewhere else.

- [ ] **Step 6: The guards**

With one conflicted window and two ordinary dirty ones, confirm the Exit dialog reads "3 windows have
unsaved changes, 1 of them has also been changed by someone else." Close the conflicted window and
confirm the inverted wording. Close a deleted window and confirm it asks nothing.

- [ ] **Step 7: All five themes, both variants**

For each of Umbraco, Umbraco 4, macOS, Windows 11 and Windows 98, in light and dark: the marker at
`info`, `warning` and `error`, a banner with its buttons, and the taskbar badge. Confirm nothing is
clipped, nothing is invisible, and the Windows 98 severity colours stay inside its palette.

- [ ] **Step 8: Write down anything the build taught you**

Repo convention, and the last item on the definition of done: anything not obvious from the code
goes where the next person will hit it, not in a commit message.

---

## Definition of done

- [ ] `npm run build` and `npm test` both pass
- [ ] Every step of Task 15 walked, including the publish case
- [ ] `README.md` names the feature in the Features list **and** in its own section, Markdown only
- [ ] `umbraco-marketplace.json` names it in `Description` and `Tags`, with a screenshot if the
      package's appearance changed
- [ ] `docs/theming.md` carries the eight tokens and both traps
- [ ] Phase 2 (§10, the diff panel) deliberately not started
- [ ] Work left uncommitted for review

---

## What the plan got wrong

Recorded because CLAUDE.md's last definition-of-done item asks for it: anything a build taught you
that is not obvious from the code, written where the next person will hit it. Every one of these was
found by an implementer or a reviewer working from the steps above, and every one is fixed in the
code. They are listed so that a reader who trusts a step's code block knows which ones not to.

**Two would have shipped as behaviour rather than as a build failure.**

1. **Task 8's `let reported: string | undefined`.** `track` registers its entry in the map before
   subscribing, deliberately, so the first `evaluate` runs while both halves are still `undefined`
   and computes the signature of an empty frame. Against an unset baseline that reads as a change,
   so every window would have reported the moment its frame loaded, which is the "never on start"
   rule the comparison exists to keep. The old boolean version was safe only because `false`
   happened to be the empty state's answer. Fixed by seeding from a `signatureOf` helper, which also
   removes the duplicated literal.
2. **Task 7's guard keyed the inverted wording on severity.** Trashed is a `warning` too, so a
   window whose document was merely binned was told "closing is the safe option" when a trashed
   document cannot be saved from that window at all and closing loses only the editor's own work.
   It keys on `changedElsewhere` now, which is the fact that decides which of the two things
   closing does.

**Five were build failures against this repository's configuration.**

3. `new Error(msg, { cause })` needs ES2022 and this project's lib is ES2020, so Task 9's test does
   not compile. `Object.assign(new Error(msg), { cause })` is behaviour-identical.
4. **A backtick inside a `css` tagged template closes the literal**, and Task 11's CSS comments quote
   token names in backticks. It fails several lines from the real cause and kills the whole module.
   Every existing comment in these stylesheets uses single quotes, and now the reason is written
   down.
5. Task 13's Windows 98 CSS omits `unsafeCSS(...)` around every interpolated string constant.
   `docs/theming.md` §2 already says a plain string in a `css` interpolation throws at import time;
   the step's own code contradicted it.
6. Task 11's `win()` test helper omits `app.chromeProfile`, which is required, and the `as` cast
   cannot bridge it. `npm test` would never have caught it, because the test runner does not
   type-check.
7. Task 1's `doc()` helper accepted an override argument and never spread it, which made three of
   its own assertions unsatisfiable.

**Two ordering mistakes.**

8. **Task 11 must add seven tokens, not eight.** `theme/tokens.test.ts` asserts the token list and
   the chrome CSS agree exactly in both directions, so `--umbradesktop-notice-badge-size` fails that
   test until Task 12 adds the badge that reads it. The badge constant moves with it.
9. **Task 6 depends on Task 7.** The plan had Task 6 knowingly failing its own build gate on a
   manager method Task 7 adds. They were run in the other order.

**Three bugs the plan did not contain but the design missed, found in review.**

10. **`acknowledged` was never cleared**, so after one acknowledgement every later conflict on that
    window was bannerless. **`changedElsewhere` survived a save**, so the editor's next keystroke
    raised a phantom warning. One rule fixes both: a clean window has no conflict, because the only
    ways to become clean are saving and discarding and both end the argument.
11. **`trashed` and `deleted` outlived the document they described.** In-window navigation is not an
    iframe load, so a window that moved from a deleted node A to a node B stayed flagged `deleted` —
    and `confirmDiscard` returns early for a deleted window, so closing it discarded unsaved work on
    B with no prompt. That is a regression of the guard this feature is built beside. They are now
    cleared when the reported subject set changes to a different non-empty one; transitions through
    the empty set do not clear, because a frame reload passes `[]` and a deleted document should
    keep saying so.
12. **Nothing adopted the theme stylesheet into the notices element**, so all four themes' `.notice`
    rules were valid and never applied, and every theme rendered one identical banner. Custom
    properties inherit through a shadow boundary and stylesheets do not, so a nested custom element
    needs its own `UmbraDesktopThemeStyles`. `theme/notice.test.ts` could not catch it, because it
    scans theme CSS as text and passes happily over CSS that never applies.

**And one that was already there.** `window-manager.test.ts`'s subject test scanned the serialised
window for the marker `'a1'`, and a window's `id` is a `crypto.randomUUID()` whose 31 hex characters
contain any given pair about one run in nine. It was the unexplained intermittent failure seen twice
during this build. The marker is now `'zz-subject-marker'`, which cannot occur in a UUID.
