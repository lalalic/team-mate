# Happy Paths

End-to-end journeys with **real captions from a realistic Acme
integration meeting**. Each step shows the side panel reacting to a
distinct conversational state, so the journey proves the extension is
genuinely useful — not just technically wired.

## The four reactive states

The side panel listens to captions and to the user's own input cues,
and moves between four reactive states. Each state changes WHERE
bubbles appear and WHAT the model should emit.

| #   | State           | Trigger                                          | Where bubbles appear | What the model emits |
|-----|-----------------|--------------------------------------------------|----------------------|------------------------|
| S-1 | **Listening**   | Someone else is talking, Raymond is silent       | Side rail            | Light: 0–1 FACT or RESEARCH when something concrete lands (term, number, decision). Quiet otherwise. |
| S-2 | **Mentioned**   | `[FOCUS_HIGH] source=mentioned` — Raymond is addressed by name with a question | Center panel | 2–3 SUGGEST topic branches (`**Topic** — draft reply`) + optional 1 FACT + 1 RESEARCH in rail |
| S-3 | **Speaking**    | `[FOCUS_HIGH] source=speaking` — Raymond is the one talking; `[SPEAKING_REFRESH]` every ≥ 8 s while he keeps going | Center panel | 2–3 SUGGEST continuation drafts, refreshed on each `[SPEAKING_REFRESH]` |
| S-4 | **Attention**   | `[FOCUS_HIGH] source=attention_toggle` (🎯) or `[QUICK_HELP]` (❓) — Raymond pulls help on his own | Center panel | 2–3 SUGGEST options (🎯) or 1 SUGGEST + chips (❓) anchored to recent captions |

All four hand control back to S-1 (listening) after the user reacts
(picks a branch, finishes speaking, dismisses the panel) or after
silence.

---

## HP-01: Acme integration kickoff — full reactive sweep (`acme-kickoff-flow`)

**Covers:** US-01, US-02, US-03, US-04, US-05, plus the 🎯 / ❓
attention buttons.

**Demo slug:** `acme-kickoff-flow`

**Given**
- Raymond has signed in and uploaded `exstream-throughput-v3.md`
  (excerpt: "Per-shard token bucket of 1000 events / 100 ms. Excess
  overflows to a 60-second disk spool and is replayed before live
  traffic resumes. Target sustained throughput: 50 k events/sec at
  p99 ≤ 180 ms.").
- Persisted context: `"Acme integration kickoff — discussing API
  throughput targets and SLA"`.
- Meeting participants: **Raymond** (host, our side), **Bob** (Acme
  PM), **Sarah** (Acme engineer).

---

### Step 1 — State S-1 boots from cold (greeting → listening)

**Captions before the panel boots:** *(none — meeting just started)*

**When** the side panel boots
**Then** within 2 s a `SUGGEST` greeting bubble appears in the rail:

> "Hi Raymond — caught up on the Acme integration kickoff. Listening
> for the API throughput / SLA discussion."

**And** the PAOR indicator shows `Planning`
**And** the loop parks on `wait_for_event`
**And** the system prompt sent to the model contained the
`### exstream-throughput-v3.md` index entry (Knowledge index present).

> **User value:** Raymond walks in without re-priming the agent. The
> greeting confirms it knows the topic AND the uploaded doc.

---

### Step 2 — State S-1 keeps listening, surfaces a quiet FACT

**Captions:**
- `[00:01:12] Bob: "So before we get into numbers — we're looking at
  five-thousand events per second steady state, peaking maybe twelve
  thousand for the daily batch."`
- `[00:01:34] Sarah: "And we'd want a P99 under three hundred
  milliseconds end-to-end."`

**Then** within 2 s of Sarah's caption, ONE `FACT` bubble appears in
the rail:

> "📌 Our ExStream design (doc: `exstream-throughput-v3.md`) targets
> 50 k events/sec at p99 ≤ 180 ms — well above Acme's ask (12 k peak,
> 300 ms p99)."

**And** the loop called `recall_knowledge({query: "exstream
throughput p99 sla"})` exactly once
**And** the FACT cites the doc by name AND names a concrete number
from it (50 k / 180 ms)
**And** no SUGGEST/RESEARCH spam — listening state stays calm.

> **User value:** Without saying a word, Raymond now has a quoted
> source-of-truth ready to deploy.

