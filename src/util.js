// teams-live-caption-ai/src/util.js
//
// AI service is now backed by copilot-relay (see docs/session-api.md and
// clients/js/copilot-relay-client.js). The OpenAI/qili predict path was
// removed; everything goes through the relay's session API.
//
// All non-AI utilities (createUI, getConf, since, getMeetingName, isV2,
// initSetupPage, buy) come unchanged from the shared chrome-extensions util.

import { getConf, changeConf } from "./shared";
import { relayChat, resetRelayClient } from "./relay";
import { createLoopSession } from "./loop-session";
import { formatForPrompt as formatMemoryForPrompt, appendShort, mergeLong } from "./memory";

export * from "./shared";
export { getUsage, resetUsage, getWalletBalanceCents, fetchWalletBalance } from "./relay";
export { getMemory, clearMemory, replaceMemory, appendShort as memoryAppendShort, mergeLong as memoryMergeLong } from "./memory";
export { getBilling, applyCredit, clearBilling } from "./billing";

export const isV2 = location.pathname.startsWith("/v2");

export function getMeetingName() {
    const title = document.title.split("|");
    return (isV2 ? title[1] : title[0]).trim();
}

/**
 * Best-effort scrape of the participant roster currently visible in Teams V2.
 * Falls back to an empty array if the panel isn't open.
 */
export function getParticipants() {
    try {
        const names = new Set();
        // V2 roster avatars expose displayname via image alt or aria-label.
        document.querySelectorAll('[data-tid*="roster"] [aria-label], [data-tid="participantTile"] [aria-label]')
            .forEach((el) => {
                const name = (el.getAttribute('aria-label') || '').split(',')[0].trim();
                if (name && !/^(more|video|microphone|mute|hand)/i.test(name)) names.add(name);
            });
        // Also pick up any author chips that have spoken (they appear in the caption stream).
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
 * Falls back to "" if not found.
 */
export function getOrganizer() {
    try {
        // Teams V2 meeting details panel exposes organizer with data-tid="organizer-name"
        const el = document.querySelector('[data-tid="organizer-name"], [data-tid*="organizer"]');
        return (el?.innerText || '').trim();
    } catch {
        return '';
    }
}

/**
 * Capture deterministic meeting metadata available at session start.
 * Returns a Markdown bullet list ready to drop into the system prompt.
 */
export function getMeetingMetadata() {
    const now = new Date();
    const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } })();
    const locale = (() => { try { return navigator.language || ''; } catch { return ''; } })();
    const url = (() => { try { return location.href.split('?')[0]; } catch { return ''; } })();
    const organizer = getOrganizer();
    const lines = [
        `- **Started at:** ${now.toISOString()} (${tz || 'unknown tz'})`,
        `- **User locale:** ${locale || 'unknown'}`,
        organizer ? `- **Organizer:** ${organizer}` : null,
        url ? `- **Meeting URL:** ${url}` : null,
        `- **Platform:** Microsoft Teams${isV2 ? ' (V2)' : ''}`,
    ].filter(Boolean);
    return lines.join('\n');
}

export function since(startTime) {
    return new Date(Date.now() - startTime).toISOString().replace('T', ' ').slice(11, 19 + 4);
}

/**
 * Render an assistant bubble (chat panel entry OR floating bubble body)
 * with two affordances:
 *   - whole bubble click  → re-ask the loop ("Refine: <text>")
 *   - small Copy button   → copy text to clipboard, no model round-trip
 *
 * Returns the wrapping div (caller appends it). `kind` is "SUGGEST" or
 * "RESEARCH" (controls icon + accent). `chips` array (optional) is
 * rendered below the text and bound to pushUserMsg.
 */
