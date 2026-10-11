# umbraCoffee episode details

You are given one episode of umbraCoffee, a community live show about the Umbraco CMS: its title, its
date and its YouTube description. Return a short summary and the guests, as JSON and nothing else.

## What the description looks like

Almost every description has three parts:

1. A standard intro that is the same on every episode ("Welcome to episode #048 of our weekly
   #umbraCoffee series..." or "Welcome to your monthly dose of #umbraCoffee!..."). It names the
   hosts. Ignore it, except for the sentence right after it.
2. Often a sentence naming the guests: "Today we're joined by ...", "This week our guests are ...",
   "All together with fantastic guests from Perplex - ...". This is the only place guests come from.
3. A "Buy us a coffee" link and a list of topics and links ("Topics:", "Notes:", "Links and topics
   discussed during the episode:"). Use it for the summary.

## Rules

- **Hosts are not guests.** The hosts are Marcin Zajkowski and Callum Whyte. Never list either of
  them as a guest, even if named.
- **Guests only from what the description states.** A person counts only when the description says
  they are on the show. Authors of linked blogs, people mentioned in a topic, and people in
  release notes are not guests. Do not guess from the title.
- **Names as written, cleaned up.** Drop handles in brackets such as "(@jschoemaker1984)", and drop
  link remnants. Write the full first and last name when the description gives them, since the same
  person is matched across episodes by name. Keep the person's company or role as `affiliation`
  when the description gives it, shortened to one company or one short role of at most four words
  ("Perplex", "Umbraco MVP", "Umbraco HQ"), else `null`.
- **Unnamed guests.** Set `guestsUnnamed` to `true` when the description says there are guests it
  does not name ("with some very special guests"). That can be beside named ones ("joined by Jane
  Doe and the rest of the team"): list the named ones and still set it.
- **Summary.** Two or three plain sentences in English, at most 60 words, saying what the episode
  covers: the main topics and, if there are guests, what they came to talk about. No hype, no
  emoji, no links, no "In this episode". If the description has no topics, summarise from the title
  alone in one sentence, and only with what the title says ("Recorded live at Codegarden 2026."). The
  summary is about the episode, never about the description: if the title says nothing either,
  return an empty string, and say why in `uncertainReason`.
- **Say when you are unsure.** Set `uncertain` to `true` and give a short reason whenever a person
  would want to check your answer. For example: the description has no topics, so the summary rests
  on the title; a guest is named by first name only; it is unclear whether someone is a guest or
  only mentioned; a name looks misspelled or garbled; the description seems to belong to another
  episode. Otherwise `uncertain` is `false` and `uncertainReason` is `null`. Being unsure is fine;
  guessing silently is not.

## Output

Exactly this JSON shape, with no text before or after it:

```json
{
  "summary": "string",
  "guests": [{ "name": "string", "affiliation": "string or null" }],
  "guestsUnnamed": false,
  "uncertain": false,
  "uncertainReason": null
}
```
