// tests/test-conf-merge.js
//
// Regression tests for shared.js `initConf`: defaults must be a merge, never
// an allow-list. Stored keys that are not in defaults (deviceId, baseURL,
// relayModel, future settings) must survive.
//
// No network, no DOM. Run: `npm test`

import assert from "node:assert/strict"

const store = {}
const clone = (v) => JSON.parse(JSON.stringify(v))

globalThis.chrome = {
    storage: {
        local: {
            get(keys, cb) {
                const out = {}
                for (const k of keys) if (k in store) out[k] = clone(store[k])
                cb(out)
            },
            set(obj, cb) {
                Object.assign(store, clone(obj))
                if (cb) cb()
            },
        },
    },
}

const { initConf, storageKey } = await import("../src/shared.js")

let passed = 0
let failed = 0
const tests = []

function test(name, fn) {
    tests.push({ name, fn })
}

const defaults = () => ({
    author: "",
    apiKey: "",
    token: "",
    relayModel: "gpt-4.1",
    shortcuts: [{ label: "Reply", prompt: "reply" }],
})

test("fresh install seeds the defaults", async () => {
    const conf = defaults()
    await initConf(conf)
    assert.deepEqual(store[storageKey], defaults())
})

test("stored keys missing from defaults are preserved, not deleted", async () => {
    store[storageKey] = {
        deviceId: "dev-1",
        baseURL: "https://relay.example",
        relayModel: "gpt-5.4",
        someFutureSetting: { nested: true },
    }
    const conf = defaults()
    await initConf(conf)

    assert.equal(store[storageKey].deviceId, "dev-1")
    assert.equal(store[storageKey].baseURL, "https://relay.example")
    assert.equal(store[storageKey].someFutureSetting.nested, true)
    // stored value wins over the default
    assert.equal(store[storageKey].relayModel, "gpt-5.4")
    // missing defaults were added and persisted
    assert.equal(store[storageKey].author, "")
    assert.deepEqual(store[storageKey].shortcuts, defaults().shortcuts)
})

test("merged values are visible on the passed-in conf object", async () => {
    store[storageKey] = { deviceId: "dev-2", relayModel: "gpt-5.4" }
    const conf = defaults()
    await initConf(conf)
    assert.equal(conf.deviceId, "dev-2")
    assert.equal(conf.relayModel, "gpt-5.4")
    assert.equal(conf.author, "")
})

test("a second call is stable and still preserves stored-only keys", async () => {
    const conf = defaults()
    await initConf(conf)
    await initConf(conf)
    assert.equal(store[storageKey].deviceId, "dev-2")
    assert.equal(conf.deviceId, "dev-2")
})

for (const t of tests) {
    try {
        await t.fn()
        passed++
        console.log(`PASS  ${t.name}`)
    } catch (e) {
        failed++
        console.error(`FAIL  ${t.name}\n      ${e.message}`)
    }
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
