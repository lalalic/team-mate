// tests/test-loop-session.js
//
// Offline smoke harness for the v4 neverstop loop. Drives the same
// `createLoopSession` factory the extension uses, against a mocked
// fetch() that returns canned chat-completion responses matching each
// of the three in-meeting happy paths.
//
// Validates protocol contract only — does NOT make any HTTPS calls.
// For LIVE e2e (against the real relay + a real meeting), run the
// scenarios in `.specs/scenarios/` manually.
//
// Run: `npm test`

import assert from "node:assert/strict"

// ── Globals stub ─────────────────────────────────────────────────────────
const storage = new Map()
globalThis.chrome = {
    storage: {
        local: {
            get(keys, cb) {
                if (typeof keys === "string") keys = [keys]
                const result = {}
                for (const k of keys) if (storage.has(k)) result[k] = storage.get(k)
                cb(result)
            },
            set(obj, cb) {
                for (const [k, v] of Object.entries(obj)) storage.set(k, v)
                if (cb) cb()
            },
        },
        onChanged: { addListener() { /* noop */ } },
    },
    runtime: { getManifest: () => ({ version: "4.0.0-test" }) },
}

// Pre-populate conf so chatCompletion has a bearer (skips registration).
storage.set("conf", { apiKey: "test-bearer-001", relayModel: "gpt-4.1-test" })

