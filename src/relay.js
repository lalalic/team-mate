// teams-live-caption-ai/src/relay.js
//
// Thin HTTPS client for copilot-relay v4.
// Replaces the v3 WebSocket / JSON-RPC session protocol with a plain
// OpenAI-compatible `/llm/v1/chat/completions` round-trip. The loop
// concept moved to `loop-session.js` which is now driven entirely by
// the "neverstop" protocol in the system prompt (see
// docs/agent-design-v4.md §4).
//
// What stays from v3:
//  - `STRIPE_PAYMENT_LINKS` / `STRIPE_PAYMENT_LINK` (top-up).
//  - `getUsage` / `resetUsage` (local token-cost ledger).
//
// What's gone:
//  - WebSocket transport, CopilotRelayClient import, getRelayClient,
//    relayChat (replaced by `chatCompletion()`), resetRelayClient (no
//    connection state), per-meeting sessionId plumbing.

import { getConf } from "./shared.js"
import { ensureBearer, RELAY_BASE_URL } from "./auth.js"

const DEFAULT_MODEL = "deepseek-chat"

// Stripe Payment Links for the Top-up tiers. URLs are PUBLIC (Payment
// Link URLs are designed to be shared). LIVE mode — product
// prod_UP6B4SZtvOmMLy "Team-Mate Credits" with after_completion.redirect.url
// pointing back at this extension's setup.html (extension ID derived
// from manifest "key" field):
//   chrome-extension://immkojolaicdjhkbbhkldmndhfjbehmf/setup.html?credit=<N>&session={CHECKOUT_SESSION_ID}
export const STRIPE_PAYMENT_LINKS = {
    1:   "https://buy.stripe.com/14A7sLfQc0DY3YTfGp24004",   // $1   plink_1TQHzIHKHUCpvkuPEWUepOKj
    10:  "https://buy.stripe.com/5kQ28r5byfySgLF0Lv24005",   // $10  plink_1TQHzJHKHUCpvkuPsRBGiEnw
}
// Back-compat: default link used when caller doesn't pick a tier.
export const STRIPE_PAYMENT_LINK = STRIPE_PAYMENT_LINKS[1]

// --- Token usage tracking ----------------------------------------------------
// Persisted to chrome.storage.local under "usage" so it survives page reloads.
const USAGE_KEY = "usage"
const USAGE_DEFAULT = { cost: 0, inputTokens: 0, outputTokens: 0, sinceTs: 0, lastTurn: null }

export async function getUsage() {
    return new Promise(resolve => {
        try {
            chrome.storage.local.get([USAGE_KEY], res => {
                const u = res[USAGE_KEY] || { ...USAGE_DEFAULT }
                if (!u.sinceTs) u.sinceTs = Date.now()
                resolve(u)
            })
        } catch {
            resolve({ ...USAGE_DEFAULT, sinceTs: Date.now() })
        }
    })
}

export async function resetUsage() {
    return new Promise(resolve => {
        const fresh = { ...USAGE_DEFAULT, sinceTs: Date.now() }
        try { chrome.storage.local.set({ [USAGE_KEY]: fresh }, () => resolve(fresh)) }
        catch { resolve(fresh) }
    })
}

async function recordUsage(usage, model) {
    if (!usage) return
    // OpenAI shape: { prompt_tokens, completion_tokens, total_tokens }
    const inputTokens = Number(usage.prompt_tokens) || 0
    const outputTokens = Number(usage.completion_tokens) || 0
    // Relay v4 may attach a per-turn `cost` field; fall back to 0 (the
    // setup page derives a display cost from the model price table).
    const cost = Number(usage.cost) || 0
    const u = await getUsage()
    u.cost += cost
    u.inputTokens += inputTokens
    u.outputTokens += outputTokens
    u.lastTurn = { inputTokens, outputTokens, cost, model, ts: Date.now() }
    if (!u.sinceTs) u.sinceTs = Date.now()
    try { chrome.storage.local.set({ [USAGE_KEY]: u }) } catch { /* ignore */ }
}

// --- Server-side wallet (relay v4) ------------------------------------------
// Mirror of `X-Balance-Cents` header sent on every successful chat/completions
// response (and `balance_cents` field on 402 / stripe-verify). Authoritative
// source is the relay; this local copy is a UI cache only.
const WALLET_KEY = "walletBalanceCents"

export async function getWalletBalanceCents() {
    return new Promise(resolve => {
        try {
            chrome.storage.local.get([WALLET_KEY], res => {
                const v = res[WALLET_KEY]
                resolve(Number.isFinite(v) ? Number(v) : null)
            })
        } catch { resolve(null) }
    })
}