export function renderAssistantBubble({ text, kind = "SUGGEST", chips = [] } = {}) {
    const safe = (s) => String(s == null ? "" : s).replace(/[<>&"]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;' }[c]));
    const tag = kind === 'RESEARCH' ? '🔎' : '💬';
    const color = kind === 'RESEARCH' ? '#06c' : '#0a0';
    const wrap = document.createElement('div');
    wrap.classList.add('assistant');
    wrap.dataset.kind = kind;
    wrap.dataset.text = text || '';
    wrap.innerHTML = `
        <span class="icon"></span>
        <div class="meetmate-msg-body">
            <p class="message"><span class="meetmate-kind" style="color:${color}">${tag}</span> ${safe(text).replaceAll('\n','<br>')}</p>
            ${(Array.isArray(chips) && chips.length)
                ? `<div class="meetmate-bubble-chips">${chips.slice(0,4).map(s => `<button class="meetmate-chip" data-label="${safe(s)}">${safe(s)}</button>`).join('')}</div>`
                : ''}
        </div>
    `;
    // Chip taps push the chip label to the loop as a user message — the
    // model treats it as a concrete action request. The reply arrives via
    // the standard onSuggestion → new bubble path, so we don't need to
    // await a reply here; we just mark this chip sent + disable others.
    wrap.querySelectorAll('button.meetmate-chip').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const chips = wrap.querySelectorAll('button.meetmate-chip');
            const label = btn.dataset.label || btn.innerText;
            chips.forEach(b => { if (b !== btn) b.disabled = true; });
            btn.disabled = true;
            btn.classList.add('meetmate-chip-resolved');
            const originalLabel = btn.innerHTML;
            btn.innerHTML = `\u2713 ${originalLabel}`;
            try {
                if (window.__meetmate?.pushUserMsg) {
                    window.__meetmate.pushUserMsg(label);
                } else {
                    console.warn('[meetmate] chip click ignored — pushUserMsg not exposed');
                    // Restore so the user can retry once the loop is ready.
                    btn.classList.remove('meetmate-chip-resolved');
                    btn.innerHTML = originalLabel;
                    chips.forEach(b => { b.disabled = false; });
                }
            } catch (err) {
                console.warn('[meetmate] chip click failed', err);
                btn.classList.remove('meetmate-chip-resolved');
                btn.classList.add('meetmate-chip-failed');
                btn.innerHTML = `\u2717 ${originalLabel}`;
            }
        });
    });
    return wrap;
}

// --- Prompt templating --------------------------------------------------------

function fillTemplate(template = "", variables = {}) {
    return template.replace(/\{(.*?)\}/g, (_, key) => (key in variables ? variables[key] : `[]`));
}

// --- Knowledge: chunking + TF-IDF retrieval --------------------------------
// Tokenize: lowercase, keep ASCII letters/digits/underscore + CJK runs, drop
// short tokens. Good enough for English + Chinese keyword search.
function knowledgeTokenize(s) {
    return String(s || "")
        .toLowerCase()
        .replace(/[^a-z0-9_\u4e00-\u9fff]+/g, " ")
        .split(/\s+/)
        .filter((t) => t.length >= 2);
}

// Split text into ~600-char overlapping chunks, breaking at paragraph or
// sentence boundaries when possible. Returns array of trimmed strings.
function knowledgeChunk(text, size = 600, overlap = 100) {
    const n = text.length;
    if (n <= size) return text.trim() ? [text.trim()] : [];
    const chunks = [];
    let i = 0;
    while (i < n) {
        let end = Math.min(n, i + size);
        if (end < n) {
            const slice = text.slice(i, Math.min(n, end + 100));
            const para = slice.lastIndexOf("\n\n");
            const sentCandidates = [
                slice.lastIndexOf(". "),
                slice.lastIndexOf("。"),
                slice.lastIndexOf("! "),
                slice.lastIndexOf("? "),
                slice.lastIndexOf("\n"),
            ];
            const sent = Math.max(...sentCandidates);
            const cut = para > size * 0.5 ? para : sent > size * 0.5 ? sent + 1 : -1;
            if (cut > 0) end = i + cut;
        }
        const piece = text.slice(i, end).trim();
        if (piece.length >= 20) chunks.push(piece);
        if (end >= n) break;
        i = Math.max(end - overlap, i + 1);
    }
    return chunks;
}

