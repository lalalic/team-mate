# MeetMate — focused Q&A spec

## Goal

Turn MeetMate into an explicit, grounded Q&A assistant for live Teams
meetings: the meeting is captured locally, and the user asks questions that
are answered from that meeting plus their uploaded knowledge.

## Non-goals

Autonomous assistance of any kind. Specifically out of scope: state machine,
speaking/mentioned/attention detection, caption-triggered model calls,
heartbeats, LLM greetings, generated chips, goal binding, auto-minutes,
cross-meeting memory, and the replay/demo runtime.

## Requirements

| # | Requirement |
|---|---|
| R1 | Teams captions are captured continuously (DOM observer + React-fiber polling) and append to a local transcript. |
| R2 | Caption arrival never calls an LLM and never creates a suggestion. |
| R3 | The rail offers a shortcuts row, an answers history, and an Ask input. No state concept. |
| R4 | A shortcut tap and a typed question both call the single `ask(question)` function. |
| R5 | `ask` builds context from the current transcript plus retrieved knowledge, makes one relay request, and returns the answer. |
| R6 | Shortcuts are `{label, prompt}` items configured in Setup, defaulting to Reply / Facts / Question / Challenge. |
| R7 | Knowledge uses the existing plain TF-IDF retrieval. No vector DB, no new dependency. |
| R8 | The system prompt requires grounding in supplied context, separation of transcript vs knowledge, no invented facts, an explicit "not supported" answer when the context is insufficient, and concise live-readable style. |
| R9 | The transcript is exported as VTT on meeting end, with no minutes appendix. |
| R10 | Setup keeps direct provider / model / knowledge and adds shortcut CRUD; no relay, account, or billing layer. |
| R11 | `npm test` and `npm run build` pass. |

## Acceptance scenarios

### S1 — quiet capture
Given a meeting with captions flowing, when 50 captions arrive, then the local
transcript grows, the badge updates, and zero relay requests are made.

### S2 — typed ask
Given captions mentioning a rollback discussion, when the user asks "should we
roll back?", then exactly one relay request is made containing the recent
transcript and the question, and the answer renders under the question.

### S3 — shortcut ask
Given the default shortcuts, when the user taps "Facts", then one request is
made whose question is the Facts prompt, and knowledge passages relevant to
the current discussion are included.

### S4 — unsupported question
Given a meeting and knowledge that do not cover X, when the user asks about X,
then the answer states that the context does not support it rather than
inventing a fact.

### S5 — knowledge citation
Given an uploaded doc that covers X, when the user asks about X, then the
answer uses the doc's content and names the document.

### S6 — shortcut config
Given Setup → Shortcuts, when the user edits a label/prompt, removes a row, or
adds one, then the rail reflects it (live in an active meeting) and the change
survives reload. An empty or invalid list falls back to the four defaults.

### S7 — meeting end
Given an active meeting, when the user leaves, then the rail and capture
teardown runs, a `.vtt` transcript downloads, and no minutes are generated.

## Verification

- `npm test` — pure helpers: shortcut normalization, transcript bounding,
  knowledge ranking, ask payload (blocks, grounding rules, bounds).
- `npm run build` — webpack production build + zip.
- Manual: S1–S7 in a real Teams meeting (see README "Manual E2E").
