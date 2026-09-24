// Pure Premium state helpers. Stripe verification belongs on the payment
// provider/server side; the extension stores only a successful checkout
// session activation and treats it as a soft entitlement gate.

export const PREMIUM_ENTITLEMENT_KEY = "premiumEntitlement"
export const PREMIUM_PREVIEW_KEY = "premiumDevOverride"

const STRIPE_SESSION_RE = /^cs_(?:test|live)_[A-Za-z0-9_-]+$/

export function isStripeCheckoutSessionId(value) {
    return STRIPE_SESSION_RE.test(String(value || "").trim())
}

export function createStripeEntitlement(sessionId, activatedAt = Date.now()) {
    const normalized = String(sessionId || "").trim()
    if (!isStripeCheckoutSessionId(normalized)) return null
    return { paid: true, source: "stripe", sessionId: normalized, activatedAt: Number(activatedAt) || Date.now() }
}

export function isPaidEntitlement(record) {
    return record?.paid === true && record?.source === "stripe" && isStripeCheckoutSessionId(record.sessionId)
}

export function extractStripeSessionId(locationLike) {
    try {
        const params = new URL(locationLike?.href || locationLike || "", "https://meetmate.invalid").searchParams
        const candidate = params.get("stripe_session") || params.get("session_id")
        return isStripeCheckoutSessionId(candidate) ? candidate.trim() : ""
    } catch (_) { return "" }
}

export function premiumState({ entitlement, preview = false, paymentLink = "" } = {}) {
    if (preview === true) return { paid: true, configured: false, preview: true, source: "local-preview" }
    if (isPaidEntitlement(entitlement)) return { paid: true, configured: !!paymentLink, preview: false, source: "stripe", sessionId: entitlement.sessionId, activatedAt: entitlement.activatedAt }
    return { paid: false, configured: !!paymentLink, preview: false, source: paymentLink ? "stripe" : "unconfigured" }
}
