// Regression and lifecycle coverage for server-verified Premium activation.
// The provider-faithful fixture is imported only by this test; webpack never
// bundles it and it contains no Stripe secret.
import assert from "node:assert/strict"
import {
    ONE_TIME_DURATION_MS, PREMIUM_ENTITLEMENT_KEY, applyWeeklyEntitlementStatus,
    buildEntitlementStatusUrl, createVerifiedStripeEntitlement, isVerifiedEntitlementResponse,
    verifyStripeEntitlement,
} from "../src/premium-state.js"
import { createPremiumEntitlementService } from "../src/premium-runtime.js"
import { createStripeTestProvider } from "./support/stripe-test-provider.js"

const day = 24 * 60 * 60 * 1000
const now = 1_000
const product = "team-mate"

assert.equal(buildEntitlementStatusUrl("https://payments.invalid/", "cs_test_arbitrary", product), `https://payments.invalid/v1/entitlement?session_id=cs_test_arbitrary&product=team-mate&purchase_mode=one_time`)
assert.equal(buildEntitlementStatusUrl("https://payments.invalid/", "cs_test_arbitrary", product, "one_time"), `https://payments.invalid/v1/entitlement?session_id=cs_test_arbitrary&product=team-mate&purchase_mode=one_time`)
assert.equal(buildEntitlementStatusUrl("https://payments.invalid", "premium=true", product, "one_time"), "")
assert.equal(buildEntitlementStatusUrl("https://payments.invalid", "cs_live_also_arbitrary", ""), "")

assert.equal(isVerifiedEntitlementResponse({ active: true, product, plan: "one_time", status: "complete" }, "one_time"), false)
assert.equal(isVerifiedEntitlementResponse({ active: true, product, purchaseMode: "one_time", status: "paid" }, "one_time", product, now), true)
assert.equal(isVerifiedEntitlementResponse({ active: true, product, purchaseMode: "weekly", status: "paid" }, "one_time", product, now), false)
assert.equal(isVerifiedEntitlementResponse({ active: true, product: "family-tutor", purchaseMode: "one_time", status: "paid" }, "one_time", product, now), false)
assert.equal(isVerifiedEntitlementResponse({ active: true, product, plan: "weekly", status: "active", currentPeriodEnd: new Date(now + 1).toISOString() }, "weekly", product, now), true)
assert.equal(isVerifiedEntitlementResponse({ active: true, product, plan: "weekly", status: "active", currentPeriodEnd: new Date(now).toISOString() }, "weekly", product, now), false)
assert.equal(isVerifiedEntitlementResponse({ active: true, product, plan: "weekly", status: "trialing", currentPeriodEnd: new Date(now + 1).toISOString() }, "weekly", product, now), true)
assert.equal(applyWeeklyEntitlementStatus(
    { purchaseMode: "weekly", sessionId: "cs_test_123" },
    { active: true, product, purchaseMode: "weekly", status: "active", currentPeriodEnd: new Date(now + 2 * ONE_TIME_DURATION_MS).toISOString() },
    now + ONE_TIME_DURATION_MS,
).paid, true)
assert.equal(applyWeeklyEntitlementStatus(
    { purchaseMode: "weekly", sessionId: "cs_test_123" },
    { active: true, product, purchaseMode: "one_time", status: "active", currentPeriodEnd: new Date(now + 2 * ONE_TIME_DURATION_MS).toISOString() },
    now + ONE_TIME_DURATION_MS,
).paid, false)
assert.equal(createVerifiedStripeEntitlement("cs_test_paid", {
    active: true, product, plan: "one_time", status: "paid", currentPeriodEnd: null,
}, "one_time", now).expiresAt, now + ONE_TIME_DURATION_MS)
assert.throws(() => verifyStripeEntitlement({
    active: true, product, plan: "one_time", status: "complete", currentPeriodEnd: null,
}, "one_time", product), /not paid/)

const provider = createStripeTestProvider({ now })
const storage = new Map()
const activationCalls = []
const service = createPremiumEntitlementService({
    getLocal: async keys => Object.fromEntries(keys.map(key => [key, structuredClone(storage.get(key))])),
    setLocal: async value => { for (const [key, item] of Object.entries(value)) storage.set(key, structuredClone(item)) },
    paymentLinks: { one_time: "https://buy.stripe.com/test-one", weekly: "https://buy.stripe.com/test-weekly" },
    endpoint: "https://payments.invalid",
    product,
    fetchImpl: async (url, init) => {
        activationCalls.push(String(url))
        return provider.fetch(url, init)
    },
    now: () => provider.now(),
})

for (const arbitrary of ["cs_test_arbitrary", "cs_live_arbitrary", "premium=true", ""]) {
    const calls = activationCalls.length
    await assert.rejects(service.activateStripeSession(arbitrary, "one_time"), /verification failed|Invalid Stripe Checkout session|purchase mode|different product|not active/)
    assert.equal(activationCalls.length > calls, /^cs_(?:test|live)_[A-Za-z0-9_-]+$/.test(arbitrary))
}
assert.equal(storage.has(PREMIUM_ENTITLEMENT_KEY), false)

// A valid paid one-time session grants exactly the seven-day local pass.
provider.setNow(now)
const oneTime = provider.createOneTimeCheckout()
const activatedOneTime = await service.activateStripeSession(oneTime.id, "one_time")
assert.equal(activatedOneTime.paid, true)
assert.equal(activatedOneTime.purchaseMode, "one_time")
assert.equal(activatedOneTime.expiresAt, now + ONE_TIME_DURATION_MS)
assert.equal(storage.get(PREMIUM_ENTITLEMENT_KEY).sessionId, oneTime.id)

provider.setNow(now + day)
assert.equal((await service.premiumStatus()).paid, true)
provider.setNow(now + ONE_TIME_DURATION_MS + 1)
const expiredOneTime = await service.premiumStatus()
assert.equal(expiredOneTime.paid, false)
assert.equal(expiredOneTime.expired, true)

// Mode confusion cannot activate: a one-time checkout cannot renew weekly.
provider.setNow(now)
const modeMismatch = provider.createOneTimeCheckout()
    await assert.rejects(service.activateStripeSession(modeMismatch.id, "weekly"), /purchase mode/)

const weekly = provider.createWeeklyCheckout()
const activatedWeekly = await service.activateStripeSession(weekly.session.id, "weekly")
assert.equal(activatedWeekly.paid, true)
assert.equal(activatedWeekly.purchaseMode, "weekly")
assert.equal(activatedWeekly.recurring, true)
assert.equal(storage.get(PREMIUM_ENTITLEMENT_KEY).expiresAt, now + ONE_TIME_DURATION_MS)

// After cache expiry the active provider subscription extends the cache.
provider.setSubscriptionStatus(weekly.session, "active", now + 14 * day)
provider.setNow(now + ONE_TIME_DURATION_MS)
const renewed = await service.premiumStatus()
assert.equal(renewed.paid, true)
assert.equal(renewed.expiresAt, now + 14 * day)

// Refresh forces reconciliation; cancellation expires immediately.
provider.setSubscriptionStatus(weekly.session, "canceled", now + 14 * day)
const canceled = await service.premiumStatus({ force: true })
assert.equal(canceled.paid, false)
assert.equal(storage.get(PREMIUM_ENTITLEMENT_KEY).stripeStatus, "canceled")

// A later active-looking response with a stale period remains inactive.
provider.setSubscriptionStatus(weekly.session, "past_due", now + day)
assert.equal((await service.premiumStatus({ force: true })).paid, false)

console.log("premium payment verification checks passed")
