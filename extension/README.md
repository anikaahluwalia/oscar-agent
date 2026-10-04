# Oscar for Gmail

Oscar inside Gmail, in three parts:

- **Chips in your inbox.** Each email he's read gets his call next to the subject: Handled, FYI,
  Needs you or Stopped. They take the place of his Gmail labels in the list, so you don't see both.
- **Oscar at the bottom of the page**, with a count of what needs you. When Gmail opens he says
  hello and tells you how things stand: "All handled! Nothing needs you right now." or "3 emails
  need you. I stopped 1 that looked risky.", with **Show me** for the list of what's waiting. It
  goes by itself after about 8 seconds (not while your pointer is on it), and he skips it when
  you open Gmail straight onto an email, since his panel is there. After that, one card at a
  time: all caught up, what needs you, something he handled (with Undo), an approval, something
  he stopped, and "Was that right?" (thumbs up, or what he should have done instead). Which cards
  show, whether he's there at all, which side he starts on and whether he moves are set in the
  app, under Settings > Oscar in Gmail and Notifications. With "Show Oscar in Gmail" off there's
  no Oscar, no hello and no panel opening by itself; with the cards about what's waiting off, no
  hello while something is.
- **A panel down the right** for the open email, beside Gmail rather than on top of it (Gmail gets
  narrower while it's open; in a narrow window it goes on top instead). It opens by itself every
  time you open an email, from your inbox, a label, a search, the reading pane or a link, and
  goes away when you're back in your list. Close it and it stays closed while you're on that
  email; the next one you open gets it again, and so does that one if you leave and come back.
  If Gmail is slow to show the email he waits a few seconds for it, then opens anyway. If he
  can't reach his API, or Gmail isn't connected yet, it still opens and tells you so. It's one
  short page: his call at the top (Handled, FYI, Needs you or Stopped), what he did, the email in
  a line, then what you can do (Yes or Not this one on an ask, Undo, or his draft with Open draft).
  Why is folded until you open it: only what set his call, then "Was that right?" and how to
  handle emails like it. Other emails in the thread are folded at the bottom.

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
