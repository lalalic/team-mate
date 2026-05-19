// src/state-machine.js
//
// Pure state classifier for MeetMate v4.1's 4-state UX.
// Given recent captions + identity + clock + ask-bar status, returns
// {state, payload} where state ∈ {1,2,3,4}:
//
//   1 → I'm talking         (immediate, sub-second)
//   2 → I'm mentioned       (alert)
//   3 → Attention toggled   (user pressed ? or focused/submitted Ask bar)
//   4 → Idle                (default, low-noise)
//
// Pure function, no side effects, no DOM. Easy to test offline.
//
// Inputs:
//   transcripts : Array<{Name, Text, Time}>  newest-last
//   me          : string                     conf.author (display name)
//   now         : number                     Date.now()
//   askBar      : { active?:bool, query?:string, ts?:number }
//                  set active when user clicked ? or focused Ask bar
//                  set query+ts when user submitted text
//   lastState   : number                     previous state (for hysteresis)
//   lastEnter   : number                     timestamp prev state entered
//
// Output:
//   { state: 1|2|3|4,
//     payload: { ...state-specific info... },
//     reason: string }                       short human reason for logs

const ACTION_VERBS = /(\b(can you|could you|would you|will you)\b|\b(review|own|take|decide|sign[- ]off|approve|confirm|do you|what do you think|thoughts\??))/i

const TALK_PAUSE_MS = 2000   // 2s silence after my last caption ⇒ surface polish
const STATE2_STICKY_MS = 30000 // mention overlay sticks for 30s
const STATE3_STICKY_MS = 60000 // toggled overlay sticks for 60s
const IDLE_AFTER_MS    = 10000 // 10s of nothing ⇒ idle

function normName(s) { return String(s || "").trim().toLowerCase() }

function matchesMe(captionName, me) {
    const a = normName(captionName), b = normName(me)
    if (!a || !b) return false
    if (a === b) return true
    // tolerate "Lily" vs "Lily Wang", "Mom (Acme)" vs "Mom"
    const first = b.split(/\s+/)[0]
    return a === first || a.startsWith(b + " ") || b.startsWith(a + " ")
}

function mentionsMe(text, me) {
    if (!text || !me) return false
    const meName = String(me).trim()
    if (!meName) return false
    const first = meName.split(/\s+/)[0]
    const re = new RegExp(`\\b${escRe(meName)}\\b|\\b${escRe(first)}\\b`, "i")
    return re.test(text)
}

function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") }

function captionTs(c) {
    // Time is mm:ss relative to meeting start; we use array order + insertion
    // time instead. Caller passes the raw transcripts list; recency comes
    // from index order.
    return c?._ts || 0
}

/**
 * @param {object} input
 * @returns {{state:1|2|3|4, payload:object, reason:string}}
 */
export function classifyState(input) {
    const {
        transcripts = [],
        me = "",
        now = Date.now(),
        askBar = null,
        lastState = 4,
        lastEnter = 0,
    } = input || {}

    // ── State 3: explicit user toggle ───────────────────────────────────
    if (askBar?.active) {
        return {
            state: 3,
            payload: { query: askBar.query || "", askedAt: askBar.ts || now },
            reason: "ask-bar active",
        }
    }
    // Sticky state 3: if last state was 3 and within sticky window AND user
    // hasn't dismissed (askBar?.dismissed flag), keep it.
    if (lastState === 3 && !askBar?.dismissed && now - lastEnter < STATE3_STICKY_MS) {
        return { state: 3, payload: { sticky: true }, reason: "state3 sticky" }
    }

    const recent = transcripts.slice(-6)
    const last   = recent[recent.length - 1]
    const lastTs = last?._ts || now

    // ── State 2 (priority): a recent caption from someone else addresses
    // me with a question or action verb. This wins over state 1 because a
    // direct address overrides "I just spoke." We scan backward over the
    // recent window for the most recent OTHER-speaker caption that
    // mentions me with a question or action verb, and accept it if it's
    // within 5s of now. Without this priority check, a flurry of my own
    // captions could mask the fact that someone just asked me a question.
    for (let i = recent.length - 1; i >= 0; i--) {
        const c = recent[i]
        if (!c || matchesMe(c.Name, me)) continue
        const t = c.Text || ""
        if (!mentionsMe(t, me)) continue
        const isQuestion = /\?/.test(t)
        const isAction   = ACTION_VERBS.test(t)
        if (!isQuestion && !isAction) continue
        const age = now - (c._ts || 0)
        if (age > 5000) break // too old; let normal flow handle
        return {
            state: 2,
            payload: { speaker: c.Name, text: t, isQuestion, isAction },
            reason: "i was addressed (recent)",
        }
    }

    // ── State 1: I'm talking ─────────────────────────────────────────────
    // Last 1-2 captions are mine AND either ongoing (recent) or paused <2s.
    const myRun = []
    for (let i = recent.length - 1; i >= 0; i--) {
        if (matchesMe(recent[i]?.Name, me)) myRun.unshift(recent[i])
        else break
    }
    if (myRun.length > 0) {
        const sinceMine = now - (myRun[myRun.length - 1]._ts || now)
        if (sinceMine < TALK_PAUSE_MS) {
            return {
                state: 1,
                payload: {
                    sub: "speaking",
                    mine: myRun.map(c => c.Text).join(" "),
                    sinceMs: sinceMine,
                },
                reason: "i'm speaking",
            }
        }
        if (sinceMine < TALK_PAUSE_MS + 4000) {
            // Just paused — show polish window.
            return {
                state: 1,
                payload: {
                    sub: "paused",
                    mine: myRun.map(c => c.Text).join(" "),
                    sinceMs: sinceMine,
                },
                reason: "polish window after pause",
            }
        }
    }

    // ── State 2: I'm mentioned ──────────────────────────────────────────
    // Look at the last non-me caption for my name + action verb / question.
    for (let i = recent.length - 1; i >= 0; i--) {
        const c = recent[i]
        if (!c || matchesMe(c.Name, me)) continue
        const t = c.Text || ""
        if (!mentionsMe(t, me)) break  // only consider the very latest other-speaker turn
        const isQuestion = /\?/.test(t)
        const isAction   = ACTION_VERBS.test(t)
        if (isQuestion || isAction) {
            return {
                state: 2,
                payload: { speaker: c.Name, text: t, isQuestion, isAction },
                reason: "i was addressed",
            }
        }
        break
    }
    // Sticky state 2: if last state was 2 and within window, keep it.
    if (lastState === 2 && now - lastEnter < STATE2_STICKY_MS) {
        return { state: 2, payload: { sticky: true }, reason: "state2 sticky" }
    }

    // ── State 4: idle (default) ─────────────────────────────────────────
    return {
        state: 4,
        payload: { recentCount: recent.length, lastTs },
        reason: lastState === 4 ? "still idle" : "fall through",
    }
}

// Re-export constants so tests + UI can share.
export const StateMachineConstants = {
    TALK_PAUSE_MS,
    STATE2_STICKY_MS,
    STATE3_STICKY_MS,
    IDLE_AFTER_MS,
}
