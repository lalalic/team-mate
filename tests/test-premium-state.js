import assert from "node:assert/strict"
import { createStripeEntitlement, extractStripeSessionId, isPaidEntitlement, premiumState } from "../src/premium-state.js"

const session = "cs_test_1234567890"
assert.equal(createStripeEntitlement("premium=true"), null)
assert.equal(createStripeEntitlement(""), null)
assert.equal(isPaidEntitlement(createStripeEntitlement(session, 123)), true)
assert.equal(isPaidEntitlement({ paid: true, source: "extensionpay", sessionId: session }), false)
assert.equal(extractStripeSessionId(`https://meetmate.invalid/setup.html?session_id=${session}&credit=999`), session)
assert.equal(extractStripeSessionId("https://meetmate.invalid/setup.html?premium=true"), "")
assert.deepEqual(premiumState({ preview: true, paymentLink: "https://buy.stripe.com/test" }), { paid: true, configured: false, preview: true, source: "local-preview" })
assert.equal(premiumState({ entitlement: createStripeEntitlement(session), paymentLink: "https://buy.stripe.com/test" }).source, "stripe")
console.log("premium state checks passed")
