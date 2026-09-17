// src/util.js
//
// MeetMate's extension surface. Everything AI-related funnels through ONE
// explicit entry point: `ask(question)`. Captions never call the model.
//
// Layers:
//   - shared.js  : chrome.storage conf helpers (re-exported here)
//   - relay.js   : direct OpenAI-compatible client via background worker
//   - focused.js : pure helpers (shortcuts, transcript formatting,
//                  knowledge TF-IDF retrieval, ask payload)

import { getConf, changeConf } from "./shared";
import { relayChat, chatCompletion, fetchModels } from "./relay";
export { relayChat, chatCompletion, fetchModels } from "./relay";
import {
    normalizeShortcuts,
    getShownShortcuts,
    knowledgeSearch,
    formatTranscript,
    formatMeetingTimeline,
    buildAskMessages,
    DEFAULT_ASK_SYSTEM_PROMPT,
    KNOWLEDGE_SEARCH_TOOL,
    formatKnowledgeToolResult,
    buildKnowledgeWiki,
    rankTranscriptSources,
} from "./focused";

export * from "./shared";
export {
    DEFAULT_SHORTCUTS,
    FREE_SHORTCUT_SHOW_LIMIT,
    normalizeShortcuts,
    getShownShortcuts,
    knowledgeSearch,
    formatTranscript,
    formatMeetingTimeline,
    buildAskMessages,
    KNOWLEDGE_SEARCH_TOOL,
    formatKnowledgeToolResult,
    buildKnowledgeWiki,
    rankTranscriptSources,
} from "./focused";

export const isV2 = location.pathname.startsWith("/v2");

export function getMeetingName() {
    const title = String(document.title || "");
    const parts = title.split("|");
    const name = isV2 ? parts[1] : parts[0];
    return (name || title || "Meeting").trim() || "Meeting";
}

/**
 * Best-effort scrape of the participant roster currently visible in Teams V2.
 * Falls back to an empty array if the panel isn't open.
 */
export function getParticipants() {
    try {
        const names = new Set();
        document.querySelectorAll('[data-tid*="roster"] [aria-label], [data-tid="participantTile"] [aria-label]')
            .forEach((el) => {
                const name = (el.getAttribute('aria-label') || '').split(',')[0].trim();
                if (name && !/^(more|video|microphone|mute|hand)/i.test(name)) names.add(name);
            });
        document.querySelectorAll('[data-tid="closed-caption-v2-virtual-list-content"] [data-tid*="author"]')
            .forEach((el) => {
                const name = (el.innerText || '').trim();
                if (name) names.add(name);
            });
        return Array.from(names);
    } catch {
        return [];
    }
}

/**
 * Best-effort scrape of the meeting organizer name from Teams V2 DOM.
 */
export function getOrganizer() {
    try {
        const el = document.querySelector('[data-tid="organizer-name"], [data-tid*="organizer"]');
        return (el?.innerText || '').trim();
    } catch {
        return '';
    }
}

export function since(startTime) {
    return new Date(Date.now() - startTime).toISOString().replace('T', ' ').slice(11, 19 + 4);
}

// ── Shortcuts ─────────────────────────────────────────────────────────────

/** Read the user's configured shortcut buttons (never empty). */
export async function getShortcuts() {
    const conf = (await getConf()) || {};
    return normalizeShortcuts(conf.shortcuts);
}

// ── Knowledge ─────────────────────────────────────────────────────────────

/** All uploaded knowledge docs: `{ docs: [{id, name, content, ...}] }`. */
export async function getKnowledgeDocs() {
    return new Promise((resolve) =>
        chrome.storage.local.get("knowledge", (x) => resolve((x.knowledge && x.knowledge.docs) || []))
    );
}

// Cache the ask system prompt (loaded from extension/agent-prompt.md) so the
// prompt can be tuned without rebuilding code.
let _askPromptCache = null;
async function loadAskSystemPrompt() {
    if (_askPromptCache) return _askPromptCache;
    try {
        const url = chrome.runtime.getURL("agent-prompt.md");
        const res = await fetch(url);
        if (res.ok) {
            const text = await res.text();
            if (text && text.trim()) {
                _askPromptCache = text;
                return _askPromptCache;
            }
        }
    } catch { /* fall through to the built-in default */ }
    _askPromptCache = DEFAULT_ASK_SYSTEM_PROMPT;
    return _askPromptCache;
}

/** Execute the model's local knowledge-search tool. No document content
 * leaves the browser unless the model explicitly requests a search. */
export async function searchKnowledge(query, limit = 3) {
    const q = String(query || "").trim();
    if (!q) return [];
    const docs = await getKnowledgeDocs();
    if (!docs.length) return [];
    const k = Math.max(1, Math.min(6, Number(limit) || 3));
    return knowledgeSearch(docs, q, k);
}

function parseToolArguments(raw) {
    if (raw && typeof raw === "object") return raw;
    try { return JSON.parse(String(raw || "{}")); }
    catch { return {}; }
}

function toolCallUnsupported(error) {
    const text = String(error?.message || error || "").toLowerCase();
    return /tool|function|unsupported|not support|400|404|422/.test(text);
}