// Score chunks against a query using TF-IDF. Returns top-K matches.
function knowledgeSearch(docs, query, k = 5) {
    const qTokens = knowledgeTokenize(query);
    if (!qTokens.length) return [];
    // Build chunks across all docs.
    const chunks = [];
    for (const d of docs) {
        const parts = knowledgeChunk(String(d.content || ""));
        parts.forEach((text, idx) => {
            const tokens = knowledgeTokenize(text);
            const tf = Object.create(null);
            for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
            chunks.push({ doc: d.name, idx, text, tf });
        });
    }
    if (!chunks.length) return [];
    // Document frequency over chunks (treat each chunk as a "document").
    const df = Object.create(null);
    for (const c of chunks) for (const t of Object.keys(c.tf)) df[t] = (df[t] || 0) + 1;
    const N = chunks.length;
    const idf = (t) => Math.log((N + 1) / ((df[t] || 0) + 1)) + 1;
    const qSet = Array.from(new Set(qTokens));
    const scored = [];
    for (const c of chunks) {
        let score = 0;
        for (const t of qSet) {
            const tf = c.tf[t] || 0;
            if (tf) score += (1 + Math.log(tf)) * idf(t);
        }
        if (score > 0) scored.push({ doc: c.doc, idx: c.idx, text: c.text, score });
    }
    scored.sort((a, b) => b.score - a.score);
    const picked = [];
    for (const m of scored) {
        if (picked.length >= k) break;
        // Skip near-duplicates: same doc + adjacent chunk index.
        if (picked.some((p) => p.doc === m.doc && Math.abs(p.idx - m.idx) <= 1)) continue;
        picked.push(m);
    }
    return picked.map(({ doc, text, score, idx }) => ({
        doc,
        chunk: idx,
        score: Math.round(score * 100) / 100,
        snippet: text.replace(/\s+/g, " ").slice(0, 500),
    }));
}

// Format the per-doc wiki entries into a compact index for the system
// prompt. Each entry is one doc's LLM-generated summary (≤ ~250 chars)
// so the LLM can decide whether to call `recall_knowledge` to fetch
// full passages. Falls back to first-200-chars when no wikiEntry yet.
export async function formatKnowledgeIndex() {
    const k = await new Promise((r) =>
        chrome.storage.local.get("knowledge", (x) => r(x.knowledge || { docs: [] }))
    );
    const docs = Array.isArray(k.docs) ? k.docs : [];
    if (!docs.length) return "(none)";
    const lines = [];
    for (const d of docs) {
        const head = `### ${d.name}`;
        const body = (d.wikiEntry && String(d.wikiEntry).trim())
            || String(d.content || "").replace(/\s+/g, " ").slice(0, 200) + "…";
        lines.push(`${head}\n${body}`);
    }
    return lines.join("\n\n");
}

// Cache the agent prompt template (loaded from extension/agent-prompt.md) so
// users can edit it without rebuilding code.
let _agentPromptCache = null;
async function loadAgentPrompt() {
    if (_agentPromptCache) return _agentPromptCache;
    try {
        const url = chrome.runtime.getURL("agent-prompt.md");
        const res = await fetch(url);
        if (res.ok) {
            _agentPromptCache = await res.text();
            return _agentPromptCache;
        }
    } catch { /* fall through */ }
    // Fallback to i18n version if the file isn't shipped.
    _agentPromptCache = chrome.i18n.getMessage("suggestionPrompt") || "";
    return _agentPromptCache;
}

// --- AI service backed by relay ----------------------------------------------

