import assert from "node:assert/strict"
import http from "node:http"

import {
    createVerifiedStripeEntitlement,
    ONE_TIME_DURATION_MS,
    verifyStripeEntitlementSource,
    verifyStripeEntitlement,
} from "../src/premium-state.js"
import { createPremiumEntitlementService } from "../src/premium-runtime.js"

const now = 1_000
const sessionId = "cs_test_1592748293647"
const expectedQuery = `session_id=${sessionId}&product=team-mate`
const responses = []
const requests = []

function respondOnce(response) {
    responses.push(response)
}

const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://payment-service.invalid")
    const query = url.search.slice(1)
    if (url.pathname !== "/v1/entitlement" || !query.startsWith(expectedQuery) || !["one_time", "weekly"].includes(url.searchParams.get("purchase_mode"))) {
        response.writeHead(404, { "content-type": "application/json" })
        response.end(JSON.stringify({ active: false, status: "not_found" }))
        return
    }
    requests.push(url.searchParams.toString())
    const remote = responses.shift()
    response.writeHead(remote.httpStatus || 200, { "content-type": "application/json", "cache-control": "no-store" })
    response.end(JSON.stringify(remote.body || remote))
})

await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
const endpoint = `http://127.0.0.1:${server.address().port}`
const clock = { now }
const storage = new Map()
const service = createPremiumEntitlementService({
    getLocal: async keys => Object.fromEntries(keys.map(key => [key, storage.get(key)])),
    setLocal: async value => { for (const [key, value_] of Object.entries(value)) storage.set(key, value_) },
    paymentLinks: { one_time: "https://buy.stripe.com/test-one", weekly: "https://buy.stripe.com/test-weekly" },
    endpoint,
    product: "team-mate",
    fetchImpl: fetch,
    now: () => clock.now,
})

try {
    const completedOneTime = {
        active: true,
        product: "team-mate",
        plan: "one_time",
        status: "paid",
        currentPeriodEnd: null,
    }
    const oneTime = createVerifiedStripeEntitlement(sessionId, completedOneTime, "one_time", now)
    assert.equal(oneTime.paid, true)
    assert.equal(oneTime.purchaseMode, "one_time")
    assert.equal(oneTime.expiresAt, now + ONE_TIME_DURATION_MS)

    assert.throws(
        () => verifyStripeEntitlement({ ...completedOneTime, product: "other-product" }, "one_time"),
        /different product/,
    )
    assert.throws(
        () => verifyStripeEntitlement({ ...completedOneTime, plan: "weekly" }, "one_time"),
        /purchase mode/,
    )
    assert.throws(
        () => verifyStripeEntitlement({ ...completedOneTime, active: false }, "one_time"),
        /not active/,
    )

    respondOnce(completedOneTime)
    const activated = await service.activateStripeSession(sessionId, "one_time")
    assert.equal(activated.paid, true)
    assert.equal(activated.purchaseMode, "one_time")
    assert.equal(activated.expiresAt, now + ONE_TIME_DURATION_MS)
    clock.now = activated.expiresAt
    const expiredOneTime = await service.premiumStatus()
    assert.equal(expiredOneTime.paid, false)
    assert.equal(expiredOneTime.expired, true)

    clock.now = activated.expiresAt + 1
    respondOnce({ active: true, product: "team-mate", plan: "weekly", status: "active", currentPeriodEnd: new Date(clock.now + ONE_TIME_DURATION_MS).toISOString() })
    const weekly = await service.activateStripeSession(sessionId, "weekly")
    assert.equal(weekly.paid, true)
    assert.equal(weekly.recurring, true)

    clock.now = weekly.expiresAt + 1
    respondOnce({ active: true, product: "team-mate", plan: "weekly", status: "active", currentPeriodEnd: new Date(clock.now + ONE_TIME_DURATION_MS).toISOString() })
    const renewed = await service.premiumStatus({ force: true })
    assert.equal(renewed.paid, true)
    assert.equal(renewed.expiresAt, clock.now + ONE_TIME_DURATION_MS)

    clock.now = renewed.expiresAt
    respondOnce({ active: false, product: "team-mate", plan: "weekly", status: "canceled", currentPeriodEnd: null })
    const canceled = await service.premiumStatus({ force: true })
    assert.equal(canceled.paid, false)
    assert.equal(canceled.source, "stripe")
    assert.equal(storage.get("premiumEntitlement").stripeStatus, "canceled")

    const canceledRemote = { active: false, product: "team-mate", plan: "weekly", status: "canceled", currentPeriodEnd: null }
    assert.throws(() => verifyStripeEntitlement(canceledRemote, "weekly"), /not active/)
    assert.throws(
        () => verifyStripeEntitlementSource({ ...canceledRemote, product: "other-product" }, "weekly"),
        /different product/,
    )
    assert.throws(
        () => verifyStripeEntitlementSource({ ...canceledRemote, plan: "one_time" }, "weekly"),
        /purchase mode/,
    )

    assert.equal(requests.length, 4)
    for (const request of requests) assert.ok(request.startsWith(expectedQuery))
} finally {
    server.close()
}

console.log("payment entitlement verification E2E checks passed")