// ── fetch mock ───────────────────────────────────────────────────────────
// Each scenario installs its own next-response queue.
let _nextResponses = []
let _capturedRequests = []
function pushResponse(r) { _nextResponses.push(r) }
globalThis.fetch = async (url, init) => {
    _capturedRequests.push({ url, body: init?.body ? JSON.parse(init.body) : null, headers: init?.headers })
    if (!_nextResponses.length) {
        throw new Error(`fetch mock: no canned response for ${url}`)
    }
    const next = _nextResponses.shift()
    return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        async json() { return next },
        async text() { return JSON.stringify(next) },
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────
function toolCall(id, name, args) {
    return { id, type: "function", function: { name, arguments: JSON.stringify(args) } }
}
function llmReply(toolCalls, prompt_tokens = 1000) {
    return {
        choices: [{
            index: 0,
            message: { role: "assistant", content: null, tool_calls: toolCalls },
            finish_reason: "tool_calls",
        }],
        usage: { prompt_tokens, completion_tokens: 80, total_tokens: prompt_tokens + 80 },
    }
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── Import unit-under-test AFTER globals are installed ──────────────────
const { createLoopSession } = await import("../src/loop-session.js")

let pass = 0, fail = 0
async function scenario(name, fn) {
    _nextResponses = []
    _capturedRequests = []
    process.stdout.write(`▸ ${name} ... `)
    try {
        await fn()
        console.log("PASS")
        pass++
    } catch (e) {
        console.log("FAIL")
        console.error("  ", e.message)
        fail++
    }
}

// ─────────────────────────────────────────────────────────────────────────
// US-01 — Greeting bubble at meeting start
// ─────────────────────────────────────────────────────────────────────────
await scenario("US-01: greeting bubble + park at start", async () => {
    pushResponse(llmReply([
        toolCall("c1", "send_suggestion", {
            kind: "SUGGEST",
            text: "Hi Raymond — Phoenix sync likely covers:\n• Q4 launch blockers\n• Renewal call with Acme\nI'll polish, translate, suggest automatically.",
            options: [],
        }),
        toolCall("c2", "wait_for_event", {}),
    ]))

    const calls = []
    const loop = createLoopSession({
        meetingId: "phoenix-2025-11-20",
        systemMessage: "You are MeetMate for Raymond.",
        handlers: {
            sendSuggestion: a => { calls.push(["sendSuggestion", a]); return { ok: true } },
            updateLiveMinutes: a => { calls.push(["updateLiveMinutes", a]); return { ok: true } },
            
            saveMemory: a => { calls.push(["saveMemory", a]); return { ok: true } },
            saveMinutes: a => { calls.push(["saveMinutes", a]); return { ok: true } },
            getSnapshot: () => ({}),
            onConnected: () => calls.push(["onConnected"]),
        },
    })
    await loop.start()
    await sleep(50)

    assert.equal(_capturedRequests.length, 1, "exactly one chatCompletion POST")
    assert.match(_capturedRequests[0].url, /\/chat\/completions$/, "hits /chat/completions")
    assert.equal(_capturedRequests[0].headers.authorization, "Bearer test-bearer-001", "bearer set")
    assert.equal(calls.filter(c => c[0] === "sendSuggestion").length, 1, "exactly one sendSuggestion")
    assert.ok(calls.some(c => c[0] === "onConnected"), "onConnected fired on first park")
    assert.match(calls[0][1].text, /Raymond/, "bubble names the user")
})

// ─────────────────────────────────────────────────────────────────────────
// US-02 — cross-language polish (English bubble from Mandarin utterance)
// ─────────────────────────────────────────────────────────────────────────
await scenario("US-02: cross-language polish on user's Mandarin caption", async () => {
    // Turn 1: bootstrap → park
    pushResponse(llmReply([
        toolCall("c1", "send_suggestion", { kind: "SUGGEST", text: "Hi Raymond.", options: [] }),
        toolCall("c2", "wait_for_event", {}),
    ]))
    // Turn 2: after caption pushed → polish bubble in English + park
    pushResponse(llmReply([
        toolCall("c3", "send_suggestion", {
            kind: "SUGGEST",
            text: "Polished version (in English):\nThis week we got the regression repro script working; next step is determining whether it came from the new deploy or infra changes.",
            options: ["Use this version", "More formal", "Make it shorter"],
        }),
        toolCall("c4", "wait_for_event", {}),
    ]))

    const bubbles = []
    const loop = createLoopSession({
        meetingId: "phoenix-2025-11-21",
        systemMessage: "You are MeetMate for Raymond. preferred_language=en.",
        handlers: {
            sendSuggestion: a => { bubbles.push(a); return { ok: true } },
            updateLiveMinutes: () => ({ ok: true }),
            saveMemory: () => ({ ok: true }),
            saveMinutes: () => ({ ok: true }),
            getSnapshot: () => ({}),
            onConnected: () => {},
        },
    })
    await loop.start()
    await sleep(30)
    loop.pushCaption([{ Name: "Raymond", Text: "我们这周已经把性能回退的复现脚本跑通了，下一步是定位是新部署引入的还是基础设施变化导致的。", Time: "00:05:12" }])
    await sleep(50)

    const polish = bubbles[1]
    assert.ok(polish, "polish bubble emitted on second turn")
    // No CJK code points in the polished body.
    const cjk = /[\u4e00-\u9fff]/
    assert.ok(!cjk.test(polish.text.replace(/Polished version[^\n]*\n?/, "")), "polish body has no CJK")
    assert.ok(polish.options.every(o => !cjk.test(o)), "chips have no CJK")
})

// ─────────────────────────────────────────────────────────────────────────
// US-03 — Jargon-heavy direct question → RESEARCH + SUGGEST in one turn
// ─────────────────────────────────────────────────────────────────────────
await scenario("US-03: jargon question → RESEARCH then SUGGEST then park", async () => {
    // Turn 1: bootstrap → park
    pushResponse(llmReply([
        toolCall("c1", "send_suggestion", { kind: "SUGGEST", text: "Hi Raymond.", options: [] }),
        toolCall("c2", "wait_for_event", {}),
    ]))
    // Turn 2: 3 calls — RESEARCH, SUGGEST, wait_for_event
    pushResponse(llmReply([
        toolCall("c3", "send_suggestion", {
            kind: "RESEARCH",
            text: "MEV-resistant atomic settlement = a payment-settlement design that prevents miner/validator extractable value attacks while keeping debit+credit as one atomic step. Relevant to your payment flow if you're settling on a public chain.",
            options: ["Show common pitfalls", "Note: ask for clarification"],
        }),
        toolCall("c4", "send_suggestion", {
            kind: "SUGGEST",
            text: "Honestly, our current flow doesn't need full MEV-resistant atomic settlement yet — we settle off-chain via batched ledger updates. We can revisit if we move to on-chain settlement.",
            options: ["Send to Teams chat", "Add cost callout", "Make more formal"],
        }),
        toolCall("c5", "wait_for_event", {}),
    ]))

    const bubbles = []
    const loop = createLoopSession({
        meetingId: "phoenix-2025-11-22",
        systemMessage: "You are MeetMate for Raymond.",
        handlers: {
            sendSuggestion: a => { bubbles.push(a); return { ok: true } },
            updateLiveMinutes: () => ({ ok: true }),
            saveMemory: () => ({ ok: true }),
            saveMinutes: () => ({ ok: true }),
            getSnapshot: () => ({}),
            onConnected: () => {},
        },
    })
    await loop.start()
    await sleep(30)
    loop.pushCaption([{ Name: "Bob", Text: "Raymond, can you walk us through whether our payment flow is going to need MEV-resistant atomic settlement?", Time: "00:10:01" }])
    await sleep(80)

    const t2 = bubbles.slice(1)        // drop bootstrap bubble
    assert.equal(t2.length, 2, "turn-2 emitted exactly 2 bubbles")
    assert.equal(t2[0].kind, "RESEARCH", "first turn-2 bubble is RESEARCH")
    assert.equal(t2[1].kind, "SUGGEST", "second turn-2 bubble is SUGGEST")
    assert.match(t2[0].text, /MEV|settlement|atomic/i, "RESEARCH defines the term")
    // No generic-only chips on SUGGEST.
    const generic = ["Use this", "Skip", "Try again"]
    assert.ok(t2[1].options.every(o => !generic.includes(o)), "no forbidden generic chips on SUGGEST")
    // Exactly 2 chatCompletion POSTs (bootstrap + caption) — model batched
    // RESEARCH+SUGGEST+wait_for_event in one response, not 3.
    assert.equal(_capturedRequests.length, 2, "RESEARCH+SUGGEST+park batched in ONE chatCompletion")
})

// ─────────────────────────────────────────────────────────────────────────
// US-04 — Caption mentions an uploaded doc → recall_knowledge → FACT
// ─────────────────────────────────────────────────────────────────────────
await scenario("US-04: knowledge recall → FACT bubble citing source", async () => {
    // Pre-populate a knowledge doc with a wikiEntry so formatKnowledgeIndex
    // would surface it in the system prompt (this harness doesn't actually
    // assert the prompt; it asserts the model's tool-call sequence given a
    // canned response).
    storage.set("knowledge", {
        docs: [{
            id: "k-1",
            name: "exstream-throughput-v3.md",
            size: 600,
            addedAt: Date.now(),
            content: "# ExStream Throughput Design v3\n\n## Backpressure\nPer-shard token bucket of 1000 events / 100 ms. Excess overflows to a 60-second disk spool and is replayed before live traffic resumes.",
            wikiEntry: "Title: ExStream Throughput Design v3\nKeywords: exstream, throughput, sharding, backpressure, p99\nSections: Goals • Sharding • Backpressure\nSummary: Hash-sharded event stream sustaining 50k/sec with token-bucket backpressure and disk spool overflow.",
        }],
    })

    // Turn 1: bootstrap → park
    pushResponse(llmReply([
        toolCall("c1", "send_suggestion", { kind: "SUGGEST", text: "Hi Raymond.", options: [] }),
        toolCall("c2", "wait_for_event", {}),
    ]))
    // Turn 2: caption arrives → model calls recall_knowledge ONLY (no
    // wait_for_event yet). The loop dispatches recall, appends the tool
    // result, and immediately POSTs again for the follow-up.
    pushResponse(llmReply([
        toolCall("c3", "recall_knowledge", { query: "exstream throughput backpressure", limit: 3 }),
    ]))
    // Turn 2 hop 2: with the recall result in context, the model emits the
    // FACT bubble and parks.
    pushResponse(llmReply([
        toolCall("c5", "send_suggestion", {
            kind: "FACT",
            text: "📌 ExStream throughput design (doc: exstream-throughput-v3.md): backpressure uses a per-shard token bucket of 1000 events/100ms, with overflow spooled to disk for 60s and replayed before live traffic resumes.",
            options: ["Quote in chat", "Show the doc"],
        }),
        toolCall("c6", "wait_for_event", {}),
    ]))

    const bubbles = []
    const recallCalls = []
    const loop = createLoopSession({
        meetingId: "phoenix-2025-11-22",
        systemMessage: "You are MeetMate for Raymond. Knowledge index includes exstream-throughput-v3.md.",
        handlers: {
            sendSuggestion: a => { bubbles.push(a); return { ok: true } },
            updateLiveMinutes: () => ({ ok: true }),
            saveMemory: () => ({ ok: true }),
            saveMinutes: () => ({ ok: true }),
            getSnapshot: () => ({}),
            recallKnowledge: ({ query, limit }) => {
                recallCalls.push({ query, limit })
                return {
                    ok: true,
                    matches: [{
                        doc: "exstream-throughput-v3.md",
                        chunk: 0,
                        score: 4.2,
                        snippet: "## Backpressure Per-shard token bucket of 1000 events / 100 ms. Excess overflows to a 60-second disk spool and is replayed before live traffic resumes.",
                    }],
                }
            },
            onConnected: () => {},
        },
    })
    await loop.start()
    await sleep(30)
    loop.pushCaption([{ Name: "Bob", Text: "Raymond, remind everyone how ExStream's new throughput design handles backpressure?", Time: "00:10:01" }])
    await sleep(120)

    assert.equal(recallCalls.length, 1, "recall_knowledge called exactly once")
    assert.match(recallCalls[0].query, /exstream|throughput|backpressure/i, "query mentions a relevant term")

    const turn3Bubbles = bubbles.slice(1) // drop bootstrap
    assert.ok(turn3Bubbles.length >= 1, "at least one bubble after recall")
    const fact = turn3Bubbles.find(b => b.kind === "FACT")
    assert.ok(fact, "a FACT bubble was emitted")
    assert.match(fact.text, /exstream-throughput-v3\.md|ExStream/i, "FACT cites the source doc by name")
    assert.match(fact.text, /token bucket|disk spool|backpressure/i, "FACT mentions the actual mechanism")
})

// ─────────────────────────────────────────────────────────────────────────
// US-05 — State S-3: user is speaking → topic branches, then SPEAKING_REFRESH
// (HP-01 Step 5)
// ─────────────────────────────────────────────────────────────────────────
await scenario("US-05: speaking state → topic branches → SPEAKING_REFRESH", async () => {
    // Turn 1: bootstrap → park
    pushResponse(llmReply([
        toolCall("c1", "send_suggestion", { kind: "SUGGEST", text: "Hi Raymond.", options: [] }),
        toolCall("c2", "wait_for_event", {}),
    ]))
    // Turn 2 (after [FOCUS_HIGH source=speaking]): 3 topic-branch SUGGESTs + park
    pushResponse(llmReply([
        toolCall("c3", "send_suggestion", {
            kind: "SUGGEST",
            text: "**Validation plan** — I can run a peak-traffic load test this week to confirm 12k/sec stays well under 300ms.",
            options: [],
        }),
        toolCall("c4", "send_suggestion", {
            kind: "SUGGEST",
            text: "**Acme-specific** — If your batch peaks line up, we could pre-warm the spool path before your run starts.",
            options: [],
        }),
        toolCall("c5", "send_suggestion", {
            kind: "SUGGEST",
            text: "**Risk callout** — One thing to watch: if your client retries aggressively on the cold-start blip, you'll amplify load.",
            options: [],
        }),
        toolCall("c6", "wait_for_event", {}),
    ]))
    // Turn 3 (after [SPEAKING_REFRESH]): 2 fresh branches + park
    pushResponse(llmReply([
        toolCall("c7", "send_suggestion", {
            kind: "SUGGEST",
            text: "**Mitigation** — We've added a pre-warm hook the deploy script can fire 60s before traffic; happy to enable it for Acme.",
            options: [],
        }),
        toolCall("c8", "send_suggestion", {
            kind: "SUGGEST",
            text: "**Measurement** — I can share the cold-start latency histogram from our last release.",
            options: [],
        }),
        toolCall("c9", "wait_for_event", {}),
    ]))

    const bubbles = []
    const loop = createLoopSession({
        meetingId: "acme-2025-12-01",
        systemMessage: "You are MeetMate for Raymond.",
        handlers: {
            sendSuggestion: a => { bubbles.push(a); return { ok: true } },
            updateLiveMinutes: () => ({ ok: true }),
            saveMemory: () => ({ ok: true }),
            saveMinutes: () => ({ ok: true }),
            getSnapshot: () => ({}),
            recallKnowledge: () => ({ ok: true, matches: [] }),
            onConnected: () => {},
        },
    })
    await loop.start()
    await sleep(30)
    // [FOCUS_HIGH source=speaking] — user just started speaking
    loop.pushUserMsg("[FOCUS_HIGH source=speaking] User just started speaking. Emit 2-3 SUGGEST topic branches anchored to what they appear to be steering toward. Format **<Topic ≤ 5 words>** — <draft ≤ 25 words>.")
    await sleep(80)

    const speakingBubbles = bubbles.slice(1) // drop bootstrap
    assert.equal(speakingBubbles.length, 3, "3 topic branches on FOCUS_HIGH source=speaking")
    for (const b of speakingBubbles) {
        assert.equal(b.kind, "SUGGEST", "all are SUGGEST")
        assert.match(b.text, /^\*\*[^*]{2,40}\*\*\s*—/, "starts with **Topic** — body format")
    }
    const topics = speakingBubbles.map(b => b.text.match(/^\*\*([^*]+)\*\*/)[1].trim())
    assert.equal(new Set(topics).size, 3, "topics are materially different (not paraphrases)")

    // [SPEAKING_REFRESH] arrives ~8s later — push it now (no real wait)
    loop.pushUserMsg("[SPEAKING_REFRESH] User is still speaking; latest captions may have shifted direction. Re-emit 2-3 fresh SUGGEST topic branches that fit what they're saying NOW.")
    await sleep(80)

    const refreshBubbles = bubbles.slice(1 + 3) // drop bootstrap + 3 speaking branches
    assert.equal(refreshBubbles.length, 2, "2 fresh branches after SPEAKING_REFRESH")
    for (const b of refreshBubbles) {
        assert.equal(b.kind, "SUGGEST")
        assert.match(b.text, /^\*\*[^*]{2,40}\*\*\s*—/, "refresh branch keeps **Topic** — format")
    }
    const refreshTopics = refreshBubbles.map(b => b.text.match(/^\*\*([^*]+)\*\*/)[1].trim())
    // Refresh should bring NEW topics, not repeat the originals.
    for (const t of refreshTopics) {
        assert.ok(!topics.includes(t), `refresh topic "${t}" is not a repeat of initial branches`)
    }
})

// ─────────────────────────────────────────────────────────────────────────
// US-06 — State S-4: attention button + quick-help
// (HP-01 Step 6)
// ─────────────────────────────────────────────────────────────────────────
await scenario("US-06: attention_toggle + QUICK_HELP", async () => {
    // Turn 1: bootstrap → park
    pushResponse(llmReply([
        toolCall("c1", "send_suggestion", { kind: "SUGGEST", text: "Hi Raymond.", options: [] }),
        toolCall("c2", "wait_for_event", {}),
    ]))
    // Turn 2 (after [FOCUS_HIGH source=attention_toggle]): topic branches + park
    pushResponse(llmReply([
        toolCall("c3", "send_suggestion", {
            kind: "SUGGEST",
            text: "**Direct answer** — Single-tenant per cluster today, but we shard by tenant ID within the cluster so isolation is logical.",
            options: [],
        }),
        toolCall("c4", "send_suggestion", {
            kind: "SUGGEST",
            text: "**Future plan** — Hard multi-tenant is on the H2 roadmap if Acme needs it — would that be a deal-breaker?",
            options: [],
        }),
        toolCall("c5", "send_suggestion", {
            kind: "SUGGEST",
            text: "**Clarify** — Are you asking about data isolation, throughput isolation, or both?",
            options: [],
        }),
        toolCall("c6", "wait_for_event", {}),
    ]))
    // Turn 3 (after [QUICK_HELP]): single SUGGEST + chips + park
    pushResponse(llmReply([
        toolCall("c7", "send_suggestion", {
            kind: "SUGGEST",
            text: "Want me to summarize what's been agreed so far?",
            options: ["Summarize decisions", "Open questions", "Action items so far"],
        }),
        toolCall("c8", "wait_for_event", {}),
    ]))

    const bubbles = []
    const loop = createLoopSession({
        meetingId: "acme-2025-12-01",
        systemMessage: "You are MeetMate for Raymond.",
        handlers: {
            sendSuggestion: a => { bubbles.push(a); return { ok: true } },
            updateLiveMinutes: () => ({ ok: true }),
            saveMemory: () => ({ ok: true }),
            saveMinutes: () => ({ ok: true }),
            getSnapshot: () => ({}),
            recallKnowledge: () => ({ ok: true, matches: [] }),
            onConnected: () => {},
        },
    })
    await loop.start()
    await sleep(30)

    // [FOCUS_HIGH source=attention_toggle]
    loop.pushUserMsg("[FOCUS_HIGH source=attention_toggle] User toggled attention ON — they want help RIGHT NOW. Emit 2-3 SUGGEST topic branches anchored to Sarah's question about multi-tenant isolation.")
    await sleep(80)

    const attentionBubbles = bubbles.slice(1) // drop bootstrap
    assert.equal(attentionBubbles.length, 3, "3 SUGGEST branches on attention_toggle")
    for (const b of attentionBubbles) {
        assert.equal(b.kind, "SUGGEST")
        assert.match(b.text, /^\*\*[^*]{2,40}\*\*\s*—/, "**Topic** — body format")
    }

    // [QUICK_HELP]
    loop.pushUserMsg("[QUICK_HELP] User pressed the quick-help button. Based on these last 5 captions, give 1 short helpful suggestion with up to 3 chips.")
    await sleep(80)

    const helpBubbles = bubbles.slice(1 + 3) // drop bootstrap + 3 attention
    assert.equal(helpBubbles.length, 1, "exactly 1 bubble on QUICK_HELP")
    const help = helpBubbles[0]
    assert.equal(help.kind, "SUGGEST")
    assert.ok(Array.isArray(help.options) && help.options.length >= 1 && help.options.length <= 3,
        "QUICK_HELP bubble has 1-3 chips")
    const generic = ["Use this", "Skip", "Try again"]
    assert.ok(help.options.every(o => !generic.includes(o)), "no generic chips on QUICK_HELP")
})

// ─────────────────────────────────────────────────────────────────────────
// US-07 — End of meeting: save_minutes + save_memory fire once
// (HP-01 Step 7)
// ─────────────────────────────────────────────────────────────────────────
await scenario("US-07: end → save_minutes + save_memory each fire once", async () => {
    // Turn 1: bootstrap → park
    pushResponse(llmReply([
        toolCall("c1", "send_suggestion", { kind: "SUGGEST", text: "Hi Raymond.", options: [] }),
        toolCall("c2", "wait_for_event", {}),
    ]))
    // Turn 2 (after end event): save_minutes + save_memory + wait_for_event
    pushResponse(llmReply([
        toolCall("c4", "save_minutes", {
            markdown: "## Summary\n- Acme integration kickoff covered SLA targets.\n\n## Decisions\n- Raymond will send design doc.\n\n## Action Items\n- @Raymond: design doc by tomorrow.\n- @Raymond: load-test report by Friday EOD.\n\n## Open Questions\n- Multi-tenant isolation requirements.",
        }),
        toolCall("c5", "save_memory", {
            facts: [
                "Acme target: 12k/sec peak, 300ms p99.",
                "Our ExStream design: 50k/sec, 180ms p99.",
                "Action: Raymond sends design doc by tomorrow.",
                "Action: Raymond delivers load-test report by Friday EOD.",
                "Open question: multi-tenant isolation needs clarification.",
            ],
            summary: "Acme integration kickoff. Confirmed SLA headroom; raised cold-start caveat. Raymond owns design-doc send + load-test report; open question on multi-tenant isolation.",
        }),
        toolCall("c6", "wait_for_event", {}),
    ]))

    let saveMinutesCalls = 0
    let saveMemoryCalls = 0
    let lastMinutes = null
    let lastMemory = null
    const loop = createLoopSession({
        meetingId: "acme-2025-12-01",
        systemMessage: "You are MeetMate for Raymond.",
        handlers: {
            sendSuggestion: () => ({ ok: true }),
            updateLiveMinutes: () => ({ ok: true }),
            saveMinutes: a => { saveMinutesCalls++; lastMinutes = a; return { ok: true } },
            saveMemory: a => { saveMemoryCalls++; lastMemory = a; return { ok: true } },
            getSnapshot: () => ({}),
            recallKnowledge: () => ({ ok: true, matches: [] }),
            onConnected: () => {},
        },
    })
    await loop.start()
    await sleep(30)

    // User clicks End meeting → loop.end() pushes a head-of-queue `end` event.
    // We don't await loop.end() (it has a 5s default wait); instead we just
    // wait long enough for the canned response to flow through.
    loop.end({ wait: 200 })
    await sleep(120)

    assert.equal(saveMinutesCalls, 1, "save_minutes fired exactly once")
    assert.equal(saveMemoryCalls, 1, "save_memory fired exactly once")

    assert.ok(lastMinutes?.markdown?.length > 0, "minutes markdown is non-empty")
    for (const section of ["Summary", "Decisions", "Action Items", "Open Questions"]) {
        assert.match(lastMinutes.markdown, new RegExp(section, "i"), `minutes contain "${section}" section`)
    }
    assert.ok(Array.isArray(lastMemory?.facts), "memory.facts is an array")
    assert.ok(lastMemory.facts.length >= 1 && lastMemory.facts.length <= 8, "memory has 1-8 facts")
    assert.ok(lastMemory?.summary?.length > 0, "memory.summary non-empty")
    assert.ok(lastMemory.summary.split(/\s+/).length <= 60, "memory.summary ≤ 60 words")
})

// ─────────────────────────────────────────────────────────────────────────
console.log("")
console.log(`${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
