// src/background.js
//
// Service worker. Owns badge/icon state, VTT export, and direct provider HTTP.
// There is no MeetMate AI relay/account server. Provider calls are proxied here
// to avoid content-script CORS; lightweight Premium entitlement uses ExtensionPay.

const { initConf, getConf } = require("./util");
const { DEFAULT_SHORTCUTS } = require("./focused");

const ExtPay = require("extpay");
const EXTPAY_EXTENSION_ID = typeof __EXTPAY_EXTENSION_ID__ !== "undefined" ? String(__EXTPAY_EXTENSION_ID__ || "").trim() : "";
const PREMIUM_CACHE_MS = 7 * 24 * 60 * 60 * 1000;

if (EXTPAY_EXTENSION_ID) {
    try { ExtPay(EXTPAY_EXTENSION_ID).startBackground(); }
    catch (e) { console.warn("[meetmate] ExtensionPay background init failed", e); }
}

function getLocal(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function setLocal(value) {
    return new Promise((resolve) => chrome.storage.local.set(value, resolve));
}

async function premiumStatus({ force = false } = {}) {
    const stored = await getLocal(["premiumCache", "premiumDevOverride"]);
    const preview = !EXTPAY_EXTENSION_ID && stored.premiumDevOverride === true;
    if (preview) {
        return { paid: true, configured: false, preview: true, source: "local-preview" };
    }

    const cache = stored.premiumCache || {};
    const age = Date.now() - Number(cache.checkedAt || 0);
    if (!force && cache.paid === true && age >= 0 && age < PREMIUM_CACHE_MS) {
        return { paid: true, configured: !!EXTPAY_EXTENSION_ID, preview: false, cached: true, source: "cache" };
    }

    if (!EXTPAY_EXTENSION_ID) {
        return { paid: false, configured: false, preview: false, source: "unconfigured" };
    }

    try {
        // MV3 service workers may be restarted, so recreate ExtPay in callbacks.
        const user = await ExtPay(EXTPAY_EXTENSION_ID).getUser();
        const next = { paid: user?.paid === true, checkedAt: Date.now() };
        await setLocal({ premiumCache: next });
        return {
            paid: next.paid,
            configured: true,
            preview: false,
            cached: false,
            source: "extensionpay",
            paidAt: user?.paidAt || null,
        };
    } catch (error) {
        if (cache.paid === true) {
            return { paid: true, configured: true, preview: false, cached: true, stale: true, source: "cache", error: error?.message || String(error) };
        }
        return { paid: false, configured: true, preview: false, source: "extensionpay-error", error: error?.message || String(error) };
    }
}

async function openPremiumPayment() {
    if (!EXTPAY_EXTENSION_ID) throw new Error("ExtensionPay is not configured in this build. Enable Premium Preview in Settings for local testing.");
    await ExtPay(EXTPAY_EXTENSION_ID).openPaymentPage();
    return { opened: true };
}

async function openPremiumLogin() {
    if (!EXTPAY_EXTENSION_ID) throw new Error("ExtensionPay is not configured in this build.");
    await ExtPay(EXTPAY_EXTENSION_ID).openLoginPage();
    return { opened: true };
}

async function setPremiumPreview(enabled) {
    if (EXTPAY_EXTENSION_ID) throw new Error("Premium Preview is only available in builds without an ExtensionPay id.");
    await setLocal({ premiumDevOverride: enabled === true });
    return { paid: enabled === true, configured: false, preview: enabled === true };
}

initConf({
    author: "",
    apiKey: "",
    baseURL: "https://openrouter.ai/api/v1",
    modelName: "openrouter/auto",
    preferredLanguage: "browser",
    customInstructions: "",
    premiumStructuredReport: false,
    shortcuts: DEFAULT_SHORTCUTS,
    rephrasePrompt: chrome.i18n.getMessage("rephrasePrompt"),
}).then(async () => {
    const conf = (await getConf()) || {}
    let next = { ...conf }
    let changed = false

    if (!conf.languagePreferenceV2) {
        next.preferredLanguage = conf.preferredLanguage === "auto" ? "browser" : (conf.preferredLanguage || "browser")
        next.languagePreferenceV2 = true
        changed = true
    }

    if (!conf.shortcutLibraryV2) {
        const current = Array.isArray(conf.shortcuts) ? conf.shortcuts : []
        const labels = current.map(s => String(s?.label || ""))
        const looksLikeOldDefaults = [
            ["Reply", "Facts", "Question", "Challenge"],
            ["Reply", "Facts", "Question"],
        ].some(expected => expected.length === labels.length && expected.every((label, i) => label === labels[i]))

        next.shortcuts = looksLikeOldDefaults
            ? DEFAULT_SHORTCUTS.map(s => ({ ...s }))
            : current.map(s => ({ label: s?.label, prompt: s?.prompt, show: s?.show !== false }))
        next.shortcutLibraryV2 = true
        changed = true
    }

    if (changed) chrome.storage.local.set({ conf: next })
})

function sanitizeFileName(name) {
    const invalidChars = /[\/\\:*?"<>|]/g;
    name = name.replace(invalidChars, '_');
    if (name.length > 255) name = name.substring(0, 255);
    return name;
}

function save({ transcripts, premiumReport = "", name }) {
    const safeName = sanitizeFileName(name || "Meeting")
    const stamp = new Date().toISOString().split("T")[0].replace(/-/g, "")
    const base = `${safeName}/${stamp}`

    if (transcripts?.length) {
        const parts = []
        for (let i = 0; i < transcripts.length; i++) {
            const entry = transcripts[i]
            const nextTime = transcripts[i + 1]?.Time || entry.Time
            parts.push(`${entry.Time} --> ${nextTime}\n${entry.Name}: ${entry.Text}\n`)
        }
        const content = `WEBVTT\n\n` + parts.join('\n')
        chrome.downloads.download({
            url: "data:text/vtt;charset=utf-8," + encodeURIComponent(content),
            filename: `${base}.vtt`,
        })
    }

    const report = String(premiumReport || "").trim()
    if (report) {
        const markdown = `# ${safeName} · MeetMate Report\n\n${report}\n`
        chrome.downloads.download({
            url: "data:text/markdown;charset=utf-8," + encodeURIComponent(markdown),
            filename: `${base}-report.md`,
        })
    }
}

function providerHeaders(apiKey, includeJson = false) {
    const headers = {}
    if (includeJson) headers["content-type"] = "application/json"
    if (apiKey) headers.authorization = `Bearer ${apiKey}`
    return headers
}

async function directListModels(request = {}) {
    const conf = (await getConf()) || {}
    const baseURL = String(request.baseURL || conf.baseURL || "https://openrouter.ai/api/v1").replace(/\/$/, "")
    const apiKey = String(request.apiKey || conf.apiKey || "").trim()

    const res = await fetch(`${baseURL}/models`, {
        headers: providerHeaders(apiKey),
    })
    if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(`models failed (${res.status}): ${text || res.statusText}`)
    }

    const json = await res.json()
    const items = Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : [])
    return items
        .map(item => {
            if (typeof item === "string") return { id: item, name: item }
            const id = String(item?.id || "").trim()
            if (!id) return null
            return {
                id,
                name: String(item?.name || id),
                context_length: Number(item?.context_length) || undefined,
            }
        })
        .filter(Boolean)
}

