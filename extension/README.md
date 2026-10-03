# Oscar for Gmail

Oscar peeks out of the bottom-right corner of Gmail with a count of what needs you. Click him
for his call on the email you have open (and why), what else is waiting, and the same buttons as
the app: Approve, Not this one, Undo. While he only reads your Gmail, it's "Check this call".

## Try it

1. Start Oscar's API (and the web app) as in the main README.
2. In Chrome, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**,
   and pick this `extension` folder.
3. Open Gmail. Oscar is in the bottom-right corner. Drag him anywhere along the bottom, or Tab to him and use the arrow keys; he remembers where you put him.

If Oscar runs somewhere other than `localhost:8000` (API) and `localhost:3000` (app), set it in
the extension's options (right-click the icon → Options).

## What it can and can't do

- Only the background script talks to Oscar's API, and only for three things: what's waiting,
  his call on one thread, and an answer (Approve, Not this one, Undo) through the app's own
  feedback endpoint. Gmail's page never gets access to the API.
- It only reaches localhost. Email text is always shown as text, never as HTML.
- It reads the open email's thread id from Gmail's page. Nothing else on the page is read.
