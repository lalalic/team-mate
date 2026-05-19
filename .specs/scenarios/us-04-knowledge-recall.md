# US-04 — Caption mentions an uploaded doc → recall_knowledge → FACT bubble

**Persona.** Raymond uploaded `exstream-throughput-v3.md` last week. In
today's meeting, Bob mentions "ExStream's new throughput design". The
agent should recognise the term from the system-prompt knowledge index,
call `recall_knowledge` to fetch the relevant passage, then emit a
**FACT** bubble citing the doc.

**Goal.** Verify the full Knowledge pipeline end-to-end:

1. Upload → `relayChat()` generates a wiki entry.
2. Wiki entry lands in `chrome.storage.local.knowledge.docs[i].wikiEntry`.
3. `formatKnowledgeIndex()` injects it into the system prompt as
   `{knowledge_index}` on meeting start.
4. Model spots the term in a caption, calls `recall_knowledge`
   with focused keywords.
5. TF-IDF handler returns matching snippets with doc name.
6. Model emits a FACT bubble that quotes / paraphrases the snippet and
   names the source doc.

---

## Preconditions

- US-01 / US-02 / US-03 passed.
- A small plain-text doc named `exstream-throughput-v3.md` (≤ 4 KB) has
  been uploaded in Setup → Knowledge. Sample content:

  ```
  # ExStream Throughput Design v3

  ## Goals
  Sustain 50k events / second per shard with p99 latency ≤ 80 ms.

  ## Sharding
  Hash-by-tenantId, 16 logical shards mapped to 4 physical workers.
  Workers rebalance lazily via consistent hashing on heartbeat loss.

  ## Backpressure
  Per-shard token bucket of 1000 events / 100 ms. Excess overflows to
  a 60-second disk spool and is replayed before live traffic resumes.
  ```

- The doc's `wikiEntry` has been generated (green ● indicator on the
  Knowledge card).
- `conf.author = "Raymond"`, `preferred_language = "en"`, meeting
  language = `en`.

## Scenario

**Given** the loop is parked and the system prompt's `{knowledge_index}`
  contains the wiki entry for `exstream-throughput-v3.md` (with
  keywords like *throughput, sharding, backpressure, p99*)
**When** a caption arrives where speaker `Bob` says:
  `"Raymond, can you remind everyone how ExStream's new throughput
   design handles backpressure?"`
  **And** `loop.pushCaption(chunk)` is invoked
**Then** the response's `tool_calls` contain (order matters):
  1. **`recall_knowledge`** with a `query` that combines `exstream`,
     `throughput`, `backpressure` (any 2 of those terms minimum)
  2. The tool result returns at least one snippet whose `doc` is
     `exstream-throughput-v3.md` and whose `snippet` mentions
     "token bucket" or "disk spool"
  3. A follow-up turn (after `recall_knowledge` returns) emits a
     `send_suggestion` with `kind: "FACT"` whose `text`:
     - cites the source doc by name (substring match for
       `exstream-throughput-v3.md` OR `ExStream`)
     - mentions the backpressure mechanism (token bucket / disk spool)
  4. `wait_for_event` parks the turn

  **And** the FACT bubble is rendered into the rail (not the center
    panel — center is for SUGGEST topic branches only).
  **And** the assistant did NOT fabricate details that are not in the
    snippet (e.g. it does NOT say "100k events/sec" — the doc says 50k).

## Negative case (graceful empty)

**Given** the same loop, but with NO docs uploaded
**When** the same caption arrives
**Then** the model does NOT call `recall_knowledge` at all
  (the prompt instructs it to skip when the index says `(none)`)
  **Or** if it does call `recall_knowledge`, the response includes a
    `note` field saying no docs are uploaded, and the model does NOT
    invent a FACT — it falls back to a normal SUGGEST drafting a
    plausible answer.

## Failure modes to watch

- Model calls `recall_knowledge` with a too-narrow single keyword
  (low recall).
- Model calls `recall_knowledge` for topics that are NOT in the
  index (wasted round-trip).
- Model hallucinates a doc name that doesn't exist.
- Wiki entry was never generated (`wikiEntry: ""`) so the index falls
  back to first-200-chars and is too vague for the model to recognise
  the topic.
- FACT bubble cites the snippet text but forgets the doc name.
- `recall_knowledge` returns snippets in the wrong order (lowest score
  first) — verify TF-IDF sort is descending.
- Total chunked-and-scored docs exceeds the in-memory budget (only
  matters at corpus size > a few hundred chunks).
