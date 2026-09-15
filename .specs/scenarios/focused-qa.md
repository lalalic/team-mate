# Focused Q&A — manual scenarios

Run in a real Teams meeting with live captions. The extension's relay calls
are the pass/fail signal: the network tab / relay logs must show **one**
`chat/completions` request per user ask and **none** for captions.

## 1. Captions are inert

Captions flow for a minute. Assert: badge count rises, no relay request, the
rail shows the idle hint, and no request is made when the meeting is silent.

## 2. Knowledge-grounded answer

Upload a doc containing a fact that is not in the transcript (e.g. a cutover
date). Ask about it. Assert: the answer states the fact, names the document,
and does not claim it was said in the meeting.

## 3. Transcript-grounded answer

Ask "what did <speaker> just say about <topic>?" after they said it. Assert:
the answer reflects the transcript line and does not invent extra detail.

## 4. Unsupported question

Ask about something neither the transcript nor the knowledge covers. Assert:
the answer says the context does not support it (no invented fact, no
hallucinated number).

## 5. Shortcut parity

Tap each default shortcut. Assert: each tap sends exactly one request, and a
shortcut tap is indistinguishable from typing the same prompt.

## 6. Setup shortcuts

In Setup → Shortcuts: rename a label, change a prompt, add a row, remove a
row, then Reset to defaults. Assert: the rail updates live in an open meeting,
changes survive a reload, and a list with only blank rows falls back to the
four defaults.

## 7. Meeting end

Leave the meeting. Assert: rail disappears, `.vtt` downloads with the
transcript only (no minutes trailer), and no further relay requests occur.