---

### Step 3 — Transition to S-2 (Mentioned)

**Caption:**
- `[00:02:48] Bob: "Raymond, can you tell us if our SLA target is
  realistic from your side?"`

**Then** within 2 s the **center panel opens** with 2–3 SUGGEST topic
branches (no side-rail spam), each in `**Topic** — body` format:

> "**Headroom check** — Yes — our current design tops at 50 k/sec at
> 180 ms p99, so your 12 k / 300 ms target has 4× headroom."
>
> "**Caveat: cold-start** — Realistic in steady state. First 60 s
> after deploy spills to disk spool, may show 400–500 ms p99."
>
> "**Scope clarify** — Is the 300 ms end-to-end including your client
> side, or just our API?"

**And** optionally ONE supporting FACT (the recall snippet) appears
in the rail
**And** the PAOR indicator flips to `Acting`
**And** chips are NOT generic ("Use this" / "Skip" forbidden).

> **User value:** Raymond doesn't have to think on his feet. Three
> different framings of an answer are right there.

---

### Step 4 — User picks a branch → S-2 sub-refines (`[WILL_SAY]`)

**Trigger:** Raymond clicks the **Cold-start caveat** branch.
A `[WILL_SAY]` event fires with the chosen bubble's text.

**Then** within 1.5 s, 1–2 refined SUGGEST bubbles appear nested
under that branch in the center panel:

> "Yes, sustainable — the only honest caveat is the first 60 s after
> a fresh deploy can hit ≈ 400 ms p99 while the disk spool drains.
> Want me to send the design doc?"
>
> "**With numbers** — Steady state 50 k/sec at 180 ms p99. Cold
> start: ~400 ms for ≤ 60 s. Steady within ~1 minute."

**And** the refined bubbles do NOT repeat the parent's `**Cold-start
caveat**` label
**And** if a number / commitment is in the picked branch, `remember`
fires once to log Raymond's intent.

> **User value:** Raymond has a polished line ready to read aloud.

---

### Step 5 — Transition to S-3 (Speaking) with mid-speech refresh

**Captions (Raymond is now talking):**
- `[00:03:30] Raymond: "Yeah, so on our side the design is actually
  built for fifty-thousand events per second, way above what you're
  asking for."`
- `[00:03:46] Raymond: "The one thing I'd flag is the first minute
  after a deploy — we use a disk spool for backpressure, so latency
  can spike to maybe four-hundred milliseconds for that window."`

**Then** at the START of Raymond's first caption, a `[FOCUS_HIGH]
source=speaking` fires
**And** within 2 s the center panel shows 2–3 SUGGEST continuation
drafts (what he could say *next*), e.g.:

> "**Validation plan** — I can run a peak-traffic load test this
> week to confirm 12 k/sec stays well under 300 ms."
>
> "**Acme-specific** — If your batch peaks line up, we could
> pre-warm the spool path before your run starts."
>
> "**Risk callout** — One thing to watch: if your client retries
> aggressively on the cold-start blip, you'll amplify load."

**And** ~ 8 s later (still in S-3, after Raymond's second caption), a
`[SPEAKING_REFRESH]` fires
**And** the center panel REPLACES the branches with fresh ones
anchored to what he's saying NOW (disk spool / cold-start specifics),
e.g.:

> "**Mitigation** — We've added a pre-warm hook the deploy script
> can fire 60 s before traffic; happy to enable it for Acme."
>
> "**Measurement** — I can share the cold-start latency histogram
> from our last release."

**And** no more than ONE `[SPEAKING_REFRESH]` per 8 s window.
**And** when Raymond goes silent for > 4 s the panel hides and the
loop returns to S-1 (rail-only, listening).

> **User value:** The agent is following Raymond LIVE — fresh
> continuations match what he just said, not what he started with.

---

### Step 6 — State S-4 manually invoked via 🎯, then ❓ for quick help

**Caption:**
- `[00:05:10] Sarah: "Quick one — does your design support
  multi-tenant isolation, or is it single-tenant per cluster?"`

**Trigger:** Raymond is unsure how to phrase a reply. He hits the
**🎯 attention** button. `[FOCUS_HIGH] source=attention_toggle`
fires.

**Then** within 2 s the center panel shows 2–3 SUGGEST branches
focused on Sarah's question:

> "**Direct answer** — Single-tenant per cluster today, but we shard
> by tenant ID within the cluster so isolation is logical."
>
> "**Future plan** — Hard multi-tenant is on the H2 roadmap if Acme
> needs it — would that be a deal-breaker?"
>
> "**Clarify** — Are you asking about data isolation, throughput
> isolation, or both?"

**Then later:** Raymond hits the **❓ quick help** button while
silent. A `[QUICK_HELP]` event fires.

**Then** within 2 s ONE SUGGEST bubble appears in the rail with up
to 3 chips, anchored to the last few captions — for example:
"Want me to summarize what's been agreed so far?" with chips
`Summarize decisions`, `Open questions`, `Action items so far`.

> **User value:** Raymond can pull help on demand without speaking
> first.

---

### Step 7 — End-of-meeting wrap-up

**Caption:**
- `[00:14:50] Bob: "Alright, I think we've got what we need —
  Raymond, you'll send the design doc and run the load test by
  Friday, right?"`
- `[00:15:05] Raymond: "Yep, doc by tomorrow, load-test report by
  Friday EOD."`

**When** Raymond clicks **End meeting**
**Then** `set_phase({phase: "wrap"})` fires once
**And** `save_minutes(...)` fires once with non-empty
`summary` / `decisions` / `action_items` / `open_questions`
**And** `save_memory(...)` fires once with ≤ 8 atomic facts
(e.g. "Acme target: 12 k/sec peak, 300 ms p99", "Action: Raymond
sends design doc by tomorrow", "Action: Raymond delivers
load-test report by Friday EOD")
**And** the setup page's short-term memory list shows a new row
with title + timestamp.

> **User value:** Raymond gets a clean wrap of the meeting plus
> durable memory carried into next week's sync — zero manual
> bookkeeping.

---

### Exit criteria

Across the journey we observed all four reactive states fire at
least once:

| State | Evidence in journey |
|-------|---------------------|
| **S-1 Listening** | Steps 1, 2; rail bubbles only; no center panel |
| **S-2 Mentioned** | Step 3 (`source=mentioned`) + Step 4 (`[WILL_SAY]`) |
| **S-3 Speaking**  | Step 5 (`source=speaking` + at least one `[SPEAKING_REFRESH]`) |
| **S-4 Attention** | Step 6 (🎯 `source=attention_toggle` + ❓ `[QUICK_HELP]`) |

Plus:
- At least one `FACT` bubble cited `exstream-throughput-v3.md` and a
  concrete number from it.
- Every turn ended with exactly one `wait_for_event` (no orphan
  turns; no extra terminal calls).
- No bubble repeated within the 60 s dedup window.
- All HTTPS traffic was to `https://relay.ai.qili2.com/llm/v1/*` only.
- On `End meeting`, `save_minutes` and `save_memory` each fired
  exactly once.

---

## Happy Path → Demo Mapping

| Happy Path | Demo Slug              | Stories Covered                       | Priority |
|------------|------------------------|---------------------------------------|----------|
| HP-01      | `acme-kickoff-flow`    | US-01, US-02, US-03, US-04, US-05     | P0       |

## Test coverage

| Step | Offline coverage in `tests/test-loop-session.js`                                          | Status |
|------|--------------------------------------------------------------------------------------------|--------|
| 1    | US-01 (greeting + park)                                                                    | ✅     |
| 2    | US-04 (knowledge recall → FACT)                                                            | ✅     |
| 3    | US-03 (mentioned → RESEARCH + SUGGEST batched in one turn)                                 | ✅     |
| 4    | `[WILL_SAY]` follow-up                                                                     | ⏸ not yet |
| 5    | US-05 (`source=speaking` → 3 topic branches → `[SPEAKING_REFRESH]` → 2 fresh branches)     | ✅     |
| 6    | US-06 (`source=attention_toggle` → 3 branches; `[QUICK_HELP]` → 1 SUGGEST + chips)         | ✅     |
| 7    | US-07 (`end` event → `set_phase('wrap')` + `save_minutes` + `save_memory` each once)       | ✅     |

Run offline: `cd team-mate && npm test`

Live walkthrough: see the `live-e2e` skill in
`bullx/.github/skills/live-e2e/SKILL.md` for the framework. A real
Teams session is required for Steps 5–7 because they depend on the
browser-side speaking detector and audio-MOS routing.
