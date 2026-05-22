// teams-live-caption-ai/src/loop-session.js
//
// Neverstop driver — keeps a single OpenAI-compatible conversation
// alive for the whole meeting. Replaces the v3 WebSocket / JSON-RPC
// `session.*` plumbing. See docs/agent-design-v4.md §4 for the design.
//
// Algorithm:
//   1. Build _messages = [system, bootstrap-user].
//   2. POST /llm/v1/chat/completions → response.
//   3. For each tool_call in choices[0].message.tool_calls:
//        - if `wait_for_event` → PARK (set _parkedToolCallId). Stop.
//        - else → run handler, append `{role:"tool", tool_call_id, content}`,
//          then loop back to step 2 (same turn).
//   4. If no tool_calls → record the assistant message (rare for v4 since
//      the system prompt requires every reply to end with a tool call) and
//      stop.
//   5. When an external event arrives (pushCaption / pushUserMsg / pushTick
//      / end), append a `tool` message answering the parked `wait_for_event`
//      with the event payload, then re-enter the loop.
//
// Public API (same as v3):
//   const loop = createLoopSession({
//       meetingId, systemMessage, model, handlers, onEvent,
//   });
//   await loop.start();
//   loop.pushCaption(chunk);
//   loop.pushUserMsg(text);
//   loop.pushTick();
//   await loop.end();
//   loop.onUsage(fn);

import { chatCompletion } from "./relay.js"

// Compaction threshold — see design v4 §4.3.
const COMPACT_TOKENS = 200_000

// OpenAI tools[] declaration. The terminal `wait_for_event` is what
// makes the loop "park" between LLM calls.
const TOOLS = [
    {
        type: "function",
        function: {
            name: "wait_for_event",
            description:
                "Terminal call — END this turn and wait for the next external event " +
                "(caption chunk, user_msg, tick, or end). Every reply MUST end with " +
                "exactly one wait_for_event call after any side-effect tools.",
            parameters: { type: "object", properties: {}, additionalProperties: false },
        },
    },
    {
        type: "function",
        function: {
            name: "get_snapshot",
            description:
                "Pull a fresh snapshot of the current meeting state (transcripts, " +
                "history, name, participants, memory).",
            parameters: {
                type: "object",
                properties: {
                    since: {
                        type: "string",
                        description: "ISO timestamp; only return transcripts after this point. Optional.",
                    },
                },
            },
        },
    },
    {
        type: "function",
        function: {
            name: "send_suggestion",
            description:
                "Push a bubble to the meeting UI. Chips are OPTIONAL and only for " +
                "rare scope flips (e.g. \"Stay quiet — minutes only\"). Most bubbles " +
                "should have NO chips because the user is in a meeting and will not tap.",
            parameters: {
                type: "object",
                required: ["kind", "text"],
                properties: {
                    kind: {
                        type: "string",
                        enum: ["SUGGEST", "RESEARCH", "FACT"],
                        description: "SUGGEST = proposed reply the user can speak. RESEARCH = a QUESTION the user may want answered (jargon, concept, how-X-works) — ends with '?'; user clicks to get the answer. FACT = a recalled fact from memory or earlier conversation history.",
                    },
                    text: { type: "string", description: "Bubble body text (≤ 60 words)." },
                    options: {
                        type: "array",
                        description:
                            "0–2 optional chips, ≤ 4 words each. Use only for rare scope flips. Default: no chips.",
                        items: { type: "string" },
                        maxItems: 2,
                    },
                },
            },
        },
    },
    {
        type: "function",
        function: {
            name: "update_live_minutes",
            description:
                "Update the LIVE minutes panel during the meeting. Send the FULL current " +
                "minutes markdown each time (replaces the panel). Sections to include when " +
                "present: ## Decisions, ## Action items (with owner + deadline), ## Open questions.",
            parameters: {
                type: "object",
                required: ["markdown"],
                properties: { markdown: { type: "string" } },
            },
        },
    },
    {
        type: "function",
        function: {
            name: "save_memory",
            description:
                "Persist distilled facts and a one-paragraph summary to long/short-term memory. " +
                "Call at meeting end AND right before a [COMPACT] event so important facts " +
                "survive history truncation.",
            parameters: {
                type: "object",
                required: ["facts", "summary"],
                properties: {
                    facts: { type: "array", items: { type: "string" }, description: "Atomic durable facts. Max 8." },
                    summary: { type: "string", description: "One-paragraph (≤ 60 words) recap." },
                },
            },
        },
    },
    {
        type: "function",
        function: {
            name: "save_minutes",
            description: "End-of-meeting handoff: save the markdown minutes for this meeting.",
            parameters: {
                type: "object",
                required: ["markdown"],
                properties: { markdown: { type: "string" } },
            },
        },
    },
    {
        type: "function",
        function: {
            name: "recall_knowledge",
            description:
                "Search the user's uploaded reference documents (design docs, briefs, notes) " +
                "for passages relevant to a topic or question. Call this when a caption mentions " +
                "a project / system / acronym you don't already know, or when the user is asking " +
                "about a doc they uploaded. Returns up to 5 matching snippets with doc name.",
            parameters: {
                type: "object",
                required: ["query"],
                properties: {
                    query: { type: "string", description: "Keywords / topic to search for. Combine 2-5 key terms." },
                    limit: { type: "integer", description: "Max snippets to return (default 5).", minimum: 1, maximum: 10 },
                },
            },
        },
    },
]

