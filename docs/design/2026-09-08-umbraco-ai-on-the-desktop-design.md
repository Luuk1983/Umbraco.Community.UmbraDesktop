# Umbraco AI on the desktop — Design

> One chat, opened from the taskbar, which is Umbraco's own Copilot Workspace in a window. It needs
> nothing open to work, so nothing on the desktop is bound to it. The desktop gives it two things
> the backoffice cannot: answers that open as windows, and a description of what you have on your
> desk. In return the desktop keeps itself honest, because an AI that writes on the server means the
> page in your window can change while you are looking at it.

- **Status:** Approved design / pre-implementation
- **Date:** 2026-09-08
- **Issue:** [#9](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/9)
- **Target:** Umbraco CMS **v17**, package `Umbraco.Community.UmbraDesktop`
- **Requires:** `Umbraco.AI` **17.4** for anything AI-shaped here (`17.4.0-rc.2` at the time of
  writing; `18.4.0-rc.2` on the v18 line). §8 is the exception and needs no AI at all.
- **§7 is superseded** by [the overwrite guard design](2026-09-08-overwrite-guard-design.md), which
  is where that work is actually specified. Build from there, not from §7.

---

## 1. Goal & scope

Issue #9 said "Umbraco AI obviously is awesome, maybe we can integrate it better", and guessed the
new Copilot workspace could be a separate thing in the backoffice. Refining it turned up two facts
that between them settle most of the design, and both are in §2.

**In scope**

- The **Copilot Workspace** as an ordinary desktop app, launched from the taskbar (§4).
- A frontend tool so the agent can **open, focus and arrange windows**, which turns an answer into
  work you can start (§5).
- A request-context contributor that tells the agent **what is on the desk** (§6).
- The desktop **staying honest** when content changes underneath an open window, whoever changed
  it, including the dangerous case where the window also has unsaved changes (§7, §8).
- **Seeing what changed**, so the warning in that dangerous case can be acted on rather than merely
  believed (§7.6). The shape of it is refined in its own session before it is built.

**Out of scope, and deliberately so**

- Any chat bound to a single window, any AI button in a window's titlebar. See D2.
- Reading a window's unsaved edits, or letting the AI type into an open editor. See D14.
- A chat surface built out of `@umbraco-ai/agent-ui`. See D1.

**Everything here is frontend.** No C# is added: no controllers, no DTOs, no migrations, no
OpenAPI client regeneration. The global rule "test-first for all backend code" therefore has
nothing to bind to, and §10 sets out the frontend testing approach instead.

---

## 2. What Umbraco AI actually ships

Written down because it took a day to establish, none of it is in the product documentation yet,
and two of the facts invert what the issue assumed. Read from
[umbraco/Umbraco.AI](https://github.com/umbraco/Umbraco.AI) at tag `Umbraco.AI@18.4.0-rc.2`.

### 2.1 There are two chat surfaces, not one

**The Copilot sidebar** (`Umbraco.AI.Agent.Copilot`) is a `headerApp` button plus a
`position: fixed`, 450px panel that a `backofficeEntryPoint` appends to the app shadow root. The
panel sets `document.body.style.marginInlineEnd` while open. Its button is gated by a custom
condition, `UmbracoAIAgent.Condition.CopilotSection`, which permits only sections that registered a
`uaiCopilotCompatibleSection` manifest; Content and Media register one. It resolves what you are
editing through a workspace registry and per-entity-type adapters, and it forgets everything when
closed (`close()` aborts the run and resets the conversation).

**The Copilot Workspace** (`Umbraco.AI.Agent.Copilot.Workspace`, new in 17.4) is a standalone
section, alias `Uai.Section.CopilotWorkspace`, pathname `copilot-workspace`, gated by
`Umb.Condition.SectionUserPermission`. It has persisted
conversations (per user, pinned/archived, auto-titled, and the conversation id *is* the AG-UI
thread id), projects that group conversations and share instructions and attachments, and
attachments at both project and conversation scope carrying a `ResourceTypeId` of `content` or
`media` with an injection mode of Always or OnDemand.

Its deep links, from the package's own `paths.ts`:

```
/section/copilot-workspace/conversation/{id}
/section/copilot-workspace/conversation/create[?projectId={id}]
/section/copilot-workspace/project/{id}
```

Its management API is named `ai-copilot-workspace-management`.

### 2.2 Every tool that reads is server-side. So is every tool that writes, as of 17.4

This is the fact that decides the design. The `[AITool]` set at the RC tag:

| Reads | Writes |
| --- | --- |
| `search_umbraco`, `semantic_search`, `get_umbraco_content`, `get_umbraco_content_children`, `get_content_by_route`, `get_content_tree_path`, `get_content_type_schema`, `get_property_value_schema`, `get_umbraco_media`, `list_context_resources`, `get_context_resource`, `fetch_webpage`, `list_automations`, `get_automation_run` | `create_umbraco_content`, `update_umbraco_content`, `set_umbraco_content_value`, `clear_umbraco_content_value`, `add_umbraco_content_item`, `move_umbraco_content_item`, `remove_umbraco_content_item`, `publish_umbraco_content`, `unpublish_umbraco_content`, `delete_umbraco_content`, `create_umbraco_media`, `update_umbraco_media`, `delete_umbraco_media`, `run_automation` |

On `v18/dev` the write half does not exist and the only way to change content was the sidebar's
browser-side tools typing into an open workspace. In 17.4 the agent can create, edit, publish and
delete with **nothing open**. Tools declare a scope, `content-write` is marked `IsDestructive`, and
`AIAgentExecutionOptions.ApprovalPolicy` defaults to `DenyAll` but is overridden to `Interactive`
on the AG-UI streaming path, so in a chat a destructive tool pauses and asks.

### 2.3 What is extensible, and what is closed

| Seam | Type | Open to us? |
| --- | --- | --- |
| Sidebar section gating | `uaiCopilotCompatibleSection` manifest | Yes, documented for third parties in its own JSDoc |
| Sidebar control | `UAI_COPILOT_CONTEXT` from `@umbraco-ai/agent-copilot` | Yes, exported public API |
| Chat toolkit | `<uai-chat>`, `UaiRunController`, `UAI_CHAT_CONTEXT` from `@umbraco-ai/agent-ui` | Yes, and its README names "building a custom chat interface" as a use case |
| Browser-side tools | `uaiAgentFrontendTool` | Yes. Note: per-surface conditions are "not implemented in the first pass", so a registered tool resolves in **every** surface |
| Tool result UI | `uaiAgentToolRenderer` | Yes |
| Per-message ambient context | `uaiRequestContextContributor`, plus an `agentSurface` kind | Yes |
| Entity serialization / staged writes | `uaiEntityAdapter` | Yes, and the adapters are explicitly duck-typed |
| **The Copilot Workspace's own elements and contexts** | — | **No.** Its `exports.ts` says it "deliberately exposes **no** reusable elements or contexts to other packages", only the aliases in `constants.ts` |

So integration with the workspace is by URL and by management API, and nothing else. That boundary
is theirs to draw, and reaching past it would break on every AI release.

### 2.4 Umbraco ships live change notifications, but nothing that refreshes an editor

Backoffice **17.6** connects to a SignalR hub at `/umbraco/serverEventHub` through a `globalContext`
(`UMB_MANAGEMENT_API_SERVER_EVENT_CONTEXT`). Events are
`{ eventSource, eventType, key, clientTimestamp }`, with sources including `Umbraco:CMS:Document`
and `Umbraco:CMS:Media`, filterable by source and type, defaulting to `Updated` and `Deleted`.

The only consumers in the whole backoffice are the two cache-invalidation managers, and all they do
is `this._dataCache.delete(event.key)` so the *next* load is fresh. Nothing refreshes an open
editor. There is no collaborative editing.

Two consequences, one good and one bad:

- We can know, reliably and immediately, that a node changed and which one. That is the hard part
  of §8, and it is free.
- The event carries **no user or client identity**, so a window cannot tell its own save from
  somebody else's. That is R1, the biggest risk in this design.

---

## 3. Settled decisions

| # | Decision | Why |
|---|---|---|
| D1 | **The base is Umbraco's Copilot Workspace, not a chat we build.** | It has persisted conversations, projects and attachments, and it is the surface Umbraco will keep investing in. Anything we built from `agent-ui` would be a copy of it without the memory. |
| D2 | **No chat is bound to a window, and no window gains an AI button.** | Once the agent can write server-side (§2.2), a per-window chat solves a problem that no longer exists, and the window-to-chat pairing was the part that read as bolted on. |
| D3 | **The workspace app opens in `full-section` chrome.** | `workspace-only` would leave an empty 240–460px gutter: `buildSidebarCss` hides `umb-section-sidebar` and then repositions `umb-section-main` to cover the reserved grid column, and that section's shell has no `umb-section-main`; it is a bespoke `umb-split-panel` with a `<div slot="end" class="main">`. Keeping the sidebar is right anyway, because the conversation list is the tool, as with Document Types. |
| D4 | **The desktop contributes exactly two things to the AI:** a request-context contributor describing the desk, and frontend tools that open and arrange windows. | Both are documented extension points, neither reaches into the workspace package, and both keep working if the workspace's internals change. |
| D5 | **Nothing ambient.** The desk is described **per message, as a snapshot at send time**. The conversation never holds a live reference to desk state. Anything that must outlive the message becomes a conversation attachment. | This is the answer to "what happens when I open and close windows while chatting". A snapshot in a transcript is dated and honest. A live reference silently changes what a two-hour-old conversation means, which fails in the least reproducible way possible. |
| D6 | **Staleness comes from Umbraco's server event feed, not from watching what the AI did.** | It then covers every writer: a colleague, a deploy, a scheduled automation, the AI. It also means §8 ships and is useful with no AI installed at all. |
| D7 | **A clean window refreshes in place** by calling the workspace context's own `reload()`, never by reloading the iframe. | `UmbEntityDetailWorkspaceContextBase.reload(): Promise<void>` is public, and every editable workspace the desktop can open derives from it, which the dirty watcher already relies on. Scroll position, the open tab, split view and window geometry all survive. |
| D8 | **Unsaved *and* changed underneath is an alarm state with its own visual language, and it is the only state that gets one.** | It is the one state where the user is about to destroy work they cannot see. If stale-and-clean shouted too, the shout would mean nothing here. |
| D9 | **The alarm appears on the taskbar button as well as on the window.** This deviates from the unsaved-changes guard's §8, which dropped taskbar marking. | That decision was right for its state and wrong for this one. The editor *caused* the unsaved state and knows about it, so the titlebar is enough. Nobody causes the conflict state: it arrives while you are elsewhere, possibly on a minimized window, and a warning you cannot see is not a warning. Only the alarm goes to the taskbar; the plain dot stays where it is. |
| D10 | **The exit guard's wording inverts in the conflict state.** | Everywhere else on this desktop, closing is what loses work. Here, saving is: Umbraco submits the whole document, so saving a stale copy silently reverts the other writer. Closing loses only your own work, which you know about. A dialog that nudges toward Save in this state is worse than no dialog. |
| D11 | **No blocking scrim over a conflicted window.** | The Save button is inside someone else's document, so we cannot intercept it. A scrim would look like prevention while the real save path stays open the moment it is dismissed, and the change underneath might be a typo in another variant. Loud and honest beats theatrical. Blocking stays available as a second step if banners turn out to be ignored. |
| D12 | **The desktop subscribes to the event feed once and tells its windows**, rather than each window listening for itself. | One router in one document is the thing to reason about, and the desktop is the only place that knows what every window is showing. Not, as this row used to claim, to save connections: R4 was measured and the frames' own hub connections cost nothing. The frames keep theirs regardless, because 25 of Umbraco's client caches invalidate off that feed. |
| D13 | **The alarm is a token group, and colour is never the only carrier.** | Per the standing rule, a chrome change means a token every theme gets. One alert red has no place in Windows 98's palette, and macOS and Umbraco each have their own way of saying "something is wrong". Icon, words and colour together, or a colour-blind editor gets nothing in the one state that matters. |
| D14 | **The entity-adapter bridge is evaluated and rejected, not overlooked.** | It would work: windows are same-origin so the real workspace object can cross the boundary, the adapters are explicitly duck-typed rather than `instanceof`-checked, and the desktop already reaches into a frame's contexts in `dirty-watcher.ts`. It is rejected because §2.2 removed the need. Recorded so the next person does not spend the day re-deriving it. One artefact if it is ever revived: adapters classify caught errors with `error instanceof Error`, which is false across realms, so cross-frame failures would degrade to "Unknown error". |
| D15 | **Everything AI-shaped degrades to absent.** | AI is a separate package and at RC. No catalogue entry, no tool and no contributor may appear or throw when it is missing or older. §9 says how. |
| D16 | **One chat window. `allowMultiple: false`.** | Reversed from "any number of windows, one per conversation" once that rule was priced. The conversation list is already inside the window (D3), so switching is native and costs a click, which is how every chat client people already use behaves. It also deletes §4.1's uniqueness rule, which that section itself admitted could not hold once the user clicked a conversation in the workspace's own sidebar. What it gives up is parallel runs, and only those: switching conversations inside one window kills the run, but so does switching inside Umbraco's own section, which aborts on every target change (§4.1). One window is therefore exactly Umbraco's behaviour rather than a reduction of it, and several windows would have exceeded it. |

---

## 4. The chat, and how it opens

A catalogue entry, in the existing `catalogue/ai.ts`, alongside the `ai` section entry that is
already there:

```ts
{
  alias: 'copilot-workspace',
  ref: 'Uai.Section.CopilotWorkspace',
  icon: 'icon-wand',            // inherited if the section's own is better
  chromeProfile: 'full-section', // D3
  defaultSize: { w: 1200, h: 820 },
  allowMultiple: false,          // D16
  group: 'ai',
  weight: 5,                     // ahead of the AI section entry
}
```

`ref` on a section resolves through the existing `inferUrl`, and the entry is gated by that
section's user permission the same way every other curated entry is gated, which is also what makes
D15 free for this part: no permission, no tile.

`allowMultiple` is **off** deliberately, per D16. §4.1 is why, and it is the whole of the rule:
there is no per-conversation bookkeeping, no uniqueness detection and no watchdog.

Nothing else is needed to make the chat useful. Everything below is additive, and each part is
worth shipping on its own.

### 4.1 One chat window

The window manager already implements this: `open()` checks `allowMultiple === false` and focuses
the existing window instead of stacking a second one. So the entry above is the entire change, and
it needs nothing from [#24](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/24)
(the "open in a new window" gesture), which an earlier draft of §12 wrongly said it depended on.
The behaviour has no test, though, and D16 now rests on it, so §10 adds one.

The cost, priced before deciding rather than discovered later: switching conversations inside the
window kills whatever the agent was doing. `#syncTarget` in the workspace's own chat context calls
`abortRun()` on every target change, and the server ties the run to `httpContext.RequestAborted`,
so the run is cancelled server-side, not merely detached from the view.

That is worth stating plainly because it sounds like an argument for several windows and is not.
It is Umbraco's behaviour in Umbraco's own section: a user in the plain backoffice loses the run on
a switch too. One window matches what the product does. Several windows would have *exceeded* it,
by keeping parallel runs alive, and that is the one thing this decision genuinely gives up.

Two consequences worth having:

- **The connection budget stops mattering.** At most one run is ever in flight, so the six-stream
  ceiling in R4 is unreachable and needs no cap, no warning and no code.
- **The unenforceable half of the old rule is gone.** The previous D16 promised one window per
  conversation and then conceded it could not hold once the user picked a conversation from the
  workspace's own sidebar. A rule that stops applying inside the thing it governs is worse than no
  rule.

---

## 5. Answers that open as windows

One `uaiAgentFrontendTool`. The agent already answers "where is the pricing page" by searching
server-side; what it cannot do anywhere else in Umbraco is hand you the page without taking itself
away, because in a single-page shell following a link is a navigation and the panel resets.

```ts
{
  type: 'uaiAgentFrontendTool',
  alias: 'UmbraDesktop.AgentFrontendTool.OpenWindow',
  meta: {
    toolName: 'open_desktop_window',
    description: '…',
    parameters: { /* JSON Schema: what to open, and optionally how to lay it out */ },
    scope: 'navigation',
  },
  api: () => import('./ai/open-window.tool.api.js'),
}
```

Three notes that matter more than the schema:

- **It must no-op politely off the desktop.** Per §2.3 there are no per-surface conditions yet, so
  this tool also resolves for the sidebar in a plain backoffice with no desktop anywhere. The api
  returns a plain "not available here" result rather than throwing, and never navigates the
  backoffice as a fallback.
- **It opens, it does not close.** Closing a window can discard someone's unsaved work, and the
  desktop's whole guard exists to stop that happening silently. If closing is ever offered it goes
  through the same confirmation a person's click does, and it is not in the first version.
- **`window-manager.open()` already takes an app with a computed iframe URL**, so no new manager API
  is needed. Window identity keys off `alias`, so an app opened for a specific document needs a
  per-target alias, and reopening the same target focuses the existing window instead of stacking a
  duplicate.

---

## 6. What the desk tells the agent

One `uaiRequestContextContributor`, which the collector runs once per message send:

```ts
{
  type: 'uaiRequestContextContributor',
  alias: 'UmbraDesktop.RequestContextContributor.Desk',
  api: () => import('./ai/desk.contributor.js'),
  weight: 60,
}
```

It contributes one item describing the desk at that moment: which windows are open, what each is
showing, which is in front, and which have unsaved changes. Per D5 this is a snapshot, not a
subscription, which is what makes "the page I have open" work as a phrase without making the
conversation's meaning depend on state that changes later.

Two boundaries:

- It contributes **identity, not content**: entity type, key, name, dirty flag. Reading the document
  is the agent's job and it has server-side tools for it that work whether or not the thing is open.
- It contributes **nothing when the desktop is not mounted**, which is the same politeness §5 needs
  and for the same reason.

The unsaved flag is there for one specific purpose beyond phrasing: an agent that is about to write
to a node the user has open and dirty can say so in the approval card it is already pausing on.
That pause is Umbraco's (`Interactive` policy, §2.2). Nothing else in the room knows the fact that
makes it worth reading.

---

## 7. When content changes underneath a window

> **Superseded.** [The overwrite guard design](2026-09-08-overwrite-guard-design.md) specifies this
> work and corrects three points of fact in the section below: `Trashed` is a third event type,
> and it is what the backoffice's Delete actually does; publish, schedule and unpublish never go
> through `requestSubmit()`, so a suppression built on the submit path false-alarms on
> save-and-publish; and §7.6 has the variant case backwards, because the merge controller puts your
> stale values for unselected variants into the save payload, which makes two editors on different
> cultures a real conflict rather than a harmless one. The section stays as written, because the
> reasoning that led here is worth keeping, but nothing should be built from it.

Independent of AI, and the reason it is in this document is that a server-writing agent makes it
common instead of rare.

### 7.1 Three states, and only one is dangerous

| Window | Content changed on the server | Treatment |
| --- | --- | --- |
| Clean | no | nothing |
| Clean | yes | refresh in place, and mark briefly so the change is not invisible (D7) |
| Dirty | no | today's dot, unchanged |
| **Dirty** | **yes** | **the alarm state: §7.3** |

### 7.2 The signal

The desktop consumes `UMB_MANAGEMENT_API_SERVER_EVENT_CONTEXT` once, in its own document (D12),
filtered to `Umbraco:CMS:Document` and `Umbraco:CMS:Media` with `Updated` and `Deleted`, and
matches each event's `key` against what each open window is showing. A window's subject comes from
the same place its dirty state does: the workspace context it already tracks.

`Deleted` is not a stale window, it is a window whose document no longer exists. It gets the alarm
treatment regardless of dirty state, because there is nothing to refresh to and saving cannot
succeed.

### 7.3 The alarm

Three surfaces, one state:

1. **A banner in the window's own chrome**, above the content, in the desktop's document rather than
   injected into the frame. Themes can style it, we are not fighting the backoffice's DOM, and it
   survives the window navigating internally. Persistent, with no dismiss control, and two actions:
   - *Keep my changes*, which acknowledges that saving will overwrite the other change.
   - *Discard my changes and load the new version*, worded as what it does. "Refresh" sounds free
     and here it is not.
2. **The window frame**, via the alarm token group, so a theme can carry it in its own idiom.
3. **The taskbar button** (D9), so a minimized or buried window can still tell you.

### 7.4 The exit guard, inverted

Per D10, the guard from
[the unsaved changes guard design](2026-09-07-unsaved-changes-guard-design.md) needs a second
wording for this state. Closing a conflicted window is the *safe* act, and the dialog should say so
rather than reusing a phrasing built to discourage closing. The Exit dialog's count sentence needs
the same treatment: "3 windows have unsaved changes, 1 of them has also changed elsewhere" is the
sentence that produces the right decision.

### 7.5 Tokens

| Token | Default | Why it has one |
| --- | --- | --- |
| `--umbradesktop-alarm-color` | a palette error colour, chained like the dirty dot chains to titlebar text | So no theme has to touch it to be correct |
| `--umbradesktop-alarm-background` | derived from the above | The banner's ground, which Win98 will want to express differently from macOS |
| `--umbradesktop-alarm-text` | — | Contrast is the theme's business, not ours |
| `--umbradesktop-alarm-border-width` | a px literal in the base CSS | So a theme can frame the whole window rather than tint it |

Per the standing rule a theme may restyle these and may not remove them, and §10 tests that over
all five themes the way `theme/unsaved-marker.test.ts` already does for the dot.

### 7.6 Seeing what changed

**Refined in its own session before it is built.** What is settled is that it belongs to this
feature rather than to a wishlist, and why: a warning that says "you are about to overwrite
somebody" is believed, while a warning that *shows* what would be lost is acted on. It is also the
only way for an editor to tell "they fixed a typo, keep mine" apart from "they rewrote the intro,
better look at this", and those two want opposite decisions from the same banner.

What is already known about building it, so the refinement session starts from facts:

- **Both sides are available.** The window holds its current data and its last-saved data, which is
  the pair `dirty-watcher.ts` already compares. The server's version is a fetch away, and the
  event's `key` names it.
- **"Their changes" is not the same as "the server's version".** The server's copy is your last-saved
  data plus their edits, so a naive two-way diff against your current data shows your own typing as
  a difference too. Three-way is the correct framing: last-saved as the base, yours and theirs as
  the two branches. That distinction is the thing most likely to be got wrong, and it decides
  whether the feature reads as trustworthy.
- **Properties, not text.** Umbraco content is a set of typed property values, not a document, so
  this is a per-property comparison and every property editor has its own idea of what a value is.
  A generic renderer will handle text well and blocks or nested content badly, so the session has to
  decide what "changed" means for a value it cannot render, and say so honestly in the UI rather
  than guessing.
- **Variants multiply it.** Culture and segment are part of a value's identity, and two editors
  working on different cultures of one document is the single most likely way to hit this state in
  practice, and also the most likely to be harmless. Recognising that case may be worth more than
  the diff itself.
- **The banner has room for it.** §7.3 keeps a third action free so adding this is not a redesign.

---

## 8. The part that needs no AI, and why it is the most valuable part

§7 is a shell feature, it needs no AI package installed, and it should be built and shipped on that
basis. This document is simply where the reasoning ended up, because a server-writing agent is what
made the problem urgent enough to look at.

But it is worth being clear about what it actually fixes, because it is bigger than the desktop.

**The backoffice has no protection against two editors overwriting each other.** Open a page in two
browsers, edit both, save both, and the second save wins silently. Nobody is told, nothing is
flagged, and the first editor's work is gone with no trace in the UI. Umbraco has the signal for
this and uses it only to drop cached copies (§2.4), so the platform knows and does not say.

The desktop makes that risk **larger**, because several documents are open at once and one of them
can sit minimized for an hour while somebody else works on it. So this is not a companion feature
for the AI work: it is the desktop paying for the risk it introduces, and in doing so it becomes the
only surface in Umbraco that warns an editor at all.

That is also why the diff in §7.6 belongs here rather than in a wishlist. Telling somebody their
work is about to be overwritten is worth much more when they can see what they would be overwriting.

---

## 9. Degrading when AI is absent

- **The catalogue entry** resolves through the section registry, so an install without the package
  has no `Uai.Section.CopilotWorkspace` to infer a URL from and the entry does not appear. Same for
  a user without the section permission. This is existing behaviour, not new code.
- **The tool and the contributor** are manifests of types that only exist once AI registers them.
  Registering a manifest of an unknown type is inert, and both apis must tolerate being constructed
  in a document with no desktop (§5, §6).
- **Nothing in §7 references AI at all.**

The only version-sensitive surface is the deep-link shape in §2.1, and only if we ever construct
one by hand rather than resolving the section. See R2.

---

## 10. Tests, written first

| What | Where | How |
| --- | --- | --- |
| Catalogue entry resolves to the section URL, is gated by its permission, and is absent when the section is | `catalogue/commercial.test.ts` (its existing pattern for AI-family entries) | pure, against a fake registry |
| **A second launch of an `allowMultiple: false` app focuses the open window instead of stacking one** | `window-manager.test.ts` | pure, against the manager. Existing behaviour with no test today, and D16 now rests on it, so it gets one before the entry that depends on it |
| Desk contributor: shape of the contributed item, front window, dirty flags, and empty when no desktop | `ai/desk.contributor.test.ts` | pure; it takes the window model, not the DOM |
| Open-window tool: opens, focuses an already-open target rather than duplicating, refuses politely with no desktop | `ai/open-window.tool.test.ts` | via a seam on the manager, as `window-manager.test.ts` already does |
| Event matching: an event for an open node marks it, an event for an unrelated node does not, `Deleted` alarms whatever the dirty state | `stale-watcher.test.ts` | pure over the model plus a fake event subject |
| **Self-save suppression** (R1) | same | the first test to write. A window's own save must not alarm it, including when the event arrives before the workspace goes clean |
| Refresh in place calls the frame's `reload()` and never reloads the iframe | `stale-watcher.test.ts` | fake workspace context in the test document, as `dirty-watcher.test.ts` builds one |
| Alarm renders for dirty + changed and not for the other three states | `window-alarm.test.ts` | base window mount, as `window-dirty.test.ts` does |
| Alarm reaches the taskbar button | `desktop-chrome.test.ts` | alongside the existing chrome assertions |
| No theme removes, starves or hides the alarm | `theme/alarm.test.ts` over `UMBRADESKTOP_THEMES` | CSS-text check, the general form of restyle-never-remove |
| Exit dialog's conflict sentence | `exit-message.test.ts` | it is already a pure message builder |

Browser checks, part of done and not of the suite: open a document in two windows, edit one, save
the other, and confirm the first alarms and the second does not. Edit a document in a window, change
it from another browser session, and confirm the alarm. Open the Copilot Workspace window and
confirm no gutter (D3) and a clean console.

---

## 11. Risks

- **R1 — Your own save is indistinguishable from a colleague's.** The event model carries no user or
  client identity (§2.4). The naive build alarms the window that just saved successfully. It mostly
  resolves by luck, because the window goes clean as it saves and a clean window merely refreshes,
  but "this window is clean now" and "the server says this changed" arrive from different sources
  with no ordering guarantee, so there is a real window in which the shell sees dirty plus changed
  and flashes a data-loss alarm at the moment someone pressed Save and everything went fine. That
  false positive would teach people to ignore the alarm inside a day. Mitigation: a window
  suppresses conflict detection for its own subject across its own save, and that is the first test
  in §10.
- **R2 — AI 17.4 is at release candidate.** Mitigated by depending only on the section alias, the
  entity types and the documented extension points, all of which are the package's declared public
  surface, and by resolving the section's URL through the registry rather than writing a path. If a
  deep link is ever constructed by hand, that line is the one that breaks on an upgrade.
- **R3 — Our frontend tool resolves in surfaces that are not the desktop**, because per-surface
  conditions are not implemented yet (§2.3). Mitigated by the tool answering "not available here"
  rather than throwing or navigating. Revisit when conditions land.
- **R4 — The connection budget. Measured, and it is not what this risk used to say.** The original
  claim was that open windows are the ceiling, because every window is a backoffice document and
  each opens its own connection to `/umbraco/serverEventHub`. Measured in Chromium against an
  HTTP/1.1 origin, that is wrong, because browsers keep two separate budgets:
  - **Hub connections are WebSockets, and effectively free.** `SignalRRoutesBase.ConfigureHubEndpoint`
    leaves all transports enabled, so the client negotiates and WebSockets win; with
    `ClientShouldSkipNegotiation` on, the endpoint is WebSockets-only. WebSockets have their own
    per-host ceiling of **255**. Measured: 255 live sockets, the 256th refused, ordinary requests
    still returning in 2ms throughout. Ten or twenty windows is nothing.
  - **Held-open streaming responses cost one of the six, and the sixth is fatal.** An agent run is
    `POST .../stream-agui`, an `[HttpPost]` returning `text/event-stream`, which is exactly that
    shape. Measured: five concurrent streams fine, and at six every other request to the origin
    times out. That is the "iframes stop loading, nothing in the console" failure, and it was never
    about windows.

  So the ceiling is concurrent agent runs, not open windows. **D16 removes it entirely**: one chat
  window means at most one run in flight, so the budget is unreachable and there is nothing to cap.
  Worth knowing that the budget is not ours to blow either way: it is per origin *per browser
  profile*, shared across tabs, not per tab and not per document. Measured, three streams in one
  tab plus three in another wedged both. So the plain backoffice has this same ceiling across six
  tabs, with or without a desktop, and the workspace already prevents its own half of it by
  aborting the run whenever the conversation changes.
  Two residual notes. Over HTTP/2, which is any real HTTPS deployment, streams share a connection
  and none of this exists (asserted from the spec and Kestrel's defaults, not measured here). And
  if WebSockets are ever unavailable, a proxy stripping `Upgrade` being the realistic way, SignalR
  falls back to SSE or long-polling, and *then* each window really does take one of the six and the
  original fear becomes correct at about five windows. That is a deployment note, not code.
  Measured under [#36](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/36), which
  is closed as a result.
- **R5 — A conversation deep link renders the whole section shell.** A window showing one
  conversation also shows the conversation list and the context panel, because the section element
  owns the router. Acceptable at the default size in §4, cramped if someone shrinks it, and not
  something we can strip without D3's problem.

---

## 12. Considered and dropped

- **A hand-built chat window on `@umbraco-ai/agent-ui`.** The right answer for about six weeks,
  until 17.4. It would now be a copy of the Copilot Workspace with no persistence, competing with
  the surface Umbraco is actively building.
- **A chat per window, or an AI button in the titlebar.** The idea reads well and dies on contact
  with §2.2: it exists to give the agent a document to work on, and the agent no longer needs one.
  It also adds a second affordance to every window for a job one taskbar button does.
- **An inspector rail whose subject follows the front window.** Genuinely nice, and the honest
  reason to drop it is the same: it solves "which document is this chat about" at a moment when the
  chat does not need a document. Worth reviving only if a future AI surface turns out to need live
  editor state. If it ever is revived, note that live preview ([#21](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/21))
  and the shelf ([#26](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/26)) are
  the same shape of problem and should share the answer.
- **Making the desktop section Copilot-sidebar-capable** with a `uaiCopilotCompatibleSection`
  manifest, plus a taskbar trigger driving `UAI_COPILOT_CONTEXT`. Cheap and it works, but the
  sidebar in the desktop's own document has no workspace to be about, so it is the generic chat with
  none of the memory, and its `marginInlineEnd` fights the desktop's window clamping. The workspace
  app is the better generic chat.
- **Restoring the sidebar's button inside windows** by not hiding `umb-backoffice-header`. The
  desktop hides that header in every chrome profile, and the header app is the sidebar's only
  trigger, so today the desktop removes an affordance Umbraco provides, which the standing rule
  calls a bug. It stays dropped because D2 makes it moot rather than because it is acceptable: the
  window-scoped chat it would restore is the thing we decided not to build. If any future version of
  the sidebar becomes worth reaching, the trigger belongs in the window titlebar, not in a restored
  header.
- **Several chat windows, one per conversation.** Was the decision, and is now the dropped option:
  see D16 and §4.1. Two things killed it. The rule could not hold inside the window, since the
  workspace's own sidebar navigates wherever the user clicks. And the capability it was protecting,
  parallel conversations, is thinner than it reads, because the workspace aborts the run on a
  conversation switch, so what several windows really bought was parallel *runs*. Worth having, but
  not worth an unenforceable rule plus R4's stream ceiling. Recorded because the reasoning inverted
  once, and could invert back if Umbraco ever keeps a run alive across a switch.
- **Focusing an open chat window instead of opening another on a launcher click.** No longer a
  dropped option, and the claim here was simply wrong: `allowMultiple === false` already focuses the
  existing window in `window-manager.context.ts`. [#24](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/24)
  is about the opposite gesture, opening a *second* window on purpose, and D16 does not need it.
- **A blocking scrim on a conflicted window.** D11.
- **Escalating the alarm over time.** Stateless is easier to trust, and the state is already the
  loudest thing on the desk.

---

## 13. Out of scope, in rough order of appeal

- **A pending-approval indicator in the taskbar.** With several windows open, the approval card the
  agent is waiting on can be behind another window. Small, and it needs the tray work from
  [#22](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/22).
- **Dragging a document from a tree window onto a chat window to attach it.** The gesture everybody
  already understands, landing on a first-party persisted attachment model. Waits on the drag spike,
  [#25](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/25).
- **A desktop session as a project.** Projects group conversations and share attachments, which is
  close to what a desk is. Attractive and entirely speculative.
- **Voice, and image generation into Media.** Core ships speech-to-text and image-generation
  controllers, and the chat has a voice button. Neither client API has been read.

---

## 14. Definition of done

- [ ] `npm run build` and `npm test` both pass
- [ ] `README.md` names the feature everywhere it could be named
- [ ] `umbraco-marketplace.json` mentions it in `Description` and `Tags`, with a screenshot in
      `docs/screenshots/` if the desktop looks different because of it
- [ ] `docs/theming.md` gains the alarm tokens in its table
- [ ] This document records anything the build taught us that the code does not say
