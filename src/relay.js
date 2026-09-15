// Direct OpenAI-compatible client for MeetMate.
//
// There is deliberately no relay account, wallet, Stripe flow, device
// registration, or autonomous session. Every request is an explicit user Ask.
// Network I/O is delegated to the extension service worker so provider CORS
// policies do not leak into the Teams content script.

import { getConf } from "./shared.js"

export const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
export const DEFAULT_MODEL = "openrouter/auto"

function runtimeRequest(message, payload = {}) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ message, ...payload }, response => {
            const runtimeError = chrome.runtime.lastError
            if (runtimeError) {
                reject(new Error(runtimeError.message))
                return
            }
            if (!response) {
                reject(new Error("No response from MeetMate background service"))
                return
            }
            if (!response.ok) {
                reject(new Error(response.error || "LLM request failed"))
                return
            }
            resolve(response.data)
        })
    })
}

function currentProviderConfig(conf = {}) {
    return {
        baseURL: String(conf.baseURL || DEFAULT_BASE_URL).replace(/\/$/, ""),
        apiKey: String(conf.apiKey || "").trim(),
    }
}

export async function fetchModels() {
    const conf = (await getConf()) || {}
    return runtimeRequest("llm_list_models", {
        request: currentProviderConfig(conf),
    })
}

export async function chatCompletion(req = {}) {
    const conf = (await getConf()) || {}
    const { baseURL, apiKey } = currentProviderConfig(conf)
    const model = req.model || conf.modelName || conf.relayModel || DEFAULT_MODEL

    return runtimeRequest("llm_chat_completion", {
        request: {
            baseURL,
            apiKey,
            model,
            messages: req.messages || [],
            tools: req.tools,
            tool_choice: req.tool_choice,
            temperature: req.temperature,
        },
    })
}

export async function relayChat(message, opts = {}) {
    const messages = []
    if (opts.systemMessage) messages.push({ role: "system", content: opts.systemMessage })
    messages.push({ role: "user", content: String(message || "") })
    const res = await chatCompletion({
        messages,
        model: opts.model,
        temperature: opts.temperature,
    })
    return res?.choices?.[0]?.message?.content || ""
}
