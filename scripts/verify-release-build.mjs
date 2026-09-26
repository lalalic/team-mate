import { readFileSync, existsSync } from "node:fs"

const bundle = "extension/background.js"
if (!existsSync(bundle)) throw new Error(`Missing ${bundle}; run the production build first.`)
const source = readFileSync(bundle, "utf8")
const configured = process.env.EXPECT_STRIPE_CONFIGURED === "1"
const marker = "Stripe Payment Link is not configured"
if (configured && !source.includes("https://buy.stripe.com/")) {
    throw new Error("Configured build does not contain a Stripe Payment Link.")
}
if (!configured && !source.includes(marker)) {
    throw new Error("Unconfigured build does not contain the explicit safe configuration message.")
}
if (/sk_(?:test|live)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+/.test(source)) {
    throw new Error("Stripe secret material was found in the extension bundle.")
}
console.log(`Release bundle check passed (${configured ? "configured" : "unconfigured"} Stripe path; no Stripe secrets).`)
