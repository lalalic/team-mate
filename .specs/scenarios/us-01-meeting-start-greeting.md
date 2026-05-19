# US-01 — Greeting bubble at meeting start

**Persona.** Raymond, a Senior Engineer running a recurring "Phoenix
weekly sync" with two teammates. Preferred language English; meeting
language English.

**Goal.** Within 5 seconds of the meeting starting, MeetMate prints
exactly ONE greeting bubble that names Raymond, lists 2–4 likely topics
inferred from memory/meeting_meta, and tells him the assistant will work
in the background. The loop then parks awaiting the first caption.

---

## Preconditions

- Extension v4.0.0 installed and enabled. Device already registered
  (bearer in `conf.apiKey`).
- `conf.author = "Raymond"`, `conf.preferred_language = "en"`.
- `memory.long` contains at least: `"Phoenix weekly sync usually starts
  with Q4 launch blockers"`.
- Teams web client is at `teams.microsoft.com` with live captions ENABLED.
- Network log capture is on (DevTools → Network → preserve log).

## Scenario

**Given** the user is in a fresh Teams call titled "Phoenix weekly sync"  
  **And** no captions have been emitted yet  
**When** the content script detects the meeting and constructs the
  system prompt with `{author}`, `{name}`, `{meeting_meta}`, `{memory}`  
  **And** `createLoopSession().start()` posts the bootstrap user message  
**Then** within 5s the chat panel shows EXACTLY ONE `send_suggestion`
  bubble  
  **And** the bubble text contains the token "Raymond"  
  **And** the bubble text contains at least 2 lines starting with "•" or
  a digit-dot bullet  
  **And** the bubble text contains a phrase like "polish", "translate",
  "suggest", or "minutes" (the closing reassurance line)  
  **And** the network log shows exactly ONE POST to
  `/llm/v1/chat/completions` with status 200  
  **And** the response's `choices[0].message.tool_calls` contains
  `send_suggestion` THEN `wait_for_event` in that order  
  **And** the loop is parked (no further HTTPS calls until a caption
  arrives).

## Failure modes to watch

- 2+ greeting bubbles (model didn't park correctly).
- Bubble asks the user "what do you want to do today?" (forbidden — user
  intent is constant; we infer meeting intent).
- Chips listing "Presenting / Listening / Fielding Qs" (forbidden chip
  style).
- HTTPS call hits any host other than `relay.ai.qili2.com`.
- `wait_for_event` missing from tool_calls → loop dead.