/**
 * Build the AI service used by the meeting UI. Returns:
 *   suggest({ history, transcripts, goal, name }) → string
 *   rephrase(message) → string
 *
 * Both flows route through the copilot-relay session API. `history` is folded
 * into a single relay turn so we don't depend on relay-side conversation
 * memory for these one-shot queries.
 */
export async function makePredictAPI() {
    const conf = await getConf();
    const promptTemplate = await loadAgentPrompt();
    const memoryBlock = await formatMemoryForPrompt();
    const knowledgeIndex = await formatKnowledgeIndex();

    // Static system message — built ONCE per service instance, never includes
    // transcripts. Keeping it stable lets the relay client reuse the same
    // session across calls (suggest/judge/minutes/distillMemory) so the model
    // accumulates conversation history server-side.
    function buildSystemMessage({ name, goal }) {
        return fillTemplate(promptTemplate, {
            name: name || "(untitled)",
            goal: goal || "(none)",
            author: conf.author || "the user",
            participants: getParticipants().join(", ") || "(unknown)",
            user_context: (conf.userContext || "").trim() || "(none)",
            memory: memoryBlock || "(empty)",
            knowledge_index: knowledgeIndex || "(none)",
        });
    }

    // Format transcripts for inclusion in user-message blocks.
    function fmtTranscripts(transcripts, limit = 40) {
        if (!transcripts) return "";
        if (transcripts.toString && typeof transcripts !== "object") {
            return transcripts.toString();
        }
        const arr = Array.isArray(transcripts) ? transcripts : [];
        const tail = limit > 0 ? arr.slice(-limit) : arr;
        return tail.map(({ Name, Text }) => `${Name} : ${Text}`).join("\n");
    }

    return {
        async suggest({ history: chat, transcripts, goal, name }) {
            const message = chat[chat.length - 1];
            const systemMessage = buildSystemMessage({ name, goal });

            const enabledHistory = conf.enabledHistory !== false;
            const priorMessages = enabledHistory ? chat.slice(0, -1) : [];
            const chatBlock = priorMessages.length
                ? priorMessages.map(({ role, content }) => `${role}: ${content}`).join("\n")
                : "";
            const trBlock = fmtTranscripts(transcripts);

            const parts = [];
            if (trBlock) parts.push(`[TRANSCRIPTS]\n${trBlock}`);
            if (chatBlock) parts.push(`[CHAT]\n${chatBlock}`);
            parts.push(`[REQUEST]\n${message?.content || ""}`);
            const userText = parts.join("\n\n");

            try {
                return await relayChat(userText, { systemMessage, meetingId: name });
            } catch (e) {
                return e.message || String(e);
            }
        },

        /**
         * Auto-judge: given the latest transcript chunk, ask the model whether to
         * SUGGEST a reply, surface RESEARCH, or stay SILENT.
         * Returns { kind: 'suggest'|'research'|'silent', text: string }.
         */
        async judge({ chunk, transcripts, name, goal }) {
            const systemMessage = buildSystemMessage({ name, goal });
            const chunkText = (chunk || []).map(({ Name, Text }) => `${Name} : ${Text}`).join("\n");
            // Send only the delta chunk — earlier transcripts are already in
            // the relay session conversation history from prior judge turns.
            const userPrompt = `[TRANSCRIPT-CHUNK]\n${chunkText}`;

            let raw = "";
            try {
                raw = await relayChat(userPrompt, { systemMessage, meetingId: name });
            } catch (e) {
                return { kind: 'silent', text: '' };
            }
            const line = (raw || "").split("\n").map((s) => s.trim()).find(Boolean) || "";
            const m = line.match(/^(SUGGEST|RESEARCH|SILENT)\s*:?\s*(.*)$/i);
            if (!m) return { kind: 'silent', text: '' };
            const kind = m[1].toLowerCase();
            const text = (m[2] || '').trim();
            if (kind === 'silent' || !text) return { kind: 'silent', text: '' };
            return { kind, text };
        },

        /**
         * Generate end-of-meeting minutes in Markdown.
         */
        async minutes({ transcripts, name, goal }) {
            const systemMessage = buildSystemMessage({ name, goal });
            const trBlock = fmtTranscripts(transcripts, 0); // include all
            const userPrompt = [
                trBlock ? `[TRANSCRIPTS]\n${trBlock}` : "",
                `[REQUEST]\nPlease produce meeting minutes for "${name || '(untitled)'}" now.`,
            ].filter(Boolean).join("\n\n");
            try {
                return await relayChat(userPrompt, { systemMessage, meetingId: name });
            } catch (e) {
                return e.message || String(e);
            }
        },

        /**
         * Distill durable facts and a one-paragraph summary from this meeting,
         * for storage in long/short-term memory.
         * Returns { facts: string[], summary: string }.
         */
        async distillMemory({ transcripts, name, goal }) {
            const systemMessage = buildSystemMessage({ name, goal });
            const trBlock = fmtTranscripts(transcripts, 0);
            const userPrompt = [
                trBlock ? `[TRANSCRIPTS]\n${trBlock}` : "",
                `[REQUEST]`,
                `Distill memory from "${name || '(untitled)'}".`,
                `Return strict JSON only, no markdown fences:`,
                `{ "facts": ["short, durable, atomic fact worth remembering across meetings", ...],`,
                `  "summary": "one-paragraph (\u226460 words) recap of this meeting" }`,
                ``,
                `Rules for facts:`,
                `- Atomic. One fact per string.`,
                `- Durable: prefer people roles, decisions, recurring topics, preferences, owned action items.`,
                `- Skip ephemeral chit-chat.`,
                `- Max 8 facts. No duplicates of facts already in Memory.`,
            ].filter(Boolean).join('\n');
            let raw = '';
            try {
                raw = await relayChat(userPrompt, { systemMessage, meetingId: name });
            } catch { return { facts: [], summary: '' }; }
            // Extract first {...} JSON object.
            const m = (raw || '').match(/\{[\s\S]*\}/);
            if (!m) return { facts: [], summary: '' };
            try {
                const obj = JSON.parse(m[0]);
                return {
                    facts: Array.isArray(obj.facts) ? obj.facts.filter((s) => typeof s === 'string') : [],
                    summary: typeof obj.summary === 'string' ? obj.summary : '',
                };
            } catch {
                return { facts: [], summary: '' };
            }
        },

        async rephrase(message) {
            try {
                return await relayChat(message, {
                    systemMessage: conf.rephrasePrompt || "",
                    meetingId: conf._currentMeetingId || undefined,
                });
            } catch (e) {
                return e.message || String(e);
            }
        },

        /** Tear down the relay client (call when leaving a meeting). */
        async dispose() {
            await resetRelayClient();
        },
    };
}

