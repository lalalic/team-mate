// Pure Premium state helpers. Stripe verification belongs on the payment
// provider/server side; the extension stores only a successful checkout
// session activation and treats it as a soft entitlement gate.

export const PREMIUM_ENTITLEMENT_KEY = "premiumEntitlement"
export const PREMIUM_PREVIEW_KEY = "premiumDevOverride"
export const ONE_TIME_DURATION_MS = 7 * 24 * 60 * 60 * 1000

const STRIPE_SESSION_RE = /^cs_(?:test|live)_[A-Za-z0-9_-]+$/
const PURCHASE_MODES = new Set(["one_time", "weekly"])

export function isStripeCheckoutSessionId(value) {
    return STRIPE_SESSION_RE.test(String(value || "").trim())
}

export function normalizePurchaseMode(value) {
    const mode = String(value || "").trim().toLowerCase()
    return PURCHASE_MODES.has(mode) ? mode : "one_time"
}

export function createStripeEntitlement(sessionId, activatedAt = Date.now(), purchaseMode = "one_time") {
    const normalized = String(sessionId || "").trim()
    if (!isStripeCheckoutSessionId(normalized)) return null
    const at = Number(activatedAt) || Date.now()
    const mode = normalizePurchaseMode(purchaseMode)
    return {
        paid: true,
        source: "stripe",
        sessionId: normalized,
        purchaseMode: mode,
        recurring: mode === "weekly",
        activatedAt: at,
        ...(mode === "one_time" ? { expiresAt: at + ONE_TIME_DURATION_MS } : {}),
    }
}

export function isPaidEntitlement(record, now = Date.now()) {
    if (!(record?.paid === true && record?.source === "stripe" && isStripeCheckoutSessionId(record.sessionId))) return false
    // Legacy entitlements predate purchase-mode tracking; keep them readable/paid.
    if (!record.purchaseMode) return true
    if (normalizePurchaseMode(record.purchaseMode) === "weekly") return true
    const expiresAt = Number(record.expiresAt)
    return Number.isFinite(expiresAt) && expiresAt > Number(now)
}

export function extractStripeSessionId(locationLike) {
    try {
        const params = new URL(locationLike?.href || locationLike || "", "https://meetmate.invalid").searchParams
        const candidate = params.get("stripe_session") || params.get("session_id")
        return isStripeCheckoutSessionId(candidate) ? candidate.trim() : ""
    } catch (_) { return "" }
}

export function extractStripePurchaseMode(locationLike) {
    try {
        const params = new URL(locationLike?.href || locationLike || "", "https://meetmate.invalid").searchParams
        return normalizePurchaseMode(params.get("purchase") || params.get("purchase_mode"))
    } catch (_) { return "one_time" }
}

export function premiumState({ entitlement, preview = false, paymentLinks = {}, paymentLink = "", now = Date.now() } = {}) {
    const oneTimeLink = String(paymentLinks?.one_time || paymentLink || "").trim()
    const weeklyLink = String(paymentLinks?.weekly || "").trim()
    const configuredModes = [oneTimeLink && "one_time", weeklyLink && "weekly"].filter(Boolean)
    const configured = configuredModes.length > 0
    if (preview === true) return { paid: true, configured: false, configuredModes: [], preview: true, source: "local-preview" }
    if (isPaidEntitlement(entitlement, now)) return {
        paid: true, configured, configuredModes, preview: false, source: "stripe",
        sessionId: entitlement.sessionId, purchaseMode: entitlement.purchaseMode || "legacy",
        recurring: entitlement.purchaseMode === "weekly", activatedAt: entitlement.activatedAt, expiresAt: entitlement.expiresAt,
    }
    return {
        paid: false, configured, configuredModes, preview: false, source: configured ? "stripe" : "unconfigured",
        expired: !!entitlement?.purchaseMode && entitlement.purchaseMode !== "weekly" && Number(entitlement?.expiresAt) > 0 && Number(entitlement.expiresAt) <= Number(now),
        expiresAt: entitlement?.expiresAt,
    }
}
