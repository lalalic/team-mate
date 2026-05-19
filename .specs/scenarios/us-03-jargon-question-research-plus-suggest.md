# US-03 — Jargon-heavy direct question → RESEARCH + SUGGEST in one turn

**Persona.** Raymond, asked a direct question containing a technical term
he might not know cold. This exercises the JARGON-IN-QUESTION rule from
`agent-prompt.md` — the highest-value multi-bubble pattern.

**Goal.** When a teammate asks Raymond a direct question whose key noun
is jargon NOT in `user_context` or `memory`, MeetMate emits TWO bubbles
in a single turn:
1. `kind: "RESEARCH"` — 1-line definition of the term + how it applies
   right now.
2. `kind: "SUGGEST"` — a draft reply that uses the term correctly.

Then `wait_for_event` parks the turn.

This is the canonical example of multiple side-effect tools followed by
the terminal `wait_for_event` in one chatCompletion turn. It also
verifies the loop's hop-handling in `runUntilPark`.

---

## Preconditions

- US-01 and US-02 passed.
- `conf.author = "Raymond"`, `preferred_language = "en"`, meeting language `en`.
- `user_context` does NOT mention "MEV-resistant atomic settlement".
- `memory.long` does NOT mention that phrase.

## Scenario

**Given** the loop is parked  
**When** a caption chunk arrives where speaker `Bob` says:
  `"Raymond, can you walk us through whether our payment flow is going
   to need MEV-resistant atomic settlement?"`  
  **And** the content script calls `loop.pushCaption(chunk)`  
**Then** the response's `choices[0].message.tool_calls` is exactly THREE
  calls in this order:  
    1. `send_suggestion` with `kind: "RESEARCH"`  
    2. `send_suggestion` with `kind: "SUGGEST"`  
    3. `wait_for_event`  
  **And** the RESEARCH bubble's `text` defines "MEV-resistant atomic
  settlement" in ≤ 2 sentences AND mentions the payment-flow context  
  **And** the SUGGEST bubble's `text` is a draft reply that uses the
  term correctly (uses some form of "MEV", "atomic", or "settlement")  
  **And** the SUGGEST chips are concrete (`"Send to Teams chat"` or
  similar), NOT generic ("Use this", "Make it shorter" forbidden)  
  **And** the loop dispatches each `send_suggestion` to
  `handlers.sendSuggestion` BEFORE invoking the next tool (verified by
  the rendered DOM order in the chat panel matching tool_call order)  
  **And** the loop is parked at the `wait_for_event` call (only ONE
  parked tool_call_id stored)  
  **And** zero duplicate bubbles in the panel (dedup window respected).

## Failure modes to watch

- Only SUGGEST emitted, no RESEARCH (Jargon rule violated — definition
  missing).
- Only RESEARCH emitted, no SUGGEST (model bailed without drafting the
  reply).
- Order reversed (SUGGEST before RESEARCH — wrong; context before action).
- Generic chips emitted (`"Use this"`, `"Skip"`).
- 4+ bubbles emitted (over budget — cap is 2).
- `wait_for_event` missing → loop dead and next caption won't trigger
  another turn.
- Two POSTs to `/llm/v1/chat/completions` for one event (model didn't
  use parallel tool_calls correctly — should be ONE response with
  multiple tool_calls).