async function directChatCompletion(request = {}) {
    const conf = (await getConf()) || {}
    const baseURL = String(request.baseURL || conf.baseURL || "https://openrouter.ai/api/v1").replace(/\/$/, "")
    const apiKey = String(request.apiKey || conf.apiKey || "").trim()
    const model = request.model || conf.modelName || conf.relayModel || "openrouter/auto"

    const body = { model, messages: request.messages || [] }
    if (request.tools) body.tools = request.tools
    if (request.tool_choice) body.tool_choice = request.tool_choice
    if (request.temperature != null) body.temperature = request.temperature

    const res = await fetch(`${baseURL}/chat/completions`, {
        method: "POST",
        headers: providerHeaders(apiKey, true),
        body: JSON.stringify(body),
    })

    if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(`chat/completions failed (${res.status}): ${text || res.statusText}`)
    }
    return res.json()
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.message) {
        case 'update_transcripts':
            chrome.action.setBadgeText({ text: (request.count || "") + "" })
            return
        case 'start_capture': {
            const iconPath = "icon-enable.png"
            chrome.action.setIcon({ path: { "16": iconPath, "48": iconPath, "128": iconPath } })
            chrome.action.setBadgeText({ text: "" })
            return
        }
        case 'stop_capture': {
            save(request)
            const iconPath = "icon.png"
            chrome.action.setIcon({ path: { "16": iconPath, "48": iconPath, "128": iconPath } })
            chrome.action.setBadgeText({ text: "" })
            return
        }
        case 'llm_list_models':
            directListModels(request.request)
                .then(data => sendResponse({ ok: true, data }))
                .catch(err => sendResponse({ ok: false, error: err?.message || String(err) }))
            return true
        case 'llm_chat_completion':
            directChatCompletion(request.request)
                .then(data => sendResponse({ ok: true, data }))
                .catch(err => sendResponse({ ok: false, error: err?.message || String(err) }))
            return true
        case 'premium_status':
            premiumStatus({ force: request.force === true })
                .then(data => sendResponse({ ok: true, data }))
                .catch(err => sendResponse({ ok: false, error: err?.message || String(err) }))
            return true
        case 'premium_upgrade':
            openPremiumPayment()
                .then(data => sendResponse({ ok: true, data }))
                .catch(err => sendResponse({ ok: false, error: err?.message || String(err) }))
            return true
        case 'premium_login':
            openPremiumLogin()
                .then(data => sendResponse({ ok: true, data }))
                .catch(err => sendResponse({ ok: false, error: err?.message || String(err) }))
            return true
        case 'premium_preview':
            setPremiumPreview(request.enabled)
                .then(data => sendResponse({ ok: true, data }))
                .catch(err => sendResponse({ ok: false, error: err?.message || String(err) }))
            return true
        default:
            return
    }
})
