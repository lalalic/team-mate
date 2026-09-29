import assert from "node:assert/strict"
import {
    ONE_TIME_DURATION_MS, createStripeEntitlement, extractStripePurchaseMode, extractStripeSessionId,
    isPaidEntitlement, premiumState,
} from "../src/premium-state.js"

const session = "cs_test_1234567890"
assert.equal(createStripeEntitlement("premium=true"), null)
assert.equal(createStripeEntitlement(""), null)

const oneTime = createStripeEntitlement(session, 1_000, "one_time")
assert.equal(oneTime.purchaseMode, "one_time")
assert.equal(oneTime.recurring, false)
assert.equal(oneTime.expiresAt, 1_000 + ONE_TIME_DURATION_MS)
assert.equal(isPaidEntitlement(oneTime, 1_000 + ONE_TIME_DURATION_MS - 1), true)
assert.equal(isPaidEntitlement(oneTime, 1_000 + ONE_TIME_DURATION_MS), false)

const weekly = createStripeEntitlement(session, 1_000, "weekly")
assert.equal(weekly.purchaseMode, "weekly")
assert.equal(weekly.recurring, true)
assert.equal(weekly.expiresAt, undefined)
assert.equal(isPaidEntitlement(weekly, 1_000 + 100 * ONE_TIME_DURATION_MS), true)

assert.equal(isPaidEntitlement({ paid: true, source: "extensionpay", sessionId: session }), false)
assert.equal(extractStripeSessionId(`https://meetmate.invalid/setup.html?session_id=${session}&purchase=weekly`), session)
assert.equal(extractStripeSessionId("https://meetmate.invalid/setup.html?premium=true"), "")
assert.equal(extractStripePurchaseMode(`https://meetmate.invalid/setup.html?session_id=${session}&purchase=weekly`), "weekly")
assert.equal(extractStripePurchaseMode(`https://meetmate.invalid/setup.html?session_id=${session}&purchase=one_time`), "one_time")
assert.equal(extractStripePurchaseMode("https://meetmate.invalid/setup.html"), "one_time")

assert.deepEqual(
    premiumState({ preview: true, paymentLinks: { one_time: "https://buy.stripe.com/test-one", weekly: "https://buy.stripe.com/test-weekly" } }),
    { paid: true, configured: false, configuredModes: [], preview: true, source: "local-preview" },
)
const configured = premiumState({ paymentLinks: { one_time: "https://buy.stripe.com/test-one", weekly: "https://buy.stripe.com/test-weekly" } })
assert.equal(configured.configured, true)
assert.deepEqual(configured.configuredModes, ["one_time", "weekly"])
assert.equal(premiumState({ entitlement: oneTime, paymentLinks: { one_time: "https://buy.stripe.com/test-one" }, now: 1_001 }).purchaseMode, "one_time")
assert.equal(premiumState({ entitlement: weekly, paymentLinks: { weekly: "https://buy.stripe.com/test-weekly" }, now: 1_001 }).purchaseMode, "weekly")
assert.equal(premiumState({ entitlement: oneTime, paymentLinks: { one_time: "https://buy.stripe.com/test-one" }, now: oneTime.expiresAt }).expired, true)

console.log("premium state checks passed")
