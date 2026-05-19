# MeetMate — Specification

Real-time AI assistant for Microsoft Teams meetings. Chrome MV3 extension.
v4.0.0.

## Problem

People in live Teams meetings need to: draft replies, polish their phrasing,
translate between meeting language and their stronger language, surface
background knowledge on jargon, and capture decisions / action items —
without breaking eye contact or pausing to type.

Existing solutions either record-only (Otter, Fireflies — passive minutes)
or open a separate chat surface that requires attention (Copilot in Teams —
manual prompting). MeetMate runs continuously, decides when to speak, and
needs zero attention until something useful is offered.

## Users

- **Primary**: hands-busy professionals in live English / Chinese / Spanish
  Teams meetings. Sales calls, customer syncs, recurring project meetings.
- **Secondary**: non-native speakers in cross-language meetings who need
  drafts in their stronger language they can paste into chat.

## Must-haves

1. **Bootstrap greeting bubble** at meeting start that infers the meeting's
   likely intent from memory + meeting metadata. (US-01)
2. **Cross-language polish**: when user speaks in their weaker language,
   emit polished version in their preferred language. (US-02)
3. **Jargon-aware direct-question handler**: emit RESEARCH (definition)
   then SUGGEST (draft reply) in one turn. (US-03)
4. **Live minutes panel**: Decisions / Action items / Open questions,
   updated by the agent during the meeting.
5. **Phase badge**: intro → discussion → decision → qna → wrap.
6. **End-of-meeting save**: minutes + memory persisted to local storage.
7. **Recurring-meeting memory**: facts and goals carry across instances of
   the same meeting title.
8. **Stripe top-up**: $1 / $10 / $100 payment links in the setup page.
9. **Model picker**: dropdown populated from `GET /llm/v1/models`.
10. **Stateless relay**: all LLM traffic over plain
    `POST /llm/v1/chat/completions`, OpenAI-compatible. No WebSocket.
11. **Neverstop loop**: every assistant reply ends with `wait_for_event`.
    Loop driven client-side; relay is stateless.
12. **200K-token compaction**: at threshold, agent calls `save_memory` +
    `update_live_minutes`, then history is truncated to a `[COMPACTED]`
    seed.
13. **User-uploaded knowledge**: text/markdown reference docs (design
    docs, briefs, notes) can be uploaded in Setup → Knowledge. An LLM
    wiki-entry per doc lives in the system prompt; full passages are
    fetched on demand via the `recall_knowledge` tool.

## Out of scope

- Recording or transcribing audio (Teams' own live captions are used).
- Sending messages on the user's behalf into Teams chat (the user copies
  the bubble text and pastes themselves — selectable text, no Send button).
- Per-user accounts / login. Device-bootstrap via `/llm/v1/register` is
  silent and stable per install.
- Translating the entire transcript on demand. The toolbar Translate button
  targets the **current intent on the floor**, not bulk.
- Sharing minutes or memory across users.

## Success Metrics

- Time-to-first-bubble after meeting start ≤ 5s (P50).
- Latency from caption arrival → bubble render ≤ 3s (P50).
- Bubble-tap-rate is NOT a goal (the user is hands-busy; bubbles are read,
  not tapped). Optimize for *bubbles-that-were-read* (impression) and
  *zero-duplicate-bubbles-per-60s* (dedup respect).
- Compaction is silent: cumulative context never blocks user (no 30s
  freeze when the budget threshold hits).
- Smoke test (`npm test`) is green on every commit.

## Updates

### 2026-05-15 — v4 neverstop refactor

Replaced v3 (WebSocket + `session.*` JSON-RPC + `ask_questions` heartbeat)
with v4 (stateless HTTPS + `wait_for_event` terminal tool + client-side
loop). See `docs/agent-design.md` for the design.

Added auth bootstrap (`src/auth.js`): silent device-ID + `POST
/llm/v1/register` → bearer stored at `conf.apiKey`. Used as
`Authorization: Bearer …` on every subsequent call.

Dropped `chrome.permissions.identity` and the old qili* host permission.
New manifest host_permissions: `["https://relay.ai.qili2.com/*"]` only.

### 2026-05-15 — 3 in-meeting happy paths

Added `.specs/scenarios/us-01..03-*.md` with Gherkin acceptance criteria.
Offline smoke harness (`tests/test-loop-session.js`) exercises all three.
Live e2e in a real Teams meeting still pending (requires user).

### 2026-06-01 — UI polish + Knowledge + memory edit

UI:
- Center / rail / live-minutes panels moved to `top: 160px` so Teams' top
  toolbar stays clickable.
- Bottom toolbar reduced to: 🌐 translate, 📋 minutes, ● attention.
  Removed: ? quickhelp, $ payment flagger, AI-chat-sidebar toggle.
- Attention button: blank label, CSS dot indicator (grey idle / red+halo
  when on). Wired via `meetmate:attention-toggle` `CustomEvent`.
- Center panel section header "Pick a reply" removed (entries speak for
  themselves now).
- Refined reply branches (clicks on a SUGGEST) get a nested visual indent
  + yellow left border to show the parent-child relationship.

Behavior:
- **Mid-speech refresh**: state-1 entry (user just started speaking) now
  emits 2-3 SUGGEST topic branches anchored to direction. A throttled
  `[SPEAKING_REFRESH]` trigger every ≥ 8 s + ≥ 2 captions re-emits fresh
  branches so the assistant tracks the user's evolving intent.
- Agent prompt: new Trigger 4g `[SPEAKING_REFRESH]`.

Memory:
- Long-term facts already editable + autosaved.
- **Recent-meeting summaries now editable inline** (textarea per row,
  500 ms autosave) with per-row × delete. Destructive "Clear all
  memory" button removed.

**Knowledge (new feature)**:
- Setup → Knowledge card. Drop in text/markdown files (`.txt`, `.md`,
  `.json`, `.csv`, `.html`). PDF/DOCX/PPT users are pointed at
  convertio.co to convert first. Stored in `chrome.storage.local` under
  `knowledge = {docs:[{id, name, size, addedAt, content, wikiEntry}]}`,
  ≤ 5 MB total.
- **Wiki-index approach**: on upload (and via a per-doc Re-index
  button), the LLM is asked for a 4-line summary
  (`Title / Keywords / Sections / Summary`). Result stored on
  `doc.wikiEntry`.
- `formatKnowledgeIndex()` concatenates every doc's wikiEntry and
  injects it into the system prompt as `{knowledge_index}` — small
  enough to live in the prompt, big enough for the agent to know
  what's in the corpus.
- **`recall_knowledge({query, limit?})` tool** registered in both main
  and translator loops (loop-session.js + util.js handler). When the
  agent sees a term that appears in the index, it calls
  `recall_knowledge` to fetch full passages.
- **Retrieval = TF-IDF over chunked text** (`knowledgeChunk` +
  `knowledgeSearch` in util.js). 600-char overlapping chunks broken at
  paragraph/sentence boundaries. Score per query token uses
  `(1 + ln(tf)) · idf`. Top-5 snippets returned with doc name + score,
  near-duplicates deduped within ±1 chunk.
- Agent prompt: new "Knowledge (uploaded reference docs)" section
  showing the index + instructions about when to call recall_knowledge
  and when to skip it.

Translator:
- Confirmed the dedicated translator session is a never-end-turn
  loop (`makeTranslatorClient`), parked on `wait_for_event` between
  captions, with `send_suggestion` forced for output. Kept stateful
  for cross-caption consistency (speaker names, terminology).
