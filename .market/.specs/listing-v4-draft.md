# Chrome Web Store — MeetMate listing draft

The listing sells one thing: **ask your meeting anything, and get an answer
grounded in what was actually said plus the docs you uploaded.** No bot joins
the call; model requests organize your library or answer your question.

## Competitive positioning

| Competitor (top "similar")        | Stars | Model                                 |
| --------------------------------- | ----- | ------------------------------------- |
| Tactiq — AI note taker            | 4.8 ★ | Sends a bot into the call, post-notes |
| himala — Meeting Assistant        | 5.0 ★ | Prep + post-call notes                |
| FuseBase PRO — AI note taker      | 4.3 ★ | Recorder + transcriber                |
| Sharpen AI — meeting summary      | —     | Post-call summary only                |
| **MeetMate (us)**                 | TBD   | **Ask-anything copilot inside your Teams tab, grounded, no bot** |

Our edge: MeetMate runs inside YOUR Teams tab — no meeting-bot permission, no
admin approval, no enterprise license. It captures the live captions locally
and answers only when you ask.

## Title (45 char max)

`MeetMate — Ask Your Meeting Anything` (36)

Alt: `MeetMate: Live Q&A for Microsoft Teams` (39)

## Summary (132 char max)

> Ask your Teams meeting anything. Answers grounded in the live transcript and
> your own organized docs. No bot. (110)

## Detailed description (16k char max — keep it scannable)

```
MeetMate is a grounded Q&A assistant for Microsoft Teams meetings. It runs
inside your Teams tab — not a bot in the call, not a post-meeting summary
email.

CAPTIONS STAY LOCAL UNTIL YOU ASK
MeetMate captures the live captions continuously, in your browser. Nothing is
sent to an AI model while captions stream — no auto-suggestions, no
interruptions. The model runs only when you ask a question.

ASK ANYTHING, OR TAP A SHORTCUT
Type a question in the side rail, or tap a shortcut:

  • Reply      — Give me a concise response I can say now based on the current discussion.
  • Facts      — Surface the most relevant facts from my knowledge for the current discussion.
  • Question   — Suggest the best concise question I should ask next.
  • Challenge  — Identify the strongest assumption, risk, or point I should challenge.

Shortcuts are yours to edit in Settings: add, rename, rewrite, or remove them.

ANSWERS GROUNDED IN TWO SOURCES
Every answer is built from the current meeting transcript plus the passages
most relevant to your question, retrieved from the documents you uploaded.
MeetMate is instructed to keep those sources apart, to never invent facts, and
to tell you plainly when neither source supports an answer.

Answers are short on purpose — one to four sentences. You are reading them
while somebody else is still talking.

PREMIUM KNOWLEDGE, AUTOMATICALLY ORGANIZED
Drop in design docs, briefs, specs, or notes (.txt, .md, .json, .csv, .html).
They stay in your browser's local storage. After every upload, replacement, or
removal, Premium Knowledge automatically rebuilds one organized structure.
During meetings, answers retrieve supporting detail from that library.
MeetMate does not impose an artificial 5 MB application cap (the browser's
available extension storage still applies).

OPEN ANSWERS IN A LARGER VIEW
Click a question or its larger-view control to read the answer in an
accessible expanded window without losing the meeting context.

MEETING-READY DETAILS
  • Works with Teams' own live captions — no bot invited, no recording
  • Transcript export to .vtt when the meeting ends
  • Configurable shortcuts and model
  • Optional Premium upgrade via Stripe Payment Link; no subscription required
  • Everything (transcript, knowledge, settings, and local Premium entitlement) stays in chrome.storage.local

A NOTE ON SCOPE
MeetMate does not summarise your meeting, take minutes, or remember past
meetings. It answers the question you ask, from the context it has, and says
so when it can't.
```

## Permissions rationale (for the review form)

- `storage` — transcript buffer, settings, uploaded knowledge (all local).
- `activeTab` / `tabs` — open or focus the Teams tab from the popup.
- `downloads` — save the `.vtt` transcript export.
- provider network access — used for explicit Ask requests, `/models` discovery, and automatic Premium Knowledge organization after library changes; the default endpoint is OpenRouter and Advanced can point to a custom/local OpenAI-compatible endpoint.
