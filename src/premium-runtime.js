import {
    applyWeeklyEntitlementStatus,
    buildEntitlementStatusUrl,
    createVerifiedStripeEntitlement,
    premiumState,
    shouldRefreshWeeklyEntitlement,
    verifyStripeEntitlementSource,
    PREMIUM_ENTITLEMENT_KEY,
    PREMIUM_PREVIEW_KEY,
} from "./premium-state.js"

export function createPremiumEntitlementService({
    getLocal,
    setLocal,
    paymentLinks = {},
    endpoint = "",
    product = "team-mate",
    fetchImpl = globalThis.fetch,
    now = Date.now,
}) {
    async function premiumStatus({ force = false } = {}) {
        const stored = await getLocal([PREMIUM_ENTITLEMENT_KEY, PREMIUM_PREVIEW_KEY])
        let entitlement = stored[PREMIUM_ENTITLEMENT_KEY]
        if (shouldRefreshWeeklyEntitlement(entitlement, { force, now: now() })) {
            if (!endpoint) {
                if (!force && premiumState({ entitlement, paymentLinks, now: now() }).paid) {
                    return premiumState({ entitlement, preview: stored[PREMIUM_PREVIEW_KEY] === true, paymentLinks, now: now() })
                }
                entitlement = { ...entitlement, paid: false, stripeStatus: "endpoint_unconfigured" }
                await setLocal({ [PREMIUM_ENTITLEMENT_KEY]: entitlement })
            } else {
                try {
                    const entitlementUrl = buildEntitlementStatusUrl(endpoint, entitlement.sessionId, product, entitlement.purchaseMode)
                    const response = await fetchImpl(entitlementUrl, { cache: "no-store" })
                    if (!response.ok) throw new Error(`Entitlement service returned ${response.status}`)
                    const remote = await response.json()
                    verifyStripeEntitlementSource(remote, entitlement.purchaseMode, product)
                    entitlement = applyWeeklyEntitlementStatus(entitlement, remote, now())
                    await setLocal({ [PREMIUM_ENTITLEMENT_KEY]: entitlement })
                } catch (error) {
                    if (!premiumState({ entitlement, paymentLinks, now: now() }).paid) {
                        entitlement = { ...entitlement, paid: false, stripeStatus: "check_failed", lastCheckError: error?.message || String(error) }
                        await setLocal({ [PREMIUM_ENTITLEMENT_KEY]: entitlement })
                    }
                }
            }
        }
        return premiumState({ entitlement, preview: stored[PREMIUM_PREVIEW_KEY] === true, paymentLinks, now: now() })
    }

    async function activateStripeSession(sessionId, purchaseMode = "one_time") {
        if (!endpoint) throw new Error("Stripe entitlement verification is not configured in this build.")
        const activatedAt = now()
        let remote
        try {
            const verificationUrl = buildEntitlementStatusUrl(endpoint, sessionId, product, purchaseMode === "weekly" ? "weekly" : "one_time")
            if (!verificationUrl) throw new Error("Invalid Stripe Checkout session id.")
            const response = await fetchImpl(verificationUrl, { cache: "no-store" })
            if (!response.ok) throw new Error(`Entitlement service returned ${response.status}`)
            remote = await response.json()
        } catch (error) {
            throw new Error(error?.message || "Stripe entitlement verification failed.")
        }
        const entitlement = createVerifiedStripeEntitlement(sessionId, remote, purchaseMode, activatedAt, product)
        await setLocal({ [PREMIUM_ENTITLEMENT_KEY]: entitlement, [PREMIUM_PREVIEW_KEY]: false })
        return premiumState({ entitlement, paymentLinks, now: activatedAt })
    }

    return { activateStripeSession, premiumStatus }
}
