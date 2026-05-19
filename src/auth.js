// teams-live-caption-ai/src/auth.js
//
// Device-bootstrap flow against copilot-relay v4.
// On first use the extension generates a stable deviceId, then exchanges
// it for a long-lived bearer via POST /llm/v1/register. The bearer is
// stored in conf.apiKey and used as Authorization: Bearer <…> on every
// subsequent /llm/v1/chat/completions call (see relay.js).
//
// See docs/agent-design-v4.md §8 for the design.

import { getConf, changeConf } from "./shared.js"

// Default relay base URL (overridable per-install via conf.baseURL).
export const RELAY_BASE_URL = "https://relay.ai.qili2.com/llm/v1"

// Shared bootstrap token. Must match the relay's RELAY_BOOTSTRAP_TOKEN
// env. Same value used by Neo iOS builds (Info.plist `RelayBootstrapToken`).
export const BOOTSTRAP_TOKEN = "f2f9f760695f1c569f9263b8cf4ee3824d51155e79d8b1c63da6658285e20244"

/**
 * Get (or generate + persist) a stable per-install device ID.
 * Stored at conf.deviceId. Regenerated only on
 * uninstall / clear-storage / `clearAuth`.
 */
export async function getDeviceId() {
    const conf = await getConf()
    if (conf?.deviceId) return conf.deviceId
    const deviceId = "tm_" + crypto.randomUUID()
    await changeConf({ deviceId })
    return deviceId
}

/**
 * POST /llm/v1/register — bootstrap a device, receive a relay bearer.
 * Idempotent: re-registering the same deviceId returns the existing
 * bearer. Stores the result at conf.apiKey.
 *
 * Returns the bearer string. Throws on failure.
 */
export async function registerDevice() {
    const conf = await getConf()
    const baseURL = (conf?.baseURL || RELAY_BASE_URL).replace(/\/$/, "")
    const deviceId = await getDeviceId()
    const version = (() => {
        try { return chrome.runtime.getManifest().version }
        catch { return "unknown" }
    })()
    const res = await fetch(`${baseURL}/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            bootstrap: BOOTSTRAP_TOKEN,
            deviceId,
            platform: "chrome-extension",
            version,
            name: "team-mate",
        }),
    })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(`register failed (${res.status}): ${text}`)
    }
    const { bearer } = await res.json()
    await changeConf({ apiKey: bearer })
    return bearer
}

/**
 * Ensure we have a valid bearer. If conf.apiKey already exists, just
 * return it. Otherwise register and store one.
 *
 * Use this before every /chat/completions call.
 */
export async function ensureBearer() {
    const conf = await getConf()
    if (conf?.apiKey) return conf.apiKey
    return await registerDevice()
}

/**
 * Clear the locally cached bearer (does NOT revoke server-side).
 * Useful for debugging or after a 401 from the relay.
 */
export async function clearAuth() {
    await changeConf({ apiKey: "" })
}
