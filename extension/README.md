# Oscar for Gmail

Oscar inside Gmail, in three parts:

- **Chips in your inbox.** Each email he's read gets his call next to the subject: Handled, FYI,
  Needs you or Stopped. They take the place of his Gmail labels in the list, so you don't see both.
- **Oscar at the bottom of the page**, with a count of what needs you and one card at a time:
  all caught up, what needs you, something he handled (with Undo), an approval, something he
  stopped, and "Was that right?" (thumbs up, or what he should have done instead). Which cards
  show, whether he's there at all, which side he starts on and whether he moves are set in the
  app, under Settings > Oscar in Gmail and Notifications.
- **A panel down the right** for the open email: Summary (what it is, what he recommends and why),
  Actions (what he did, Approve, Undo, "always do this" or "always ask me", and "Was that right?"),
  Why? (what mattered and any safety rule) and Thread (his call on each email in it).

While he only reads your Gmail, there's nothing to approve or undo; it's "Check this call".

## Try it

1. Start Oscar's API (and the web app) as in the main README.
2. In Chrome, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**,
   and pick this `extension` folder.
3. Open Gmail. Oscar is in the bottom-right corner. Drag him anywhere along the bottom, or Tab to him and use the arrow keys; he remembers where you put him.

If Oscar runs somewhere other than `localhost:8000` (API) and `localhost:3000` (app), set it in
the extension's options (right-click the icon → Options).

It also works in other Chromium browsers (Edge, Brave, Arc, Opera) the same way.

## What it can and can't do

- Only the background script talks to Oscar's API, and only for a few things: what's waiting,
  his call on one thread or on the threads in your list, an answer through the app's own feedback
  endpoint (Approve, Not this one, Undo, Got it, Always do this, Always ask me), and "Was that
  right?" as a review, the same as the Review page. Gmail's page never gets access to the API.
- It only reaches localhost. Email text is always shown as text, never as HTML.
- From Gmail's page it reads thread ids (of the open email and of the rows in your list), Gmail's
  background colour (so Oscar matches your Gmail theme), and his own label chips (to hide them
  where his chip is). Nothing else on the page is read.
- Which cards you've seen is kept in this browser only, so each one shows once.