/**
 * Build a loop-session client for one meeting. The model runs in a single
 * long-lived relay session and drives suggestions/minutes/memory via tools.
 *
 * Returns:
 *   start()                — create session + send bootstrap prompt
 *   pushCaption(chunk)     — feed a chunk of new captions
 *   pushUserMsg(text)      — user typed in chat or tapped a chip (head-of-queue)
 *   end()                  — send {event:'end'}, give model time, then disconnect
 *   onSuggestion(fn)       — register callback for send_suggestion tool calls
 *   onMinutes(fn)          — register callback for save_minutes tool calls *
 * @param {object} opts
 * @param {string} opts.meetingId
 * @param {string} opts.goal
 * @param {string} opts.name
 * @param {object[]} opts.transcripts   — live array (read by get_snapshot)
 * @param {object[]} opts.history       — live array (read by get_snapshot)
 */
export async function makeLoopClient({ meetingId, name, transcripts, history }) {
    const conf = await getConf();
    const promptTemplate = await loadAgentPrompt();
    const memoryBlock = await formatMemoryForPrompt(name);
    const knowledgeIndex = await formatKnowledgeIndex();

    const systemMessage = fillTemplate(promptTemplate, {
        name: name || "(untitled)",
        author: conf.author || "the user",
        participants: getParticipants().join(", ") || "(unknown)",
        meeting_meta: getMeetingMetadata(),
        user_context: (conf.userContext || "").trim() || "(none)",
        memory: memoryBlock || "(empty)",
        knowledge_index: knowledgeIndex || "(none)",
    });

    let onSuggestionCbs = [];
    let onMinutesCb = null;
    let onConnectedCb = null;
    // Generic "any tool was invoked" listeners — used by askLoop so a chip
    // tap can resolve to ✓ even if the model silently calls save_memory /
    // update_live_minutes instead of producing a new bubble.
    let onAnyToolCbs = [];
    const fireAnyTool = (tool, args) => {
        for (const cb of onAnyToolCbs) {
            try { cb({ tool, args }); } catch (e) { console.warn(e); }
        }
    };

    const handlers = {
        getSnapshot({ since } = {}) {
            const cutoff = since ? Date.parse(since) : 0;
            const t = (Array.isArray(transcripts) ? transcripts : []).filter((x) => {
                if (!cutoff) return true;
                const ts = x.Time ? Date.parse(x.Time) : 0;
                return !ts || ts >= cutoff;
            });
            return {
                transcripts: t.map(({ Name, Text, Time }) => ({ Name, Text, Time })),
                history: Array.isArray(history) ? history.slice(-20) : [],
                name: name || "",
                participants: getParticipants(),
                memory: memoryBlock || "",
            };
        },
        sendSuggestion({ kind, text, options }) {
            // Some upstreams (deepseek-chat in particular) emit `\\n`
            // sequences in tool-call JSON arguments instead of real
            // newlines. Decode them so the renderer's `\n` → `<br>`
            // conversion works.
            const decoded = typeof text === "string"
                ? text.replace(/\\n/g, "\n").replace(/\\t/g, "\t")
                : text;
            for (const cb of onSuggestionCbs) {
                try { cb({ kind, text: decoded, options }); } catch (e) { console.warn(e); }
            }
            fireAnyTool('send_suggestion', { kind, text: decoded, options });
            return { ok: true };
        },
        async saveMinutes({ markdown }) {
            try { onMinutesCb?.({ markdown }); } catch (e) { console.warn(e); }
            try {
                chrome.runtime.sendMessage({
                    message: "minutes_ready",
                    name: name || "(untitled)",
                    minutes: markdown || "",
                });
            } catch {}
            return { ok: true };
        },
        async updateLiveMinutes() {
            // Live-minutes panel removed 2026-05 — tool retired. Stub kept so
            // any legacy agent prompts still resolve cleanly.
            return { ok: true };
        },
        async saveMemory({ facts, summary }) {
            try {
                if (summary) await appendShort({ name: name || "(untitled)", summary });
                if (Array.isArray(facts) && facts.length) await mergeLong(facts);
            } catch (e) { console.warn(e); }
            fireAnyTool('save_memory', { facts, summary });
            return { ok: true };
        },
        async recallKnowledge({ query, limit }) {
            const max = Math.max(1, Math.min(10, Number(limit) || 5));
            try {
                const k = await new Promise(r => chrome.storage.local.get('knowledge', x => r(x.knowledge || { docs: [] })));
                const docs = Array.isArray(k.docs) ? k.docs : [];
                if (!docs.length) return { ok: true, matches: [], note: "No knowledge docs uploaded. Tell the user to upload reference docs in Setup → Knowledge." };
                const matches = knowledgeSearch(docs, String(query || ""), max);
                return { ok: true, matches };
            } catch (e) {
                return { ok: false, error: String(e?.message || e) };
            }
        },
        onConnected() {
            try { onConnectedCb?.(); } catch (e) { console.warn(e); }
        },
    };

    const loop = createLoopSession({
        meetingId,
        systemMessage,
        model: conf.relayModel || "deepseek-v4-flash",
        handlers,
    });

    return {
        start: () => loop.start(),
        pushCaption: (chunk) => loop.pushCaption(chunk),
        pushUserMsg: (text) => loop.pushUserMsg(text),
        end: () => loop.end(),
        onSuggestion: (fn) => {
            // Returns an unsubscribe function. Multiple listeners supported.
            onSuggestionCbs.push(fn);
            return () => { onSuggestionCbs = onSuggestionCbs.filter(x => x !== fn); };
        },
        onMinutes: (fn) => { onMinutesCb = fn; },
        onConnected: (fn) => { onConnectedCb = fn; },
        // Push a user message and resolve with the FIRST model response —
        // a send_suggestion payload, or { ack: true, tool } if the model
        // silently called save_memory / update_live_minutes
        // (e.g. a goal-binding chip that just persists state). Resolves
        // null on timeout. Used by the chat panel and chip taps.
        askLoop: (text, { timeoutMs = 30000 } = {}) => new Promise((resolve) => {
            let done = false;
            const cleanup = () => {
                onSuggestionCbs = onSuggestionCbs.filter(x => x !== onSugg);
                onAnyToolCbs = onAnyToolCbs.filter(x => x !== onAny);
            };
            const onSugg = (payload) => {
                if (done) return;
                done = true;
                cleanup();
                resolve(payload);
            };
            const onAny = ({ tool, args }) => {
                if (done) return;
                if (tool === 'send_suggestion') return; // handled by onSugg
                done = true;
                cleanup();
                resolve({ ack: true, tool, args });
            };
            onSuggestionCbs.push(onSugg);
            onAnyToolCbs.push(onAny);
            setTimeout(() => {
                if (done) return;
                done = true;
                cleanup();
                resolve(null);
            }, timeoutMs);
            try { loop.pushUserMsg(text); }
            catch (e) {
                done = true;
                cleanup();
                resolve(null);
            }
        }),
    };
}

