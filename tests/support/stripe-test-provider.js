// Provider-faithful Stripe Test Mode fixture. Test scripts import this module
// only; webpack never includes it in an extension bundle and it stores no
// Stripe secret.
export function createStripeTestProvider({ now = Date.now() } = {}) {
    const resources = new Map()
    let clock = Number(now) || Date.now()

    function key(resource, id) {
        return resource + ":" + String(id || "")
    }

    function put(resource, id, value) {
        resources.set(key(resource, id), value)
        return value
    }

    function product(appid, plan) {
        return {
            id: "prod_" + appid + "_" + plan,
            livemode: false,
            metadata: { product: appid, plan },
        }
    }

    function price(type, appid, plan, amount = 199, currency = "usd") {
        return {
            id: "price_" + type + "_" + Math.random().toString(36).slice(2),
            livemode: false,
            type,
            unit_amount: amount,
            currency,
            metadata: { product: appid, plan },
            ...(type === "recurring" ? { recurring: { interval: "week" } } : {}),
        }
    }

    function createOneTimeCheckout({ appid = "team-mate", plan = "one_time" } = {}) {
        const sessionPrice = price("one_time", appid, plan)
        const sessionProduct = product(appid, plan)
        const sessionId = "cs_test_one_" + Math.random().toString(36).slice(2)
        const session = {
            id: sessionId,
            object: "checkout.session",
            livemode: false,
            mode: "payment",
            status: "complete",
            payment_status: "paid",
            metadata: { product: appid, plan },
            line_items: { data: [{ price: sessionPrice }] },
        }
        put("sessions", sessionId, session)
        put("prices", sessionPrice.id, sessionPrice)
        put("products", sessionProduct.id, sessionProduct)
        return session
    }

    function createWeeklyCheckout({ appid = "team-mate", plan = "weekly", status = "active" } = {}) {
        const sessionPrice = price("recurring", appid, plan)
        const sessionProduct = product(appid, plan)
        const subscriptionId = "sub_test_" + Math.random().toString(36).slice(2)
        const sessionId = "cs_test_week_" + Math.random().toString(36).slice(2)
        const subscription = {
            id: subscriptionId,
            object: "subscription",
            livemode: false,
            status,
            current_period_end: Math.floor((clock + 7 * 24 * 60 * 60 * 1000) / 1000),
            metadata: { product: appid, plan },
            items: { data: [{ price: sessionPrice }] },
        }
        const session = {
            id: sessionId,
            object: "checkout.session",
            livemode: false,
            mode: "subscription",
            status: "complete",
            payment_status: "paid",
            subscription: subscriptionId,
            metadata: { product: appid, plan },
            line_items: { data: [{ price: sessionPrice }] },
        }
        put("sessions", sessionId, session)
        put("subscriptions", subscriptionId, subscription)
        put("prices", sessionPrice.id, sessionPrice)
        put("products", sessionProduct.id, sessionProduct)
        return { session, subscription }
    }

    function identity(resource) {
        const resourcePrice = resource?.line_items?.data?.[0]?.price || resource?.items?.data?.[0]?.price
        return {
            product: resource?.metadata?.product || resourcePrice?.metadata?.product ||
                resource?.metadata?.appid || resourcePrice?.metadata?.appid,
            plan: resource?.metadata?.plan || resourcePrice?.metadata?.plan || resourcePrice?.recurring?.interval,
        }
    }

    function response(body, status = 200) {
        return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
    }

    function entitlement(sessionId, requestedMode) {
        const session = resources.get(key("sessions", sessionId))
        const expectedProduct = "team-mate"
        if (!session) return response({ active: false, product: expectedProduct, plan: null, status: "not_found", currentPeriodEnd: null })

        const actualMode = session.mode === "subscription" ? "weekly" : "one_time"
        if (actualMode !== requestedMode) {
            return response({ active: false, product: expectedProduct, plan: identity(session).plan, status: "purchase_mode_mismatch", currentPeriodEnd: null })
        }

        const checkoutIdentity = identity(session)
        if (checkoutIdentity.product !== expectedProduct) {
            return response({ active: false, product: expectedProduct, plan: checkoutIdentity.plan, status: "product_mismatch", currentPeriodEnd: null })
        }

        if (session.mode === "payment") {
            const paid = session.status === "complete" && session.payment_status === "paid"
            return response({
                active: paid,
                product: expectedProduct,
                plan: checkoutIdentity.plan,
                status: paid ? "paid" : session.payment_status || session.status,
                currentPeriodEnd: null,
            })
        }

        const subscription = resources.get(key("subscriptions", session.subscription))
        if (!subscription) return response({ active: false, product: expectedProduct, plan: checkoutIdentity.plan, status: "not_found", currentPeriodEnd: null })

        const subscriptionIdentity = identity(subscription)
        const periodEnd = subscription.current_period_end * 1000
        const active = ["active", "trialing"].includes(subscription.status) &&
            subscriptionIdentity.product === expectedProduct &&
            periodEnd > clock
        return response({
            active,
            product: expectedProduct,
            plan: subscriptionIdentity.plan,
            status: subscription.status,
            currentPeriodEnd: new Date(periodEnd).toISOString(),
        })
    }

    return {
        now: () => clock,
        setNow(value) {
            clock = Number(value) || clock
        },
        resources,
        createOneTimeCheckout,
        createWeeklyCheckout,
        setSubscriptionStatus(session, status, currentPeriodEnd = clock) {
            const subscription = resources.get(key("subscriptions", session.subscription))
            if (!subscription) throw new Error("unknown subscription")
            subscription.status = status
            subscription.current_period_end = Math.floor(currentPeriodEnd / 1000)
        },
        fetch: async (url) => {
            const request = new URL(url)
            if (request.pathname !== "/v1/entitlement") return response({ error: "not_found" }, 404)
            const sessionId = String(request.searchParams.get("session_id") || "")
            if (!/^cs_(?:test|live)_[A-Za-z0-9_-]+$/.test(sessionId)) return response({ error: "invalid_session_id" }, 400)
            const requestedMode = request.searchParams.get("purchase_mode")
            if (requestedMode !== "one_time" && requestedMode !== "weekly") return response({ error: "invalid_purchase_mode" }, 400)
            return entitlement(sessionId, requestedMode)
        },
    }
}