async function completeWithKnowledgeTool(messages, signal, knowledgeAvailable, { stream = false, streamId = "" } = {}) {
    if (!knowledgeAvailable) return { response: await chatCompletion({ messages, signal, stream, streamId }), knowledgeHits: [] };
    const tools = [KNOWLEDGE_SEARCH_TOOL];
    let working = messages.slice();
    let searches = 0;
    const knowledgeHits = [];
    let response;

    try {
        response = await chatCompletion({ messages: working, tools, tool_choice: "auto", signal, stream, streamId });
    } catch (error) {
        if (!toolCallUnsupported(error)) throw error;
        const fallback = working.map((m, i) => i === 0 && m.role === "system"
            ? { ...m, content: `${m.content}\n\nRUNTIME NOTE: search_knowledge is unavailable with the current model/provider. Answer from meeting context only and do not claim you searched the knowledge library.` }
            : m);
        return { response: await chatCompletion({ messages: fallback, signal, stream, streamId }), knowledgeHits: [] };
    }

    for (let round = 0; round < 3; round++) {
        const assistant = response?.choices?.[0]?.message || {};
        const calls = Array.isArray(assistant.tool_calls) ? assistant.tool_calls : [];
        if (!calls.length) return { response, knowledgeHits };

        working.push({ role: "assistant", content: assistant.content ?? null, tool_calls: calls });

        for (const call of calls) {
            const name = call?.function?.name || "";
            let content;
            if (name !== "search_knowledge") {
                content = JSON.stringify({ error: `Unknown tool: ${name || "(missing)"}` });
            } else if (searches >= 2) {
                content = JSON.stringify({ error: "Knowledge search limit reached for this Ask (maximum 2)." });
            } else {
                searches++;
                const args = parseToolArguments(call?.function?.arguments);
                const query = String(args?.query || "").trim();
                if (!query) {
                    content = JSON.stringify({ error: "search_knowledge requires a non-empty query." });
                } else {
                    const hits = await searchKnowledge(query, args?.limit);
                    knowledgeHits.push(...hits.map(hit => ({ ...hit, query })));
                    content = formatKnowledgeToolResult(query, hits);
                }
            }
            working.push({ role: "tool", tool_call_id: call?.id || `tool-${round}-${searches}`, content });
        }

        if (searches >= 2) return { response: await chatCompletion({ messages: working, signal, stream, streamId }), knowledgeHits };
        response = await chatCompletion({ messages: working, tools, tool_choice: "auto", signal, stream, streamId });
    }

    return { response, knowledgeHits };
}

// ── Explicit ask (the ONLY path that calls the LLM in a meeting) ───────────

/**
 * Answer one explicit user question from the current meeting context.
 * Private knowledge is searched only if the model calls search_knowledge.
 *
 * @param {object} opts
 * @param {string} opts.question
 * @param {object[]} [opts.transcripts]  live transcript array
 * @param {string} [opts.author]         conf.author fallback for the prompt
 * @param {string} [opts.meetingName]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<string>} the answer text
 */
function resolvePreferredLanguage(value) {
    const raw = String(value || "browser").trim();
    if (raw.toLowerCase() === "auto") return "auto";
    if (raw.toLowerCase() === "browser") {
        try {
            return chrome.i18n?.getUILanguage?.() || navigator.language || "en";
        } catch (_) {
            return (typeof navigator !== "undefined" && navigator.language) || "en";
        }
    }
    return raw;
}

export async function askDetailed({ question, transcripts = [], conversation = [], author, meetingName, signal, maxTranscriptChars, includeProvenance = false, responseMode = "live", stream = false, streamId = "" } = {}) {
    const q = String(question || "").trim();
    if (!q) return { answer: "", sources: [] };

    const conf = (await getConf()) || {};
    let systemPrompt = await loadAskSystemPrompt();
    if (responseMode === "report") {
        systemPrompt += `\n\nREPORT MODE: Override the short live-answer style. Produce a concise but complete Markdown meeting report with these sections: Summary, Decisions, Actions, My commitments, Open questions, Risks. Use bullets. Include owner and due date only when stated. Do not invent missing items.`;
    }
    const knowledgeDocs = await getKnowledgeDocs();
    const knowledgeWiki = buildKnowledgeWiki(knowledgeDocs);

    const { messages } = buildAskMessages({
        question: q,
        transcripts,
        conversation,
        systemPrompt,
        knowledgeWiki,
        author: author || conf.author || "",
        meetingName: meetingName || getMeetingName() || "",
        preferredLanguage: resolvePreferredLanguage(conf.preferredLanguage || "browser"),
        customInstructions: conf.customInstructions || "",
        maxTranscriptChars: maxTranscriptChars || 6000,
    });

    const { response, knowledgeHits } = await completeWithKnowledgeTool(messages, signal, knowledgeDocs.length > 0, {
        stream,
        streamId,
    });
    const answer = String(response?.choices?.[0]?.message?.content || "").trim();
    if (!includeProvenance) return { answer, sources: [] };

    const transcriptSources = rankTranscriptSources(transcripts, q, answer, 3);
    const seen = new Set();
    const knowledgeSources = [];
    for (const hit of knowledgeHits) {
        const key = `${hit.doc}::${hit.snippet}`;
        if (seen.has(key)) continue;
        seen.add(key);
        knowledgeSources.push({
            type: "knowledge",
            source: hit.doc,
            quote: String(hit.snippet || "").slice(0, 220),
            query: hit.query || "",
        });
        if (knowledgeSources.length >= 3) break;
    }
    return { answer, sources: [...transcriptSources, ...knowledgeSources] };
}

export async function ask(opts = {}) {
    return (await askDetailed(opts)).answer;
}

/**
 * One-shot rewrite helper (used by the SharePoint transcript helper page).
 */
export async function rephrase(message) {
    const conf = (await getConf()) || {};
    try {
        return await relayChat(String(message || ""), {
            systemMessage: conf.rephrasePrompt || "",
        });
    } catch (e) {
        return e.message || String(e);
    }
}
