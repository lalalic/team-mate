// tests/test-state-machine.js
// Pure unit tests for state-machine.js. No DOM, no fetch.
// Run: node tests/test-state-machine.js

import assert from "node:assert/strict"
import { classifyState, StateMachineConstants as K } from "../src/state-machine.js"

let pass = 0, fail = 0
function t(name, fn) {
    try { fn(); console.log(`  ✓ ${name}`); pass++ }
    catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); fail++ }
}

const me = "Lily Wang"
const ts = (off) => Date.now() - off  // ms ago helper

console.log("State 1 — I'm talking")
t("speaking now (sub<2s)", () => {
    const now = Date.now()
    const r = classifyState({
        now,
        me,
        transcripts: [
            { Name: "Bob", Text: "What about retention?", _ts: now - 8000 },
            { Name: "Lily Wang", Text: "Our Q3 retention is 38%", _ts: now - 500 },
        ],
    })
    assert.equal(r.state, 1)
    assert.equal(r.payload.sub, "speaking")
})
t("paused (>2s, <6s) ⇒ polish window", () => {
    const now = Date.now()
    const r = classifyState({
        now,
        me,
        transcripts: [
            { Name: "Bob", Text: "What about retention?", _ts: now - 10000 },
            { Name: "Lily Wang", Text: "Our Q3 retention is 38%", _ts: now - 3000 },
        ],
    })
    assert.equal(r.state, 1)
    assert.equal(r.payload.sub, "paused")
})
t("first-name match counts", () => {
    const now = Date.now()
    const r = classifyState({
        now,
        me: "Lily Wang",
        transcripts: [{ Name: "Lily", Text: "Hi", _ts: now - 200 }],
    })
    assert.equal(r.state, 1)
})

console.log("State 2 — I'm mentioned")
t("name + question ⇒ state 2", () => {
    const now = Date.now()
    const r = classifyState({
        now, me,
        transcripts: [
            { Name: "Bob", Text: "Lily, can you confirm the timeline?", _ts: now - 1500 },
        ],
    })
    assert.equal(r.state, 2)
    assert.equal(r.payload.isQuestion, true)
})
t("name + action verb (own/take) ⇒ state 2", () => {
    const now = Date.now()
    const r = classifyState({
        now, me,
        transcripts: [
            { Name: "Bob", Text: "Lily will own that.", _ts: now - 1500 },
        ],
    })
    assert.equal(r.state, 2)
    assert.equal(r.payload.isAction, true)
})
t("name without question/action ⇒ idle", () => {
    const now = Date.now()
    const r = classifyState({
        now, me,
        transcripts: [
            { Name: "Bob", Text: "Lily is here too.", _ts: now - 6000 },
        ],
    })
    assert.equal(r.state, 4)
})
t("sticky state 2 within window", () => {
    const now = Date.now()
    const r = classifyState({
        now, me,
        transcripts: [{ Name: "Bob", Text: "anyway, moving on", _ts: now - 5000 }],
        lastState: 2,
        lastEnter: now - 5000,
    })
    assert.equal(r.state, 2)
    assert.equal(r.payload.sticky, true)
})

console.log("State 3 — Attention toggled")
t("ask bar active ⇒ state 3", () => {
    const r = classifyState({ me, askBar: { active: true, query: "what did we say last meeting?" } })
    assert.equal(r.state, 3)
    assert.equal(r.payload.query, "what did we say last meeting?")
})
t("sticky state 3 after dismissal grace", () => {
    const now = Date.now()
    const r = classifyState({
        now, me,
        transcripts: [],
        lastState: 3,
        lastEnter: now - 5000,
    })
    assert.equal(r.state, 3)
    assert.equal(r.payload.sticky, true)
})
t("state 3 dismissed ⇒ falls through to idle", () => {
    const r = classifyState({ me, askBar: { dismissed: true }, lastState: 3, lastEnter: Date.now() - 100 })
    assert.equal(r.state, 4)
})

console.log("State 4 — Idle (default)")
t("no captions ⇒ idle", () => {
    assert.equal(classifyState({ me }).state, 4)
})
t("others chatting, no mention ⇒ idle", () => {
    const now = Date.now()
    const r = classifyState({
        now, me,
        transcripts: [
            { Name: "Bob", Text: "We should ship next week.", _ts: now - 2000 },
            { Name: "Carol", Text: "agreed", _ts: now - 1000 },
        ],
    })
    assert.equal(r.state, 4)
})

console.log("Hysteresis / priority")
t("state 3 wins over state 1", () => {
    const now = Date.now()
    const r = classifyState({
        now, me, askBar: { active: true },
        transcripts: [{ Name: me, Text: "hi", _ts: now - 100 }],
    })
    assert.equal(r.state, 3)
})
t("state 1 wins over state 2 when me speaks last", () => {
    const now = Date.now()
    const r = classifyState({
        now, me,
        transcripts: [
            { Name: "Bob", Text: "Lily, can you confirm?", _ts: now - 5000 },
            { Name: me, Text: "yes, by Friday", _ts: now - 500 },
        ],
    })
    assert.equal(r.state, 1)
})

console.log()
console.log(`${pass} pass, ${fail} fail`)
process.exit(fail > 0 ? 1 : 0)
