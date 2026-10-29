# Session lock screen (#160)

Issue [#160](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/160). The issue's
developer notes hold the spike's measurements and core's internals; this document records what was
decided on top of them and does not repeat them.

## 1. Why

When a session runs out, every window shows its own warning, then its own sign-in screen, and the
desktop is replaced by Umbraco's full-page sign-in. Every window is a whole backoffice in an iframe,
and each one runs Umbraco's session handling on its own. The desktop should handle it once, and let
you carry on where you were.

## 2. Decided

By Luuk, 2026-10-29:

- **The warning is Umbraco's own**, shown once, by the desktop. Windows show nothing. Core's dialog
  already has the countdown, Stay signed in and Log out, so there is nothing to gain by redrawing it.
- **The lock screen is in UmbraDesktop's own style**, the one the boot screen and the welcome wizard
  use: the navy ground, the mark, white text. Not themed. Consistency over per-theme character, so
  "every theme has a lock screen" holds because there is one, and it works under all of them.
- **Umbraco's own sign-in buttons, no password field.** The lock screen offers exactly the buttons
  Umbraco's timed-out screen offers, one per sign-in provider, each opening Umbraco's sign-in popup.
  It is the safest: every case (password, two-factor, Entra ID and other external providers, local
  sign-in off) is handled by core, in the flow core already maintains. And a familiar sign-in is what
  makes people trust it. This reverses the issue's "unlock without a popup": the spike's hidden-frame
  unlock is not used. It would have leaned on `back-office/login` and `verify-2fa`, which are not in
  the Management API's published spec (core's generated client has neither; only the login page
  calls them, by hand).

## 3. Goals, non-goals

Goals: one warning, one lock screen, nothing inside any window; every window carries on without a
reload after signing in again; every user can always get back in.

Non-goals: theming Umbraco's first sign-in page (rejected, do not re-propose); a password or code
field of our own; changing anything for `KeepUserLoggedIn`, which never times out.

Anti-goal: anything that changes how the classic backoffice behaves. A user who is not on the desktop
must see exactly what core shows today.

## 4. How the two screens are replaced

Core opens two modals by alias: `Umb.Modal.AuthTimeout` (the warning) and `Umb.Modal.AppAuth` (the
sign-in, as a persistent dialog in the top layer). The package's entry point runs in every frame, the
desktop's and each window's, and in each one it replaces both manifests with its own under the same
aliases, once core has registered them (`overwrites` does not work for modals, see the issue). It
keeps core's elements so it can hand back to them.

The replacement decides **when it renders**, by where it is, never at registration. That matters
because one document can be the desktop and, after Exit, the classic backoffice:

| Where the modal opens | Warning | Sign-in |
|---|---|---|
| A window's frame on a desktop | nothing, and the dialog is invisible | nothing, transparent; tells the desktop to lock if it has not (§7) |
| A document showing a desktop | core's own element | the lock screen |
| Anywhere else | core's own element | core's own element |

- "A window's frame" is answered by `findHostDesktopContext` finding the window manager.
- "A document showing a desktop" is answered by a small module the desktop element registers itself
  with on connect and leaves on disconnect. My call: simpler and more direct than walking shadow
  roots for the element.
- In a window the warning must **stay open, invisibly**. Rejecting it makes core refresh the token,
  which silently extends the session from a window nobody is looking at. It closes when core closes
  it: on the desktop's Stay signed in (a session update reaches every frame) or on time-out.
- The window's sign-in modal never needs to be seen: the desktop's lock screen is in the top layer of
  the outer document and covers every iframe.

## 5. The lock screen

Centred on the boot screen's ground: the user's avatar (initials when there is none), their name,
core's line saying the session ended, and the sign-in buttons. Below them, **Not you? Log out**, which
signs out the way the launcher's Log out does. Our own labels in `localization/en.ts` and `nl.ts`;
the buttons keep core's labels.

It lifts itself as soon as the session is authorised again, whoever did it: the popup, a sign-in in
another tab, or a background request that refreshed a session the server still had. Core's own
sign-in modal does exactly this. My call: it is the answer to the issue's "server outlives the
client" trap, because the lock then never sits over a live session.

## 6. Signing in again

The buttons are core's own, rendered the way core's `umb-auth-view` renders them: an
`umb-extension-slot` of type `authProvider` with `umb-auth-provider-default` as the default element,
the same filter (the Umbraco provider hidden when local sign-in is off), and `userLoginState`
`'timedOut'`. A provider that ships its own button element gets it here too. Submitting calls
`makeAuthorizationRequest(provider, false, loginHint, manifest)`, the call core's sign-in makes when it
is timed out: a popup, so the windows keep their state, and the `authorized` broadcast brings every
frame back. Errors show the way core shows them, above the buttons.

So every case is core's: a password user, two-factor (the login page's own code screen), Entra ID and
other external providers, local sign-in off, a locked-out account. A blocked popup is the browser's
notice, as it is in a plain backoffice today.

