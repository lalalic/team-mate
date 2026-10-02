// Server-side contract tests for Stripe Checkout verification. No real secret
// or charge is used; Stripe API responses are deterministic fakes.
import assert from "node:assert/strict"
import { handleRequest, resolveEntitlement } from "../server/stripe-entitlement.js"

const now = 1_700_000_000_000
const future = new Date(now + 7 * 24 * 60 * 60 * 1000)
const testSecret = "sk_test_unit_only"

function stripeFetch({
    session = {},
    subscription = null,
    stripeProduct = null,
    sessionStatus = 200,
} = {}) {
    return async (url) => {
        const resource = new URL(url)
        if (resource.pathname.endsWith("/line_items")) throw new Error("unexpected expand encoding")
        if (resource.pathname.includes("/checkout/sessions/")) {
            if (sessionStatus !== 200) {
                return new Response(JSON.stringify({ error: { message: "No such checkout session" } }), { status: sessionStatus })
            }
            return new Response(JSON.stringify(session), { status: 200 })
        }
        if (resource.pathname.includes("/subscriptions/")) return new Response(JSON.stringify(subscription), { status: 200 })
        if (resource.pathname.includes("/products/")) return new Response(JSON.stringify(stripeProduct), { status: 200 })
        throw new Error(`unexpected Stripe resource: ${resource.pathname}`)
    }
}

const oneTime = {
    id: "cs_test_one",
    object: "checkout.session",
    livemode: false,
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    metadata: { product: "team-mate", plan: "one_time" },
    line_items: { data: [{ price: { metadata: { product: "team-mate", plan: "one_time" } } }] },
}

const activeWeekly = {
    id: "cs_test_week",
    object: "checkout.session",
    livemode: false,
    mode: "subscription",
    status: "complete",
    payment_status: "paid",
    subscription: "sub_test",
    metadata: { product: "team-mate", plan: "weekly" },
    line_items: { data: [{ price: { metadata: { product: "team-mate", plan: "weekly" } } }] },
}

assert.deepEqual(await resolveEntitlement("cs_test_one", "team-mate", "one_time", testSecret, stripeFetch({ session: oneTime }), now), {
    active: true,
    product: "team-mate",
    plan: "one_time",
    status: "paid",
    currentPeriodEnd: null,
})

const weekly = await resolveEntitlement("cs_test_week", "team-mate", "weekly", testSecret, stripeFetch({
    session: activeWeekly,
    subscription: { status: "active", current_period_end: Math.floor(future.getTime() / 1000), metadata: {}, items: { data: [{ price: { metadata: { product: "team-mate", plan: "weekly" } } }] } },
}), now)
assert.equal(weekly.active, true)
assert.equal(weekly.product, "team-mate")
assert.equal(weekly.plan, "weekly")

assert.equal((await resolveEntitlement("cs_test_week", "team-mate", "weekly", testSecret, stripeFetch({
    session: activeWeekly,
    subscription: { status: "canceled", current_period_end: Math.floor(future.getTime() / 1000), metadata: {}, items: { data: [{ price: { metadata: { product: "team-mate", plan: "weekly" } } }] } },
}), now)).active, false)

const intervalWeekly = await resolveEntitlement("cs_test_week", "team-mate", "weekly", testSecret, stripeFetch({
    session: activeWeekly,
    subscription: { status: "active", current_period_end: Math.floor(future.getTime() / 1000), metadata: {}, items: { data: [{ price: { metadata: { product: "team-mate" }, recurring: { interval: "week" } } }] } },
}), now)
assert.equal(intervalWeekly.active, true)
assert.equal(intervalWeekly.plan, "weekly")

assert.equal((await resolveEntitlement("cs_test_one", "team-mate", "weekly", testSecret, stripeFetch({ session: oneTime }), now)).status, "purchase_mode_mismatch")
assert.equal((await resolveEntitlement("cs_test_week", "family-tutor", "weekly", testSecret, stripeFetch({ session: activeWeekly }), now)).status, "product_mismatch")
assert.equal((await resolveEntitlement("cs_test_live", "team-mate", "one_time", testSecret, stripeFetch({ session: { ...oneTime, id: "cs_test_live", livemode: true } }), now)).status, "livemode_mismatch")

async function request(search) {
    return handleRequest(new Request(`https://payments.invalid/v1/entitlement?${search}`), { STRIPE_SECRET_KEY: testSecret }, stripeFetch({ sessionStatus: 404 }), now)
}

assert.deepEqual(await (await request("session_id=cs_test_arbitrary&product=team-mate&purchase_mode=one_time")).json(), {
    active: false, product: "team-mate", plan: null, status: "not_found", currentPeriodEnd: null,
})
assert.equal((await request("session_id=bad&product=team-mate&purchase_mode=one_time")).status, 400)
assert.equal((await request("session_id=cs_test_arbitrary&product=team-mate")).status, 400)
assert.equal((await handleRequest(new Request("https://payments.invalid/other"), { STRIPE_SECRET_KEY: testSecret })).status, 404)
assert.equal((await handleRequest(new Request("https://payments.invalid/v1/entitlement?session_id=cs_test_arbitrary&product=team-mate&purchase_mode=one_time"), {})).status, 503)

console.log("stripe entitlement server checks passed")