// Map tool-name → handler key. Side-effect tools only — wait_for_event is
// handled inline.
const HANDLER_KEY = {
    get_snapshot: "getSnapshot",
    send_suggestion: "sendSuggestion",
    update_live_minutes: "updateLiveMinutes",
    save_memory: "saveMemory",
    save_minutes: "saveMinutes",
    recall_knowledge: "recallKnowledge",
}

const BOOTSTRAP_USER = [
    "Meeting started. Chat panel is empty.",
    "",
    "DO NOT call send_suggestion with kind SUGGEST — no one has spoken yet.",
    "",
    "If memory is empty: call send_suggestion ONCE with kind FACT and text",
    "\"Ready. Listening for conversation.\" — then call wait_for_event.",
    "",
    "If memory has facts about this meeting: call send_suggestion 1-2 times",
    "with kind FACT, recalling the most relevant facts (≤14 words each).",
    "Then call wait_for_event.",
    "",
    "That's it. No RESEARCH. No SUGGEST. No chips. No reassurance.",
    "Wait for the first caption to arrive before doing anything else.",
].join("\n")

const COMPACT_USER = [
    "[COMPACT] You are at the token budget. Do the following before parking:",
    "",
    "1. Call `save_memory` with the most important durable facts (≤ 8) and a",
    "   one-paragraph summary of everything that has been said so far in this",
    "   meeting (≤ 60 words).",
    "2. Call `update_live_minutes` with the FULL current minutes markdown so",
    "   nothing is lost.",
    "3. Then end with `wait_for_event` as usual.",
    "",
    "After this turn completes, the conversation history will be truncated and",
    "replaced with your summary. Memory + live minutes persist independently in",
    "storage, so they are NOT lost.",
].join("\n")

