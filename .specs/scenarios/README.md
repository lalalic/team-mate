# In-Meeting Happy Paths

End-to-end scenarios that exercise the v4 neverstop loop while a real
Teams meeting is running. Each one is a single contiguous flow — no
app restart, no re-auth — so they smoke-test the full bootstrap →
event → side-effect-tool → park cycle.

End-to-end **journeys** (multi-story) live in
[`happy-paths.md`](./happy-paths.md). Per-story scenarios are below.

Run order:
1. `us-01-meeting-start-greeting.md`
2. `us-02-user-spoke-cross-language-polish.md`
3. `us-03-jargon-question-research-plus-suggest.md`
4. `us-04-knowledge-recall.md` — caption mentions an uploaded doc →
   `recall_knowledge` → FACT bubble.
5. `us-05-mid-speech-refresh.md` — user keeps talking → topic branches
   refresh every ≥ 8 s + ≥ 2 fresh captions via `[SPEAKING_REFRESH]`.

Acceptance for the whole bundle:
- Every scenario produces ONE neverstop `wait_for_event` park per turn.
- No bubble repeats within 60s (dedup window).
- No `ask_questions`, no `external_tool.requested`, no WebSocket frames
  in the network log.
- All HTTPS traffic is to `https://relay.ai.qili2.com/llm/v1/*` only.
