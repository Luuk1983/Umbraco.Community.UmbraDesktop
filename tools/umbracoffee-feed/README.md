# umbraCoffee feed tool

Keeps the umbraCoffee data on the `data/umbracoffee` branch. Plain Node, no dependencies, so the
Action runs it from a bare checkout. Tests: `node --test` in this folder. The design is in
`docs/design/2026-09-30-umbracoffee-v2-plan.md`, section "Addendum 2026-10-01".

## The files

All in `umbracoffee/` on the data branch.

| File | Written by | What it is |
| --- | --- | --- |
| `sources.json` | the Action | Every episode with its title, date and YouTube description |
| `details.json` | you, with `apply-details` | Summary and guests per episode, made from the description |
| `overrides.json` | you, by hand | Your corrections. Always wins. No tool writes it |
| `episodes.json` | the Action and `apply-details` | What the app reads, rebuilt from the three above |
| `next-episode.json` | the Action | The upcoming or live episode, if any |

`overrides.json` looks like this. Both parts are optional.

```json
{
  "version": 1,
  "guestNames": { "Jesper": "Jesper Mayntzhusen" },
  "episodes": { "<videoId>": { "summary": "...", "guests": [{ "name": "...", "affiliation": null }], "guestsUnnamed": false } }
}
```

`guestNames` maps a spelling to the one name it means, so one person is one entry in the guest
filter. It is an exact match. A guest that becomes a duplicate within an episode is dropped.

## The commands

Run from the repository root. `<dir>` is the `umbracoffee/` folder of a data branch checkout.

| Command | What it is for |
| --- | --- |
| `node tools/umbracoffee-feed/src/run.mjs <dir>` | The Action. Reads the feed, updates `sources.json`, rebuilds `episodes.json`, updates `next-episode.json`. Writes nothing when nothing changed |
| `node tools/umbracoffee-feed/src/pending.mjs <dir>` | Prints the episodes that need a summary: new ones, and ones whose title or description changed. JSON, newest first |
| `node tools/umbracoffee-feed/src/apply-details.mjs <dir> <results.json>` | Checks the session's answers, saves them in `details.json` and rebuilds `episodes.json`. Refuses the whole file if one answer is wrong |
| `node tools/umbracoffee-feed/src/guests.mjs <dir>` | Lists every guest with their episode count, and pairs that look like one person spelled two ways. Use it to fill `guestNames` |
| `node tools/umbracoffee-feed/src/snapshot.mjs <dir>/episodes.json` | Writes the copy of `episodes.json` the package ships for when GitHub cannot be reached. Run before a release |
| `node tools/umbracoffee-feed/src/backfill.mjs <dir> < ids.csv` | One-off. Adds old episodes the feed no longer lists, from `id,published` lines |

`results.json` is a JSON array. Each item is the prompt's answer plus the episode's `videoId`:

```json
[{ "videoId": "...", "summary": "...", "guests": [{ "name": "...", "affiliation": null }], "guestsUnnamed": false, "uncertain": false, "uncertainReason": null }]
```

## Once a month

1. Pull the data branch, so you have the Action's latest `sources.json`.
2. Get the work: `node tools/umbracoffee-feed/src/pending.mjs <dir> > pending.json`. An empty array
   means there is nothing to do.
3. In a Claude Code session, give it `prompts/episode-details.md` and `pending.json`. Ask it to run
   the prompt once per episode and write all answers, each with its `videoId`, to `results.json`.
4. Apply: `node tools/umbracoffee-feed/src/apply-details.mjs <dir> results.json`. If it refuses,
   it names each bad answer. Fix or redo those and apply again.
5. Look at the answers marked uncertain, and at `guests.mjs` for new spellings of known guests.
   Put fixes in `overrides.json`, then apply again (an empty `[]` results file is enough) or wait
   for the Action to rebuild `episodes.json`.
6. Commit `details.json`, `episodes.json` and any `overrides.json` change, and push the data branch.

The Action only reads `details.json` and `overrides.json`. It never commits them, so your push is
the only way they change.
