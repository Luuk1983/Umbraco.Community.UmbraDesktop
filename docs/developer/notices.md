---
id: notices
title: Showing a notice
description: Show a warning or an error in your app with the desktop's own notice banner, the one a window shows when a page changed while you edit it.
sidebar_position: 6.6
---

# Showing a notice

A window shows a banner between its title bar and its content when something needs the editor's
attention, such as "Someone else changed this while you were editing it". That banner is a component
of its own, `<umbradesktop-notice>`, and your app can draw it inside its own content. Then a warning
in your app looks the same as the desktop's, and every theme styles both.

Media Cleanup uses it to say a check is more than a day old, and that a newer check came in.

## 1. Draw a notice

Put the element in your app's template, by its tag name. Nothing is imported from this package:

```ts
html`<umbradesktop-notice
  severity="warning"
  heading="This check is more than a day old"
  body="Pages may have changed since. Select Check again before you clean up."></umbradesktop-notice>`;
```

| Attribute or property | What it is |
| --- | --- |
| `severity` | `warning` or `error`. Decides the icon and the colour, and whether a screen reader is interrupted (`error` is) |
| `heading` | The first line, in the editor's language |
| `body` | The sentence under it, in the editor's language. Leave it out for a heading alone |
| `name` | Your name for the notice, carried as `data-notice`, for your own tests |
| `actions` | A property, not an attribute: buttons, as `[{ id, label }]`. Leave it out for none |

The words are yours to translate: the element shows them as they are.

## 2. Act on a button

A notice draws its `actions` as real buttons. Pressing one fires `umbradesktop-notice-action`, with
the button's `id` in `detail.action`. The event bubbles out of your shadow root:

```ts
html`<umbradesktop-notice
  severity="warning"
  heading="A newer version is in"
  .actions=${[{ id: 'reload', label: 'Load it' }]}
  @umbradesktop-notice-action=${(event: CustomEvent<{ action: string }>) => this.#reload()}></umbradesktop-notice>`;
```

Give a notice a button only when the button is the way to deal with it. If your app already has that
button on screen, say so in the `body` instead: two buttons doing the same thing is one too many.

## 3. Where it comes from

The element is registered by the desktop, so it exists in every window the desktop opens. It
renders nothing until the desktop's bundle has loaded, which in a desktop window is always. In your
own tests the desktop is not loaded, so check the attributes you set rather than the text it draws.

A theme styles a notice through the same `.notice` rules in its window stylesheet as the window's
own banner (see [Adding a theme](theming.md)), so a notice in an app needs nothing extra from a
theme.