async function setWalletBalanceCents(cents) {
    if (!Number.isFinite(cents)) return
    try { chrome.storage.local.set({ [WALLET_KEY]: cents }) } catch { /* ignore */ }
}

// Fetch wallet balance from relay server and update local cache
export async function fetchWalletBalance() {
    try {
        const bearer = await ensureBearer()
        const resp = await fetch(`${RELAY_BASE_URL}/wallet/balance`, {
            headers: { Authorization: `Bearer ${bearer}` }
        })
        if (!resp.ok) return null
        const data = await resp.json()
        if (Number.isFinite(data.balance_cents)) {
            await setWalletBalanceCents(data.balance_cents)
            return data.balance_cents
        }
    } catch { /* ignore */ }
    return null
}

/**
 * POST /llm/v1/chat/completions
 *
 * Stateless OpenAI-compatible call. Caller owns the entire `messages`
 * array (system + history + tool messages). Tool-calling is supported
 * by passing OpenAI-shaped `tools` and `tool_choice`.
 *
 * Auto-registers the device on first use (via ensureBearer).
 *
 * @param {object} req
 * @param {Array}  req.messages     OpenAI messages[]
 * @param {Array}  [req.tools]      OpenAI tools[] (function definitions)
 * @param {string} [req.tool_choice] "auto" | "required" | {type,...}
 * @param {string} [req.model]      Override (default: conf.relayModel or gpt-4.1)
 * @param {AbortSignal} [req.signal]
 * @returns {Promise<object>} OpenAI response (choices[0].message + usage)
 */
export async function chatCompletion(req) {
    const conf = (await getConf()) || {}
    const baseURL = (conf.baseURL || RELAY_BASE_URL).replace(/\/$/, "")
    // BYOK skips registration — caller must have set conf.apiKey themselves.
    const bearer = conf.baseURL ? conf.apiKey : await ensureBearer()
    if (!bearer) throw new Error("missing bearer: register or set conf.apiKey")

    const model = req.model || conf.relayModel || conf.modelName || DEFAULT_MODEL
    const body = { model, messages: req.messages }
    if (req.tools) body.tools = req.tools
    if (req.tool_choice) body.tool_choice = req.tool_choice
    if (req.temperature != null) body.temperature = req.temperature

    const res = await fetch(`${baseURL}/chat/completions`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "authorization": `Bearer ${bearer}`,
        },
        body: JSON.stringify(body),
        signal: req.signal,
    })

    // Server-side wallet (relay v4): 402 = insufficient_funds. Surface
    // a typed error so callers can offer top-up.
    if (res.status === 402) {
        let info = {}
        try { info = await res.json() } catch {}
        await setWalletBalanceCents(Number(info.balance_cents) || 0)
        const err = new Error("insufficient_funds")
        err.code = "insufficient_funds"
        err.balanceCents = Number(info.balance_cents) || 0
        err.topupUrl = info.topup_url || STRIPE_PAYMENT_LINK
        throw err
    }

    if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(`chat/completions failed (${res.status}): ${text}`)
    }

    // Capture server-authoritative balance (sent on every successful call).
    const balHdr = res.headers.get("x-balance-cents")
    if (balHdr != null) await setWalletBalanceCents(Number(balHdr))

    const json = await res.json()
    if (json.usage) recordUsage(json.usage, model)
    return json
}

/**
 * Convenience: send a single user message under a given system prompt,
 * return assistant text. No tools, no history.
 *
 * Replaces the old `relayChat()` WS function. Used by the setup page
 * "test" button and anywhere that just wants a one-shot reply.
 */
export async function relayChat(message, opts = {}) {
    const messages = []
    if (opts.systemMessage) {
        messages.push({ role: "system", content: opts.systemMessage })
    }
    messages.push({ role: "user", content: message })
    const res = await chatCompletion({
        messages,
        model: opts.model,
        temperature: opts.temperature,
    })
    return res.choices?.[0]?.message?.content || ""
}

/**
 * v3 left a stale connection that needed teardown. v4 is stateless, so
 * this is a no-op kept for caller compatibility (content.js still
 * calls it on meeting-end).
 */
export async function resetRelayClient() { /* no-op in v4 */ }

/**
 * Fetch the relay's model catalogue (OpenAI shape: `{data:[...]}`).
 * The setup page populates its `<select id="model">` from this.
 */
export async function fetchModels() {
    const conf = (await getConf()) || {}
    const baseURL = (conf.baseURL || RELAY_BASE_URL).replace(/\/$/, "")
    try {
        const res = await fetch(`${baseURL}/models`)
        if (!res.ok) return []
        const json = await res.json()
        return Array.isArray(json) ? json : (json.data || [])
    } catch (e) {
        console.warn("fetchModels failed", e)
        return []
    }
}
