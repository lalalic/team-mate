# MeetMate Agent Design — grounded Q&A

## 1. Product shape

MeetMate is an **explicit grounded Q&A assistant** for live Teams meetings.
It does not participate on its own. The user asks; MeetMate answers from the
meeting so far, plus the reference docs the user uploaded.

Two invariants define the product:

1. **Caption arrival never calls a model and never creates a suggestion.**
   Captions append to a local buffer.
2. **Exactly one code path calls the model:** `ask(question)`
   ([src/util.js](../src/util.js)).

## 2. Components

| Module | Role |
|---|---|
| [src/content.js](../src/content.js) | Meeting lifecycle, caption capture (DOM observer + React-fiber poller), rail mount, ask handler |
| [src/ui-controller.js](../src/ui-controller.js) | The rail: shortcuts row, question/answer log, Ask input |
| [src/focused.js](../src/focused.js) | Pure helpers: shortcut normalization, transcript formatting, knowledge chunking + TF-IDF retrieval, ask payload |
| [src/util.js](../src/util.js) | `ask()` — retrieval + payload + one relay call; knowledge and shortcut accessors |
| [src/relay.js](../src/relay.js) | Stateless HTTPS client for copilot-relay; auth, wallet, usage |

There is **no** state machine, loop session, heartbeat, memory store, or
minutes generator. Their files were deleted with the feature
(`src/state-machine.js`, `src/loop-session.js`, `src/memory.js`).

## 3. Ask flow

```
shortcut tap ─┐
              ├─► handleAsk(question, rowId) ─► ask({question, transcripts})
typed Ask ────┘                                        │
                                                       ├─ loadAskSystemPrompt()
                                                       ├─ retrieveKnowledge(question, transcripts)
                                                       ├─ buildAskMessages(...)
                                                       └─ chatCompletion({messages})
                                                              │
                              ui.resolveAsk(rowId, answer) ◄──┘
```

`handleAsk` refuses to call the model when the extension is not configured
(no `token` / `apiKey` / `baseURL`) and writes that into the row instead.
Failures (including `insufficient_funds` from the relay) are rendered in the
same row.

## 4. Grounding

### 4.1 Transcript

- Source: `transcripts` array owned by `content.js`, one `{Name, Text, Time}`
  per final caption.
- Dedup: consecutive-identical guard on the DOM path, last-5-window guard on
  the fiber path.
- Bounding: `formatTranscript()` keeps the **most recent** lines that fit in
  `maxTranscriptChars` (default 6000) and prefixes
  `[... earlier captions omitted ...]` when it drops anything. Lines are
  whitespace-collapsed and individually clipped at 400 chars. The result is
  always whole lines, never a half sentence.

### 4.2 Knowledge

- Storage: `chrome.storage.local.knowledge = {docs: [{id, name, size, addedAt, content}]}`,
  uploaded in Setup (plain text formats only, ~5 MB cap). Uploads are
  local-only — no model call, no pre-built index.
- Chunking: 600-char windows with 100-char overlap, cut on paragraph or
  sentence boundaries where possible.
- Scoring: TF-IDF over chunks (chunk treated as a document), top-K with
  adjacent-chunk de-duplication. No embeddings, no vector DB, no new
  dependency.
- Query: the question **plus the most recent transcript lines** (bounded to
  1200 chars) — a shortcut prompt such as "Reply" is too short to match
  anything on its own.

### 4.3 Payload

`buildAskMessages()` produces exactly one system and one user message:

```
[MEETING TRANSCRIPT -- most recent last]
Alice : Should we roll back before the customer call?
Bob : Prod has been OOM-ing every two hours since the deploy.

[RELEVANT KNOWLEDGE]
- (deploy-notes.md) The last deploy enabled the new cache layer.

[QUESTION]
What did Bob say about prod?
```

When nothing matched, the knowledge block says `(none matched this question)`
explicitly instead of being omitted — silence is ambiguous, a marker is not.
When no captions exist yet the transcript block says
`(no captions captured yet)`.

## 5. System prompt

[extension/agent-prompt.md](../extension/agent-prompt.md) is fetched at
runtime (so it can be edited without a rebuild) and falls back to
`DEFAULT_ASK_SYSTEM_PROMPT` in `src/focused.js`. It states, in order:

1. answer only from supplied context,
2. keep transcript and knowledge separate and attribute knowledge to its
   document,
3. never invent unsupported facts — say plainly when the context does not
   support an answer,
4. surface disagreement rather than silently choosing a source.

Style rules: answer first, 1–4 short sentences, plain text, no headings or
tables, answer in the language of the question.

Placeholders: `{author}`, `{name}`.

## 6. Shortcuts

`conf.shortcuts = [{label, prompt}]`, edited in Setup → Shortcuts.
Defaults:

| Label | Prompt |
|---|---|
| Reply | Give me a concise response I can say now based on the current discussion. |
| Facts | Surface the most relevant facts from my knowledge for the current discussion. |
| Question | Suggest the best concise question I should ask next. |
| Challenge | Identify the strongest assumption, risk, or point I should challenge. |

`normalizeShortcuts()` trims, drops blank rows, de-dupes labels
case-insensitively, caps the list at 8 and labels at 24 chars, and falls back
to the defaults when everything was invalid. A shortcut tap and a typed
question are indistinguishable downstream: both call `ask(question)`.

## 7. Deliberately absent

Removed with the autonomous design, and intentionally not re-added: state
machine, speaking/mentioned/attention signals, caption-triggered loop and
heartbeat, LLM greeting, generated chips, goal binding, auto-minutes and the
VTT minutes appendix, cross-meeting memory and end-of-meeting distillation,
and the demo/replay scenario runtime.

## 8. Verification

`npm test` covers the pure helpers (shortcuts, transcript bounding,
retrieval, payload). The invariants that need a browser are checked manually:
no relay request on caption arrival, exactly one request per ask, grounded
answer for covered questions, explicit refusal for uncovered ones.