// (makeTranslatorClient was removed 2026-05 — continuous-translation feature retired.)

// --- UI (unchanged from previous version, but uses new makePredictAPI) -------

export async function createUI({ uiContainer = document.body, transcripts, history } = {}) {
    if (!(await getConf()).enabledSuggestion) return;

    const actionButtonContainer = await createAISuggestion();
    await createActionButtons(actionButtonContainer);

    async function createActionButtons(container) {
        const conf = await getConf();
        const flaggers = [];
        if (conf.enabledLanguageFlag) flaggers.push({ role: "language", color: "blue" });
        if (conf.enabledMeetingFlag)  flaggers.push({ role: "meeting",  color: "green" });

        flaggers.forEach(({ role, text = "", onClick, title = chrome.i18n.getMessage(`${role}Attention`) }) => {
            const flagger = document.createElement('button');
            flagger.role = role;
            flagger.title = title;
            flagger.innerText = text;
            flagger.classList.add('actionButton');
            if (!onClick) {
                onClick = () => {
                    const transcript = transcripts[transcripts.length - 1];
                    if (!transcript) return;
                    transcript[role] = true;
                    flagger.innerText = transcripts.filter(a => a[role]).length;
                };
            }
            flagger.addEventListener('click', onClick);
            container.appendChild(flagger);
        });
    }

    async function createAISuggestion() {
        // Legacy AI chat surface kept hidden — rail+center cover its use cases.
        const [chatEl] = createAIChatUI();
        if (chatEl) chatEl.style.visibility = 'hidden';

        const container = document.createElement('div');
        container.id = "actionButtonContainer";
        container.classList.add('shouldRemove');
        uiContainer.appendChild(container);

        // (Continuous-translation toggle removed 2026-05 — feature retired.)
        // (Live-minutes panel removed 2026-05 — minutes are appended to the
        //  exported VTT at end-of-meeting only.)

        // --- Attention button (moved from rail header) ---------------------
        // Toggles forced display of the centered help panel. Dispatches a
        // CustomEvent picked up by ui-controller.js.
        const attention = document.createElement('button');
        attention.title = 'Attention — force-show centered help panel';
        attention.role = 'attention';
        attention.id = 'attentionButton';
        attention.classList.add('actionButton');
        attention.textContent = ''; // intentionally no icon (subtle dot via CSS)
        let _attOn = false;
        attention.addEventListener('click', () => {
            _attOn = !_attOn;
            attention.classList.toggle('doing', _attOn);
            window.dispatchEvent(new CustomEvent('meetmate:attention-toggle', { detail: { on: _attOn } }));
        });
        container.appendChild(attention);

        return container;
    }

    function createAIChatUI() {
        const container = document.createElement('div');
        container.classList.add('shouldRemove');
        container.id = "aichat";
        uiContainer.appendChild(container);

        container.innerHTML = `
            <div></div>
            <textarea/>
        `;
        const messagesContainer = container.querySelector('div');
        const textarea = container.querySelector('textarea');
        textarea.value = "";

        textarea.addEventListener('change', async () => {
            if (!textarea.value.trim()) return;
            const userText = textarea.value.trim();
            const userMsg = { role: "user", content: userText };
            history.push(userMsg);
            messagesContainer.appendChild(createMessageUI(userMsg));
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            textarea.value = "";
            textarea.disabled = true;
            textarea.placeholder = "Thinking…";

            try {
                // Route into the active loop session. Resolves with the next
                // send_suggestion or null. The suggestion is rendered by the
                // single onSuggestion → showSuggestion path (no placeholder
                // bubble here, otherwise the chat shows the same reply twice).
                const payload = window.__meetmate?.askLoop
                    ? await window.__meetmate.askLoop(userText, { timeoutMs: 45000 })
                    : null;
                if (!payload) {
                    const msg = { role: "assistant", content: 'No reply (loop timeout). Try again or check the bubble.', kind: 'SUGGEST' };
                    history.push(msg);
                    messagesContainer.appendChild(createMessageUI(msg));
                } else if (payload.ack && !payload.text) {
                    // Model handled silently via a non-suggestion tool.
                    const tool = payload.tool || 'tool';
                    const ackText = ({
                        save_memory: '✓ Noted.',
                        update_live_minutes: '✓ Topic updated — see the 📌 panel.',
                        // (set_phase removed 2026-05 — phase feature retired.)
                    })[tool] || `✓ Done (${tool}).`;
                    const msg = { role: "assistant", content: ackText, kind: 'SUGGEST' };
                    history.push(msg);
                    messagesContainer.appendChild(createMessageUI(msg));
                }
                // payload.text path: showSuggestion already rendered the bubble.
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            } catch (e) {
                const errMsg = { role: "assistant", content: e.message || String(e), kind: 'SUGGEST' };
                history.push(errMsg);
                messagesContainer.appendChild(createMessageUI(errMsg));
            } finally {
                textarea.disabled = false;
                textarea.placeholder = "";
                textarea.focus();
            }
        });

        textarea.addEventListener('keydown', (e) => {
            if (e.key === "Enter" || e.keyCode === 13) {
                textarea.dispatchEvent(new Event('change'));
                e.preventDefault();
            }
        });

        function createMessageUI(msg) {
            const { role, content } = msg || {};
            if (role === 'assistant') {
                return renderAssistantBubble({
                    text: content,
                    kind: msg.kind || 'SUGGEST',
                    chips: msg.options || [],
                });
            }
            const el = document.createElement('div');
            el.classList.add(role || 'user');
            el.innerHTML = `<span class="icon"></span><p class="message">${(content || "").replaceAll("\n", "<br>")}</p>`;
            return el;
        }

        // Render any messages already in history (e.g. greeting from loop session).
        for (const m of history) messagesContainer.appendChild(createMessageUI(m));
        return [container];
    }
}
