// Stateless server-side payment verification. This module is the contract for
// the entitlement endpoint configured at build time; it uses Stripe's API but
// never exposes its secret to the browser extension.

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"])
const SESSION_RE = /^cs_(?:test|live)_[A-Za-z0-9_-]+$/
const PRODUCT_RE = /^[a-z0-9][a-z0-9-]{1,63}$/
const MODES = new Set(["one_time", "weekly"])

function inactive(product, plan, status) {
    return { active: false, product, plan, status, currentPeriodEnd: null }
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            "access-control-allow-origin": "*",
        },
    })
}

function identity(...candidates) {
    for (const metadata of candidates) {
        const product = String(metadata?.product || metadata?.appid || "").trim()
        const plan = String(metadata?.plan || "").trim()
        if (product || plan) return { product, plan }
    }
    return { product: "", plan: "" }
}

function modeMatchesLiveKey(secret, livemode) {
    const key = String(secret || "")
    if (/^(?:sk|rk)_test_/.test(key)) return livemode === false
    if (/^(?:sk|rk)_live_/.test(key)) return livemode === true
    return true
}

async function stripeGet(path, secret, fetchImpl) {
    const response = await fetchImpl(`https://api.stripe.com/v1/${path}`, {
        headers: { authorization: `Bearer ${secret}` },
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
        const error = new Error(body?.error?.message || `Stripe request failed (${response.status})`)
        error.status = response.status
        throw error
    }
    return body
}

async function productMetadata(price, secret, fetchImpl) {
    const productId = typeof price?.product === "string" ? price.product : price?.product?.id
    if (!productId) return {}
    try {
        const stripeProduct = await stripeGet(`products/${encodeURIComponent(productId)}`, secret, fetchImpl)
        return {
            product: String(stripeProduct?.metadata?.product || stripeProduct?.metadata?.appid || ""),
            plan: String(stripeProduct?.metadata?.plan || ""),
        }
    } catch (_) {
        return {}
    }
}

export async function resolveEntitlement(sessionId, product, expectedMode, secret, fetchImpl = fetch, now = Date.now()) {
    const checkout = await stripeGet(
        `checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=line_items`,
        secret,
        fetchImpl,
    )
    if (!modeMatchesLiveKey(secret, checkout.livemode)) return inactive(product, null, "livemode_mismatch")
    if (checkout.status !== "complete") return inactive(product, null, "checkout_incomplete")

    const price = checkout.line_items?.data?.[0]?.price
    const checkoutIdentity = identity(checkout.metadata, price?.metadata)
    const resolvedProduct = checkoutIdentity.product ||
        (await productMetadata(price, secret, fetchImpl)).product
    if (resolvedProduct !== product) return inactive(product, checkoutIdentity.plan, "product_mismatch")

    if (expectedMode === "one_time") {
        if (checkout.mode !== "payment") return inactive(product, checkoutIdentity.plan, "purchase_mode_mismatch")
        const paid = checkout.payment_status === "paid"
        return {
            active: paid,
            product,
            plan: checkoutIdentity.plan || "one_time",
            status: paid ? "paid" : checkout.payment_status || "unpaid",
            currentPeriodEnd: null,
        }
    }

    const subscriptionId = typeof checkout.subscription === "string" ? checkout.subscription : checkout.subscription?.id
    if (checkout.mode !== "subscription" || !subscriptionId) return inactive(product, checkoutIdentity.plan, "purchase_mode_mismatch")

    const subscription = await stripeGet(`subscriptions/${encodeURIComponent(subscriptionId)}`, secret, fetchImpl)
    const subscriptionPrice = subscription.items?.data?.[0]?.price
    const subscriptionIdentity = identity(
        subscription.metadata,
        checkout.metadata,
        subscriptionPrice?.metadata,
    )
    const subscriptionProduct = subscriptionIdentity.product ||
        (await productMetadata(subscriptionPrice, secret, fetchImpl)).product
    if (subscriptionProduct !== product) return inactive(product, subscriptionIdentity.plan, "product_mismatch")
    const interval = String(subscriptionPrice?.recurring?.interval || "").trim().toLowerCase()
    if ((interval && interval !== "week") || (subscriptionIdentity.plan && subscriptionIdentity.plan !== "weekly")) {
        return inactive(product, subscriptionIdentity.plan, "purchase_mode_mismatch")
    }

    const periodSeconds = Number(subscription.current_period_end)
    const currentPeriodEnd = Number.isFinite(periodSeconds) && periodSeconds > 0
        ? new Date(periodSeconds * 1000).toISOString()
        : null
    const active = ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status) &&
        (!currentPeriodEnd || Date.parse(currentPeriodEnd) > now)
    return {
        active,
        product,
        plan: "weekly",
        status: subscription.status,
        currentPeriodEnd,
    }
}

export async function handleRequest(request, env, fetchImpl = fetch, now = Date.now()) {
    const url = new URL(request.url)
    if (request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "access-control-allow-origin": "*",
                "access-control-allow-methods": "GET, OPTIONS",
                "access-control-allow-headers": "content-type",
            },
        })
    }
    if (request.method !== "GET" || url.pathname !== "/v1/entitlement") return jsonResponse({ error: "not_found" }, 404)

    const sessionId = String(url.searchParams.get("session_id") || "").trim()
    const product = String(url.searchParams.get("product") || "").trim().toLowerCase()
    const expectedMode = String(url.searchParams.get("purchase_mode") || "").trim().toLowerCase()
    if (!SESSION_RE.test(sessionId)) return jsonResponse({ error: "invalid_session_id" }, 400)
    if (!PRODUCT_RE.test(product)) return jsonResponse({ error: "invalid_product" }, 400)
    if (!MODES.has(expectedMode)) return jsonResponse({ error: "invalid_purchase_mode" }, 400)
    if (!env?.STRIPE_SECRET_KEY) return jsonResponse({ error: "stripe_not_configured" }, 503)

    try {
        return jsonResponse(await resolveEntitlement(sessionId, product, expectedMode, env.STRIPE_SECRET_KEY, fetchImpl, now))
    } catch (error) {
        if (error?.status === 404) return jsonResponse(inactive(product, null, "not_found"))
        if (error?.status === 401) return jsonResponse({ error: "stripe_auth_failed" }, 502)
        if (error?.status === 403) return jsonResponse({ error: "stripe_forbidden" }, 502)
        return jsonResponse({ error: "stripe_unavailable" }, 502)
    }
}

export default { fetch: (request, env) => handleRequest(request, env) }
