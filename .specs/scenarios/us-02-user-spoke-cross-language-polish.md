# US-02 — User just spoke in their weaker language → polish bubble in preferred language

**Persona.** Raymond, native English speaker, joined a Mandarin meeting
with a Chinese customer. `preferred_language = "en"`, meeting language
auto-detected as `zh`.

**Goal.** When Raymond himself speaks a substantial utterance in
Mandarin, MeetMate detects the language mismatch and emits ONE
`send_suggestion` bubble containing a polished **English** version of
what he said, plus a `"Show in 中文"` style chip set. The loop parks.

This is Trigger 6 (cross-language polish) from `agent-prompt.md`.

---

## Preconditions

- US-01 already passed (greeting parked, loop alive).
- `conf.author = "Raymond"`, `conf.preferred_language = "en"`.
- Meeting language is Mandarin (recent captions are Chinese).

## Scenario

**Given** the loop is parked awaiting a caption  
  **And** the most-recent caption history shows the last 3 captions are
  all from non-Raymond speakers, all in Mandarin  
**When** a new caption chunk arrives where `Name === "Raymond"` and
  `Text === "我们这周已经把性能回退的复现脚本跑通了，下一步是定位是新部署引入的还是基础设施变化导致的。"` (substantial,
  > 5 words, in Mandarin)  
  **And** the content script calls `loop.pushCaption(chunk)`  
**Then** the loop appends `{role:"tool", tool_call_id:<parked>, content:'{"kind":"caption","chunk":[...]}'}`  
  **And** POSTs to `/llm/v1/chat/completions`  
  **And** the response contains EXACTLY ONE `send_suggestion` followed by
  `wait_for_event`  
  **And** the bubble `kind === "SUGGEST"`  
  **And** the bubble `text` is in ENGLISH (not Chinese — verify by no
  CJK code-points in the polished sentence; the title line MAY say
  "Polished version (in English)" plus the English body)  
  **And** the bubble `text` semantically conveys: "we got the regression
  repro script working this week; next step is to determine whether it
  came from the new deploy or infra changes" (loose match — check for
  "repro" / "regression" / "next step")  
  **And** chips include at least one of `"Use this version"`,
  `"More formal"`, `"Make it shorter"` (all in English)  
  **And** no chip contains CJK characters (mixed-language chips
  forbidden).

## Failure modes to watch

- Polish bubble is in Mandarin (wrong direction for Trigger 6 when meeting
  language ≠ preferred_language).
- 2 bubbles emitted (model emitted both a polish AND a draft-reply — only
  one is needed).
- Bubble emits when Raymond's utterance was < 5 words (threshold violation).
- Chip "Translate to English" present (forbidden — translation handled by
  toolbar).