## 7. Traps, decided

The first two are the reason this issue exists for Luuk: the session has ended, the desktop still
looks alive, and the first window you use shows Umbraco's sign-in inside its frame. Both have to end
in the desktop's lock, with nothing shown in the window.

- **A window that times out alone.** Core's `timeOut()` is local to the frame that calls it; unlike
  `clearTokenStorage()` and `signOut()` it broadcasts nothing. So when the server has ended the
  session while the client's estimate says it is still valid, the desktop's timers never fire, and
  the first window that makes a request gets a rejected refresh, times out on its own, and opens its
  sign-in inside its frame. In this design that window's replacement shows nothing and asks the
  desktop's auth context, reached through the frame, to time out if it is still authorised, so the
  desktop locks. The window element also watches the frame's own auth context from outside, for a
  frame where this package never loaded (§11). The refresh token is shared, so the desktop is no better off. Core's interceptor
  holds the failed request and replays it after signing in again.
- **A window sent to the sign-in page.** A window that boots or reloads while the session is gone
  (opened from the launcher, Reload, or a full navigation inside it) never reaches the modal: core's
  router redirects the whole frame to the sign-in page (issue, caveat). The desktop already watches
  each window's frame location, so a frame that lands on core's sign-in (the `authorize` endpoint or
  the login page) locks the desktop, and after signing in again that window is sent back to the
  address it was going to. The lock is up at once, so the sign-in page inside the frame is never in
  view for longer than that.
- **A session the server ended** (another sign-in elsewhere with concurrent logins off) reaches the
  same lock through core's failed refresh. Tested by hand.
- **SignalR** after unlocking: checked in the real run.

## 8. Leaning on core

What this touches that is core-internal (17.6): the two modal aliases, how core opens them, and the
`authProvider` slot's props. Sign-in itself is core's public `makeAuthorizationRequest`. The internal
part lives in one module, each assumption stated where it is used and pinned by a test against the
floor package, so an Umbraco upgrade that moves one fails a test instead of the lock screen. If the
aliases ever disappear, nothing is replaced and core's own screens show, as before this feature.

## 9. Proving it

Tests first, in the usual runner. Then a real run against the TestInstance with
`Umbraco__CMS__Global__TimeOut=00:02:00`, headless, three windows open and one minimised, walking the
issue's Done-when list: one warning; one lock; nothing in any frame; signing in through the popup
resumes every window without a reload; log out. Then Luuk's case, with the session ended by the
server while the client still thinks it is valid (a sign-in from another browser with concurrent
logins off): use a window, and open a new one, and check that each locks the desktop and nothing
shows inside a frame. Then a background tab by hand.

The mock is `mockups/2026-10-29-session-lock-screen.html`.

## 10. Left to the builder

The exact watch on the registry; how the invisible warning hides its dialog shell; the docs page's
category; the lock screen's spacing against the welcome wizard's.

## 11. As built, and what the real run found

Built 2026-10-29 in `backoffice/src/desktop/session/`. Real run against the TestInstance (17.x,
`TimeOut` 2 minutes, `AllowConcurrentLogins` false), headless Chrome, three windows, one minimised.

- **Running out.** The warning showed once, in the desktop frame (core's, 526x192); every window
  held our modal at 0x0. At the end the lock screen covered the desktop (1600x1000) and every window
  stayed at 0x0. Signing in through the popup lifted the lock in about a second, and every window
  frame still had a marker set before the lock, so none reloaded. A new window afterwards worked.
- **The popup does not always ask for a password.** When the server's sign-in cookie still lives
  (the ordinary time-out case), `/authorize` issues a code at once and the popup closes by itself.
  Core's own timed-out screen behaves the same way; this is core's flow, not ours.
- **A frame that starts up signed out never loads this package.** Core fetches a package's code only
  once signed in. With the session ended by the server, a window opened next showed core's own
  sign-in inside its frame (`umb-auth-view`, 960x680), and nothing in that frame could lock the
  desktop. Hence `UmbraDesktopFrameSessionController.watch`: the window element watches its frame's
  own auth context from outside and locks the desktop on its `timeoutSignal`. Measured with the
  desktop's `timeOut` wrapped to record its caller: the only caller was that watch. The frame's own
  sign-in sits under the lock and closes itself once signed in again.
- **Using a window after the server ended the session** locked the desktop within a second, with
  nothing shown in any window.
- **The redirect to the sign-in page** (`landed`) did not happen in any run: a frame that booted
  signed out took the time-out path above instead. It stays as a guard, covered by tests only.
- **Server events** (SignalR) reconnected in the desktop and in the window after signing in again.
- **Log out** on the lock screen went to core's `/umbraco/logout`.
- Not checked here: a real background tab, and two-factor or an external provider in the popup (both
  core's own popup).
