import { existsSync, readFileSync } from "node:fs"

const bundle = "extension/background.js"
if (!existsSync(bundle)) throw new Error(`Missing ${bundle}; run the production build first.`)

const source = readFileSync(bundle, "utf8")
const expectOneTime = process.env.EXPECT_STRIPE_ONE_TIME_CONFIGURED === "1"
const expectWeekly = process.env.EXPECT_STRIPE_WEEKLY_CONFIGURED === "1"
const stripeLinks = source.match(/https:\/\/buy\.stripe\.com\/[A-Za-z0-9_?&=.-]+/g) || []
const expectedLinkCount = Number(expectOneTime) + Number(expectWeekly)

if (stripeLinks.length < expectedLinkCount) {
    throw new Error(`Configured build contains ${stripeLinks.length} Stripe Payment Link(s), expected at least ${expectedLinkCount}.`)
}
if (expectedLinkCount === 0 && stripeLinks.length !== 0) {
    throw new Error("Unconfigured build unexpectedly contains a Stripe Payment Link.")
}
if (expectedLinkCount === 0 && !source.includes("Payment Link is not configured in this build")) {
    throw new Error("Unconfigured build does not contain the explicit safe configuration message.")
}
if (/sk_(?:test|live)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+/.test(source)) {
    throw new Error("Stripe secret material was found in the extension bundle.")
}
for (const forbiddenMarker of ["createStripeTestProvider", "tests/support/stripe-test-provider", "server/stripe-entitlement"]) {
    if (source.includes(forbiddenMarker)) {
        throw new Error(`Test/server-only payment code leaked into the extension bundle (${forbiddenMarker}).`)
    }
}

console.log(`Release bundle check passed (one-time=${expectOneTime ? "configured" : "unconfigured"}, weekly=${expectWeekly ? "configured" : "unconfigured"}; no Stripe secrets).`)
