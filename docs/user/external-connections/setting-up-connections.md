---
id: setting-up-connections
title: Setting up connections
description: How a connection works, creating the API user, adding the connection, and where credentials live.
sidebar_position: 1
---

# Setting up connections

**Experimental.** See [External connections](README.md).

## How a connection works

A connection needs one thing on each instance to connect: an API user. Nothing is installed there,
and whoever owns that instance can revoke it whenever they like.

API users are Umbraco's own feature, added in 14, and they exist for exactly this. Umbraco's own
wording when one is created is "to allow external services to authenticate with the Umbraco
Management API". They authenticate with OAuth2 client credentials, which has nothing to do with the
backoffice login cookie.

The credentials are stored, encrypted, on the instance they are added to. That instance's server
talks to the other one; the browser never holds the other instance's credentials.

## Create the API user

On the instance to connect to:

1. Go to **Users**, select **Create**, and choose **API User**.
2. Give it a name and a user group.
   - For [Connection status](connection-status.md), **the group needs no sections at all**. The
     endpoints it reads are open to any backoffice user.
   - For [Remote content](remote-content.md), the group needs the **Content** and **Media** sections
     and permission to read documents, including their property values. With Read alone, a document
     opens with every group of properties empty. Remote content is read-only whatever the group
     allows, so there is no need for write permissions, and no harm in them.
3. On the new API user, add a client credential. Both the **client ID** and the **secret** are
   chosen, not generated. Umbraco puts `umbraco-back-office-` in front of the client ID typed, and the
   full ID, prefix included, is what goes into Desktop settings.
4. Copy the secret before leaving the screen. Umbraco says it plainly: the secret cannot be retrieved
   again. If it is lost, delete the credential and add another.

Name the API user after what it is for. Every future release of this feature shows up in that
instance's audit log under this name, so "UmbraDesktop (Contoso agency)" will one day be more use to
whoever owns that site than "desktop".

## Add the connection

On the instance that holds your connections:

1. Open [Desktop settings](../settings/desktop-settings.md) and select **Connections
   (experimental)**.
2. Select **Add an instance**.
3. Fill in the five fields:

   | Field | What to put in it |
   | --- | --- |
   | **Name** | What you call this instance. The client's name, usually. |
   | **Address** | The site's address with no path, for example `https://www.example.com`. |
   | **Colour** | Tells this instance apart from the others at a glance. |
   | **Client ID** | The client ID chosen when creating the API user, prefix included. |
   | **Client secret** | The secret chosen. Stored encrypted and never shown again. |

4. Select **Save**. Saving tests the connection straight away, so the result shows there and then.

When a connection is edited later, the **Client secret** box is empty. That is not a mistake: an empty
box means keep the secret already stored, because the browser is never given the secret and so has
nothing to send back. Type a new one only to replace it.

## Where to keep your connections

Keep them on an instance you own, not on a client's. Everyone who can edit connections on an instance
can reach every instance connected to it, and the credentials themselves live in that instance's
database.

They are encrypted at rest with ASP.NET Core Data Protection, under a purpose of their own, and the
desktop never sends a secret back to a browser: a secret can be replaced, never read. But the honest
limit is worth saying out loud: anyone who can run code on the instance holding them can decrypt
them, because the key ring is right there. That is true of every stored credential anywhere, and it
cannot be designed away. It is the reason the instance holding your connections should be your own.
If you already run an Umbraco site of your own, that is the natural home.

## Who can see what

- **Configuring connections** needs access to the **Settings** section on the instance holding them.
- **Connection status** needs only a backoffice login, since reading which version another instance
  runs is not privileged the way holding its credentials is.
- **Remote content** needs the **Content** section on the instance holding the connections, because
  it shows other sites' pages. Without it the app is not offered, and the desktop refuses its reads
  anyway.

Credentials are currently shared by everyone who can open the desktop on that instance. Per-user
credentials are modelled but not built. When they arrive, an instance you have no credential for will
simply not appear in your list.

## What it deliberately does not do

- **It never writes.** Not to content, not to settings, not to anything. The server only ever makes
  GET requests to a connected instance, enforced in this package's own code rather than left to
  whatever the API user happens to be allowed to do.
- **It does not compare instances.** Unrelated instances give the same page different keys, so there
  is nothing to line up. Between environments of one solution there would be, and that is uSync and
  Deploy's job.
- **It does not open another instance's own backoffice in a window.** A browser cannot: Umbraco's
  backoffice session cookie is `SameSite=Strict`, so a page on one instance cannot frame or
  authenticate against another. [Remote content](remote-content.md) gets round this by running this
  instance's backoffice and sending its reads to the other one, which shows the other site's content,
  not its backoffice. Selecting an instance's name in Connection status still opens its own backoffice
  in a new browser tab, where its own login applies.
