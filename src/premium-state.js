// Pure Premium state helpers. Secret-bearing Stripe verification stays behind
// the server-side entitlement provider; the extension stores only an
// entitlement returned after that verification succeeds.

export const PREMIUM_ENTITLEMENT_KEY = "premiumEntitlement"
export const PREMIUM_PREVIEW_KEY = "premiumDevOverride"
export const ONE_TIME_DURATION_MS = 7 * 24 * 60 * 60 * 1000

const STRIPE_SESSION_RE = /^cs_(?:test|live)_[A-Za-z0-9_-]+$/
const PURCHASE_MODES = new Set(["one_time", "weekly"])

export function isStripeCheckoutSessionId(value) {
    return STRIPE_SESSION_RE.test(String(value || "").trim())
}

export function parsePurchaseMode(value) {
    const mode = String(value || "").trim().toLowerCase()
    return PURCHASE_MODES.has(mode) ? mode : ""
}

export function normalizePurchaseMode(value) {
    return parsePurchaseMode(value) || "one_time"
}

export function verifyStripeEntitlementSource(remote, purchaseMode, product = "team-mate") {
    const expectedMode = parsePurchaseMode(purchaseMode)
    const expectedProduct = String(product || "").trim().toLowerCase()
    if (!expectedMode || !expectedProduct) throw new Error("Invalid entitlement request.")
    if (!remote || typeof remote !== "object") throw new Error("Entitlement service returned invalid JSON.")
    if (String(remote.product || "").trim().toLowerCase() !== expectedProduct) throw new Error("Checkout belongs to a different product.")
    const remoteMode = parsePurchaseMode(remote.purchaseMode ?? remote.mode ?? remote.plan)
    if (remoteMode !== expectedMode) throw new Error("Checkout purchase mode does not match the selected plan.")
    return remoteMode
}

export function verifyStripeEntitlement(remote, purchaseMode, product = "team-mate") {
    const verifiedMode = verifyStripeEntitlementSource(remote, purchaseMode, product)
    if (remote.active !== true) throw new Error(`Checkout is not active (${remote.status || "inactive"}).`)
    if (verifiedMode === "one_time" && String(remote.status || "").toLowerCase() !== "paid") {
        throw new Error(`Checkout is not paid (${remote.status || "unpaid"}).`)
    }
    return verifiedMode
}

export function createVerifiedStripeEntitlement(sessionId, remote, purchaseMode, activatedAt = Date.now(), product = "team-mate") {
    const verifiedMode = verifyStripeEntitlement(remote, purchaseMode, product)
    const entitlement = createStripeEntitlement(sessionId, activatedAt, verifiedMode)
    if (!entitlement) throw new Error("Invalid Stripe Checkout session id.")
    if (entitlement.purchaseMode === "weekly") {
        return {
            ...applyWeeklyEntitlementStatus(entitlement, remote, activatedAt),
            checkedAt: activatedAt,
        }
    }
    return { ...entitlement, stripeStatus: String(remote.status || "paid") }
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
        expiresAt: at + ONE_TIME_DURATION_MS,
    }
}

export function isPaidEntitlement(record, now = Date.now()) {
    if (!(record?.paid === true && record?.source === "stripe" && isStripeCheckoutSessionId(record.sessionId))) return false
    // Legacy entitlements predate purchase-mode tracking; keep them readable/paid.
    if (!record.purchaseMode) return true
    const expiresAt = Number(record.expiresAt)
    return Number.isFinite(expiresAt) && expiresAt > Number(now)
}

export const STRIPE_ENTITLEMENT_PRODUCT_ID = "team-mate"

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
        expired: !!entitlement?.purchaseMode && Number(entitlement?.expiresAt) > 0 && Number(entitlement.expiresAt) <= Number(now),
        expiresAt: entitlement?.expiresAt,
    }
}

export function shouldRefreshWeeklyEntitlement(record, { force = false, now = Date.now() } = {}) {
    if (record?.purchaseMode !== "weekly" || !isStripeCheckoutSessionId(record?.sessionId)) return false
    if (force) return true
    const expiresAt = Number(record.expiresAt)
    return !Number.isFinite(expiresAt) || expiresAt <= Number(now)
}

export function isVerifiedEntitlementResponse(remote, expectedPurchaseMode, expectedProduct = STRIPE_ENTITLEMENT_PRODUCT_ID, now = Date.now()) {
    if (!remote || remote.active !== true) return false
    const purchaseMode = String(remote.purchaseMode || remote.plan || "").trim().toLowerCase()
    if (!PURCHASE_MODES.has(purchaseMode) || purchaseMode !== expectedPurchaseMode) return false
    if (String(remote.product || "").trim().toLowerCase() !== String(expectedProduct || "").trim().toLowerCase()) return false
    const status = String(remote.status || "").trim().toLowerCase()
    if (expectedPurchaseMode === "one_time") {
        return status === "paid"
    }
    const periodEnd = Date.parse(String(remote.currentPeriodEnd || ""))
    return ["active", "trialing"].includes(status) && Number.isFinite(periodEnd) && periodEnd > Number(now)
}

export function applyWeeklyEntitlementStatus(record, remote, now = Date.now()) {
    if (record?.purchaseMode !== "weekly") return record
    if (!isVerifiedEntitlementResponse(remote, "weekly", STRIPE_ENTITLEMENT_PRODUCT_ID, now)) {
        return { ...record, paid: false, expiresAt: Number(now), stripeStatus: String(remote?.status || "inactive") }
    }
    if (remote?.active !== true) return { ...record, paid: false, expiresAt: Number(now), stripeStatus: String(remote?.status || "inactive") }
    const remoteEnd = Date.parse(String(remote.currentPeriodEnd || ""))
    const localWindowEnd = Number(now) + ONE_TIME_DURATION_MS
    const expiresAt = Number.isFinite(remoteEnd) && remoteEnd > Number(now) ? Math.min(localWindowEnd, remoteEnd) : localWindowEnd
    return { ...record, paid: true, expiresAt, stripeStatus: String(remote.status || "active"), checkedAt: Number(now) }
}

export function buildEntitlementStatusUrl(endpoint, sessionId, product, purchaseMode = "") {
    const base = String(endpoint || "").replace(/\/$/, "")
    const id = String(sessionId || "").trim()
    const productId = String(product || "").trim().toLowerCase()
    const mode = purchaseMode === "weekly" || purchaseMode === "one_time" ? purchaseMode : "one_time"
    if (!base || !isStripeCheckoutSessionId(id) || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(productId)) return ""
    const params = new URLSearchParams({ session_id: id, product: productId })
    if (mode) params.set("purchase_mode", mode)
    return `${base}/v1/entitlement?${params.toString()}`
}