export function createLoopSession({ meetingId, systemMessage, model, handlers, onEvent, bootstrapUser } = {}) {
    if (!meetingId) throw new Error("createLoopSession: meetingId required")
    if (!handlers) throw new Error("createLoopSession: handlers required")
    // bootstrapUser: the first user message pushed by start(). Default is the
    // full agent bootstrap (FACT/RESEARCH). Pass a custom string for non-agent
    // sessions. Pass null/empty to skip and just park.
    const _bootstrap = (bootstrapUser === undefined) ? BOOTSTRAP_USER : (bootstrapUser || "")

    // ── State ────────────────────────────────────────────────────────────
    const _messages = systemMessage
        ? [{ role: "system", content: typeof systemMessage === "string" ? systemMessage : JSON.stringify(systemMessage) }]
        : []
    const _eventQueue = []           // FIFO of {kind, ...} payloads to feed back
    let _parkedToolCallId = null     // tool_call_id of an unanswered wait_for_event
    let _running = false             // re-entry guard for runUntilPark
    let _started = false
    let _ending = false
    let _onUsage = null
    let _cumulativeTokens = 0        // running sum of prompt_tokens
    let _firstAskSeen = false        // fire onConnected exactly once
    let _lastSuggestionText = ""     // dedup window
    let _lastSuggestionAt = 0
    let _recoveryTimer = null        // dead-loop self-heal timer

    function log(...a) { try { console.log("[LoopSession]", ...a) } catch {} }

    // ── Event queue ──────────────────────────────────────────────────────
    function enqueue(evt, { headOfQueue = false } = {}) {
        if (headOfQueue) _eventQueue.unshift(evt)
        else _eventQueue.push(evt)
        drain()
    }

    function drain() {
        // If model is parked and the queue has something, answer the parked
        // wait_for_event with the next event and re-enter the loop.
        if (_running || _eventQueue.length === 0) return
        if (!_parkedToolCallId) {
            // Dead-loop recovery: loop crashed without parking (chatCompletion
            // error or maxHops exhausted). Push the event as a user message
            // and re-enter the loop.
            const evt = _eventQueue.shift()
            _messages.push({
                role: "user",
                content: `[RECOVERY] Prior LLM call failed. Pending event:\n${JSON.stringify(evt)}\nResume the meeting. Call wait_for_event to park.`,
            })
            log("dead-loop recovery: re-entering with", evt.kind, "remaining queue", _eventQueue.length)
            runUntilPark().catch(e => log("recovery runUntilPark error", e?.message || e))
            return
        }
        const evt = _eventQueue.shift()
        const toolCallId = _parkedToolCallId
        _parkedToolCallId = null
        _messages.push({
            role: "tool",
            tool_call_id: toolCallId,
            content: JSON.stringify(evt),
        })
        log("answering parked wait_for_event with", evt.kind, "remaining queue", _eventQueue.length)
        runUntilPark().catch(e => log("runUntilPark error", e?.message || e))
    }

    // ── Side-effect tool dispatch ────────────────────────────────────────
    async function dispatchTool(name, args) {
        if (name === "send_suggestion") {
            // Dedup repeated bubbles within 60s.
            const text = String(args?.text || "").replace(/\s+/g, " ").trim()
            if (text) {
                const now = Date.now()
                if (_lastSuggestionText === text && (now - _lastSuggestionAt) < 60_000) {
                    log("drop duplicate send_suggestion (matched last within 60s)")
                    return { ok: true, deduped: true }
                }
                _lastSuggestionText = text
                _lastSuggestionAt = now
            }
        }
        const handlerKey = HANDLER_KEY[name]
        if (!handlerKey) return { ok: false, error: `unknown tool ${name}` }
        try {
            const fn = handlers[handlerKey]
            if (!fn) return { ok: true }
            const result = await fn(args || {})
            return result ?? { ok: true }
        } catch (e) {
            return { ok: false, error: String(e?.message || e) }
        }
    }

    // ── The neverstop loop ───────────────────────────────────────────────
    async function runUntilPark(maxHops = 8) {
        if (_running) return
        _running = true
        // Clear any pending recovery timer — we're alive now.
        if (_recoveryTimer) { clearTimeout(_recoveryTimer); _recoveryTimer = null }
        let consecutiveErrors = 0
        try {
            for (let hop = 0; hop < maxHops; hop++) {
                let res
                try {
                    res = await chatCompletion({
                        messages: _messages,
                        tools: TOOLS,
                        model,
                    })
                    consecutiveErrors = 0
                } catch (e) {
                    consecutiveErrors++
                    log("chatCompletion error", e?.message || e, `(attempt ${consecutiveErrors}/3)`)
                    if (consecutiveErrors >= 3) {
                        log("3 consecutive errors — scheduling recovery in 10s")
                        scheduleRecovery()
                        return
                    }
                    const delay = Math.min(2000 * Math.pow(2, consecutiveErrors - 1), 15000)
                    log(`retrying in ${delay}ms`)
                    await new Promise(r => setTimeout(r, delay))
                    continue
                }
                if (res.usage) {
                    _cumulativeTokens += Number(res.usage.prompt_tokens) || 0
                    try { _onUsage?.(res.usage) } catch {}
                    if (onEvent) try { onEvent({ type: "assistant.usage", data: res.usage }) } catch {}
                }
                const msg = res.choices?.[0]?.message
                if (!msg) { log("no message in response"); return }
                _messages.push(msg)

                const calls = msg.tool_calls || []
                if (!calls.length) {
                    // Model ended without a tool call — violates protocol. Nudge
                    // it once by appending a synthetic user reminder.
                    log("WARN: assistant ended without tool_calls — nudging")
                    _messages.push({
                        role: "user",
                        content: "[PROTOCOL] You must end every reply with a tool call (wait_for_event after any side-effect tools). Continue.",
                    })
                    continue
                }

                // Walk tool_calls in order. Side-effect tools first, then the
                // terminal wait_for_event parks the turn.
                let parked = false
                for (const tc of calls) {
                    const name = tc.function?.name
                    let args = {}
                    try { args = JSON.parse(tc.function?.arguments || "{}") } catch {}
                    if (name === "wait_for_event") {
                        _parkedToolCallId = tc.id
                        if (!_firstAskSeen) {
                            _firstAskSeen = true
                            try { handlers.onConnected?.() } catch {}
                        }
                        parked = true
                        break
                    }
                    const result = await dispatchTool(name, args)
                    _messages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify(result),
                    })
                }
                if (parked) {
                    log("parked at wait_for_event", _parkedToolCallId, "queue size", _eventQueue.length)
                    // If events queued up while the model was thinking, drain.
                    if (_eventQueue.length) {
                        // Recurse via setTimeout to release _running first.
                        setTimeout(drain, 0)
                    }
                    // Compaction check (after the model emitted save_memory above
                    // via the [COMPACT] pseudo-event handled separately).
                    if (_cumulativeTokens >= COMPACT_TOKENS) {
                        log("token budget exceeded — scheduling compaction")
                        _cumulativeTokens = 0
                        // Compaction is a side conversation: enqueue the
                        // [COMPACT] user message at head-of-queue so it goes
                        // in immediately, then the model emits save_memory +
                        // update_live_minutes and parks again. After that we
                        // truncate _messages.
                        scheduleCompaction()
                    }
                    return
                }
                // No park → loop body emitted side-effect tools only. Re-enter
                // chatCompletion so the model continues toward its terminal call.
            }
            log("WARN: maxHops exceeded without parking")
            scheduleRecovery()
        } finally {
            _running = false
        }
    }

    // ── Dead-loop recovery ─────────────────────────────────────────────
    function scheduleRecovery() {
        if (_recoveryTimer || _parkedToolCallId) return
        _recoveryTimer = setTimeout(() => {
            _recoveryTimer = null
            if (_parkedToolCallId || _running) return     // already recovered
            if (_eventQueue.length === 0) return           // nothing to do
            log("recovery timer fired — attempting drain")
            drain()
        }, 10_000)
    }

    // ── Compaction ───────────────────────────────────────────────────────
    let _compactInFlight = false
    async function scheduleCompaction() {
        if (_compactInFlight) return
        _compactInFlight = true
        try {
            // Build a synthetic [COMPACT] user message and a single ad-hoc
            // turn that asks the model to save_memory + update_live_minutes
            // then summarise. The model's reply to this turn is the new
            // compacted history seed.
            _messages.push({ role: "user", content: COMPACT_USER })
            await runUntilPark(4)
            // After the model finishes (it will have called save_memory and
            // update_live_minutes, then parked), build the compacted
            // history: keep system, drop everything else, prepend a single
            // user note with the summary the model just stored.
            try {
                const sys = _messages[0]
                _messages.length = 0
                if (sys) _messages.push(sys)
                _messages.push({
                    role: "user",
                    content: "[COMPACTED] Earlier history was truncated. Memory and live minutes were preserved via tools. Continue the meeting from here.",
                })
                // Park flag is stale (tool_call_id refers to a discarded
                // message). Clear it; next event will trigger a fresh turn.
                _parkedToolCallId = null
                log("history compacted; _messages reset")
            } catch (e) {
                log("compaction cleanup failed", e?.message || e)
            }
        } finally {
            _compactInFlight = false
            drain()
        }
    }

    // ── Public API ───────────────────────────────────────────────────────
    async function start() {
        if (_started) return
        _started = true
        if (_bootstrap) _messages.push({ role: "user", content: _bootstrap })
        await runUntilPark()
    }

    function pushCaption(chunk) {
        if (!chunk || !chunk.length) return
        enqueue({ kind: "caption", chunk })
    }
    function pushUserMsg(text) {
        if (!text) return
        // Highest priority — head-of-queue, skip any pending caption events.
        enqueue({ kind: "user_msg", text }, { headOfQueue: true })
    }
    function pushTick() { enqueue({ kind: "tick", ts: Date.now() }) }

    async function end({ wait = 5000 } = {}) {
        if (_ending) return
        _ending = true
        enqueue({ kind: "end" }, { headOfQueue: true })
        // Let the model react (save_minutes, save_memory) before we drop the
        // session. We do NOT actually disconnect anything — v4 is stateless.
        await new Promise(r => setTimeout(r, wait))
    }

    function onUsageHandler(fn) { _onUsage = fn }

    return { start, pushCaption, pushUserMsg, pushTick, end, onUsage: onUsageHandler }
}
