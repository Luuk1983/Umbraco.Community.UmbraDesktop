---
id: session-ends
title: When your session ends
description: The warning before your session times out, the lock screen after it, and how to carry on where you were.
sidebar_position: 5
---

# When your session ends

Umbraco signs you out after a while without activity. On the desktop this happens once, for the
whole desktop. Your windows stay open where they are, and signing in again lets every one of them
carry on without reloading.

## Before it ends

Shortly before the session times out, Umbraco's own warning appears once, over the desktop, with a
countdown. To keep working, select **Stay logged in**. To sign out instead, select **Log out**.
Nothing appears inside the windows.

## Sign in again

When the session has ended, a lock screen covers the desktop. It shows your name and the same sign-in
buttons Umbraco's own sign-in screen offers.

1. Select the sign-in button you normally use, such as **Sign in with Umbraco**. Umbraco's sign-in
   opens in a popup.
2. Sign in there, with two-factor authentication if your account uses it. The popup closes, the lock
   screen lifts, and every window carries on. If Umbraco still recognises you, the popup closes by
   itself without asking.

If the browser blocks the popup, allow popups for this site and select the button again.

A window that tried to open a page while the session was over is sent back to that page once you
have signed in.

To sign out instead, for example because it is not your desktop, select **Log out** under **Not you?**.

## When the lock screen appears

The lock screen appears when the session times out, and also when the server ended it early, for
example because you signed in somewhere else on a site that allows one sign-in at a time. Either
way, the desktop locks the first time any window notices, so a window never shows a sign-in page of
its own.

A site that keeps users signed in (Umbraco's `KeepUserLoggedIn` setting) never times out, so the
lock screen only appears there when the server ends the session.
