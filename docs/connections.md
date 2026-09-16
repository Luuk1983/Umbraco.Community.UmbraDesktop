# Connections to other Umbraco instances

**Experimental.** It works, and it only ever reads. But how connections are stored and what they can
reach is still likely to change, so expect to redo some of this in a later version. The label in
Desktop settings says the same thing, deliberately.

This is for looking after several unrelated Umbraco sites — an agency with a handful of clients, or
anyone who logs into more than one backoffice in a day. It is not for the test, acceptance and
production environments of one solution: those share content and keys, and comparing or moving
things between them is what uSync and Deploy already do well. Unrelated instances share nothing, so
there is nothing to compare, and the value is simply seeing them all without logging in and out.

Today there is one app, Connection status, which lists every instance you have connected along with
this one and says what each reports about itself.

## What you need

One thing, on each instance you want to connect: an API user. Nothing is installed there, and
whoever owns that instance can revoke it whenever they like.

API users are Umbraco's own feature, added in 14, and they exist precisely for this — Umbraco's own
wording when you create one is "to allow external services to authenticate with the Umbraco
Management API". They authenticate with OAuth2 client credentials, which has nothing to do with the
backoffice login cookie.

## Creating the API user

On the instance you want to connect to:

1. Go to **Users**, then **Create**, and choose **API User**.
2. Give it a name and a user group. For Connection status, **the group needs no sections at all** —
   the endpoints it reads are open to any backoffice user. The smallest group you can make is
   enough, and a read-only one is the right instinct.
3. On the new API user, add a client credential. You choose both the **client ID** and the
   **secret**; they are not generated for you.
4. Copy the secret before you leave the screen. Umbraco says it plainly: *the secret cannot be
   retrieved again.* If you lose it, delete the credential and add another.

Name it after what it is for. Every future release of this feature will show up in that instance's
audit log under this name, so "UmbraDesktop (Contoso agency)" will one day be more use to whoever
owns that site than "desktop".

## Adding the connection

In the desktop, open **Desktop settings**, then **Connections (experimental)**, then **Add an
instance**. Five fields:

| Field | What to put in it |
| --- | --- |
| Name | What you call this instance. The client's name, usually. |
| Address | The site's address with no path, for example `https://www.example.com`. |
| Colour | Tells this instance apart from the others at a glance. |
| Client ID | The client ID you chose when creating the API user. |
| Client secret | The secret you chose. Stored encrypted and never shown again. |

Saving tests the connection straight away, so you find out there and then whether it worked.

Editing a connection later leaves the box for the secret empty. That is not a mistake: an empty box
means keep the one already stored, because the browser is never given the secret and so has nothing
to send back. Type a new one only when you want to replace it.

## What the statuses mean

Connection status shows one of five things per instance, and they are kept separate on purpose,
because each one is fixed by a different person doing a different thing.

| Status | What happened | What to do |
| --- | --- | --- |
| Connected | Everything worked. | Nothing. |
| Cannot be reached | Nothing answered at that address. | Check the address, and whether the site is up. |
| Credentials refused | The site answered and rejected the client ID or secret. | Check both. A secret pasted with a trailing space looks exactly like this. |
| Not permitted | The credentials were accepted, and that API user is not allowed to read this. | Someone with access to that instance needs to put its API user in a group that has the section. |
| No secret set | The connection exists but has no secret stored yet. | Edit it and add one. |

The difference between the first two failures is worth knowing. A site that is down and credentials
that are wrong look identical from a browser, and telling them apart is why the status check asks an
endpoint that needs no credentials before it asks one that does. The same endpoint is why an
instance stuck part-way through an upgrade reports that it is upgrading rather than reading as dead.

## Where to put your connections

**On an instance you own, not on a client's.** Everyone who can edit connections on an instance can
reach every instance connected to it, and the credentials themselves live in that instance's
database.

They are encrypted at rest, with ASP.NET Core Data Protection, under a purpose of their own, and the
desktop never sends a secret back to a browser — you can replace one, never read one. But the honest
limit is worth saying out loud rather than burying: anyone who can run code on the instance holding
them can decrypt them, because the key ring is right there. That is true of every stored credential
anywhere and it cannot be designed away. It is simply the reason the instance holding your
connections should be your own.

If you already run an Umbraco site of your own, that is the natural home.

## What it deliberately does not do

- **It never writes.** Not to content, not to settings, not to anything. The server only ever
  performs GET requests against a connected instance, enforced in this package's own code rather
  than left to whatever the API user happens to be allowed to do.
- **It does not read content.** Connection status reports on the instance, not on what is in it.
- **It does not compare instances.** Unrelated instances give the same page different keys, so there
  is nothing to line up. Between environments of one solution there would be, and that is uSync and
  Deploy's job rather than this one's.
- **It does not open another instance's backoffice in a window.** A browser cannot: Umbraco's
  backoffice session cookie is `SameSite=Strict`, so a page on one instance cannot frame or
  authenticate against another. Clicking an instance's name opens it in a new browser tab, where its
  own login applies.

## Who can see what

Configuring connections needs access to the **Settings** section on the instance holding them. The
Connection status app needs only a backoffice login, since reading which version another instance
runs is not privileged the way holding its credentials is.

Credentials are currently shared by everyone who can open the desktop on that instance. Per-user
credentials are modelled but not built; when they arrive, an instance you have no credential for
will simply not appear in your list.
