# US-05 — User keeps talking → branches refresh mid-speech

**Persona.** Raymond is in the middle of a long reply. He starts with
"Let me think about that…", then a few seconds in he pivots to a
concrete proposal. MeetMate should not be stuck on the topic branches
it emitted at the very start of his turn — it should refresh them as
the direction shifts.

**Goal.** Verify the **state-1 mid-speech refresh** behaviour:

1. State-1 entry (the moment the user starts speaking) emits 2-3
   `SUGGEST` topic branches anchored to what the user appears to be
   steering toward.
2. While still in state-1, after ≥ 8 seconds AND ≥ 2 fresh captions,
   `content.js` injects a `[SPEAKING_REFRESH]` event into the loop.
3. Trigger 4g in `agent-prompt.md` instructs the model to re-emit 2-3
   fresh SUGGEST branches anchored to the user's NOW (not their initial
   direction), keeping the `**Topic** — body` format.
4. Throttling: no refresh fires more often than every 8 seconds.

---

## Preconditions

- US-01 / US-02 passed.
- `conf.author = "Raymond"`, `preferred_language = "en"`.
- State-machine constants: `STATE2_STICKY_MS = 30000`,
  `STATE3_STICKY_MS = 60000`, `TALK_PAUSE_MS = 2000`. State-1 entry
  fires the first time the speaker switches to the user.

## Scenario

**Given** Raymond was previously silent (state ≠ 1)
**When** the first caption with `Name === conf.author` arrives, e.g.:
  `Raymond: "Hmm, let me think about that…"`
**Then** the content script's `reclassifyState`:
  - transitions `prev !== 1 → result.state === 1`
  - pushes a `[FOCUS_HIGH source=speaking]` user message to the loop
    asking for 2-3 SUGGEST topic branches + 1 FACT + 1 RESEARCH
  - records `_lastSpeakRefreshAt = now`, `_lastSpeakRefreshCount = transcripts.length`
**And** the next model turn emits:
  - 2-3 `send_suggestion({kind: "SUGGEST"})` calls, each in the
    `**Topic ≤ 5 words** — body ≤ 25 words` format
  - 1 `send_suggestion({kind: "FACT"})`
  - 1 `send_suggestion({kind: "RESEARCH"})`
  - `wait_for_event` to park

**When** Raymond continues talking. Two more captions arrive at
  `+4s` and `+9s` from `_lastSpeakRefreshAt`:
  - `Raymond: "Actually, let's talk timelines for the rollout."`
  - `Raymond: "I'm thinking Phase 1 in Q3, with the team in Toronto."`
**And** these arrive while still in state-1 (no transition)
**Then** `reclassifyState`'s else-if branch fires (`result.state === 1`
  with no state transition):
  - `now - _lastSpeakRefreshAt >= 8000` ✓
  - `transcripts.length - _lastSpeakRefreshCount >= 2` ✓
  - so it pushes a `[SPEAKING_REFRESH]` user message
  - updates `_lastSpeakRefreshAt` and `_lastSpeakRefreshCount`
**And** the next model turn re-emits 2-3 fresh `SUGGEST` topic branches
  whose topics reflect "timeline" / "Q3" / "Toronto" / "Phase 1" —
  NOT the original "let me think" / open-ended directions.

## Throttle guarantee

**Given** `[SPEAKING_REFRESH]` was just fired
**When** another caption arrives 3 s later (still in state-1)
**Then** NO new `[SPEAKING_REFRESH]` is fired (8 s minimum not yet elapsed).

## Failure modes to watch

- Refresh fires every caption (no throttle) → wastes tokens, panel
  flickers.
- Refresh never fires → branches go stale as user's direction shifts.
- Refresh fires on state transitions other than state-1 (e.g.
  state-2 → state-1) — that path is correctly handled by the state-1
  entry block, not the refresh block.
- New branches repeat the original branches verbatim (model didn't
  actually re-anchor to NOW).
- Format drifts — model emits flat "Sure, you could say X" instead of
  `**Topic** — body`.
- State-2 mentions accidentally trigger a refresh (they shouldn't —
  they fire `[FOCUS_HIGH source=mentioned]` instead).
