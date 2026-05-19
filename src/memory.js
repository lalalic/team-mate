// Persistent memory layer for the meeting assistant.
//
// chrome.storage.local.memory shape:
//   {
//     long:  string[]                         // distilled facts/preferences (cap 100)
//     short: Array<{ts:number, name:string, summary:string}>  // last 10 meetings
//   }
//
// `formatForPrompt()` produces a Markdown block injected into the agent system
// prompt as `{memory}`. `appendShort` and `mergeLong` are called at end-of-meeting
// after minutes generation.

const KEY = 'memory';
const LONG_CAP = 100;
const SHORT_CAP = 10;

function defaults() { return { long: [], short: [] }; }

export async function getMemory() {
    return new Promise((resolve) => {
        try {
            chrome.storage.local.get([KEY], (res) => {
                const m = res[KEY] || defaults();
                if (!Array.isArray(m.long))  m.long  = [];
                if (!Array.isArray(m.short)) m.short = [];
                resolve(m);
            });
        } catch { resolve(defaults()); }
    });
}

async function setMemory(m) {
    return new Promise((resolve) => {
        try { chrome.storage.local.set({ [KEY]: m }, () => resolve(m)); }
        catch { resolve(m); }
    });
}

export async function replaceMemory({ long, short }) {
    const m = await getMemory();
    if (Array.isArray(long))  m.long  = long.slice(0, LONG_CAP);
    if (Array.isArray(short)) m.short = short.slice(-SHORT_CAP);
    return setMemory(m);
}

export async function clearMemory() {
    return setMemory(defaults());
}

export async function appendShort({ name, summary }) {
    const m = await getMemory();
    m.short.push({ ts: Date.now(), name: name || '(untitled)', summary: (summary || '').trim() });
    if (m.short.length > SHORT_CAP) m.short = m.short.slice(-SHORT_CAP);
    return setMemory(m);
}

/**
 * Append new facts to long-term memory, deduping case-insensitively.
 * Caps at LONG_CAP, dropping oldest first.
 */
export async function mergeLong(facts = []) {
    const m = await getMemory();
    const seen = new Set(m.long.map((s) => s.trim().toLowerCase()));
    for (const f of facts) {
        const t = (f || '').trim();
        if (!t) continue;
        const k = t.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        m.long.push(t);
    }
    if (m.long.length > LONG_CAP) m.long = m.long.slice(-LONG_CAP);
    return setMemory(m);
}

export async function formatForPrompt() {
    const m = await getMemory();
    if (!m.long.length && !m.short.length) return '(empty)';
    const lines = [];
    if (m.long.length) {
        lines.push('### Long-term');
        m.long.forEach((f) => lines.push(`- ${f}`));
    }
    if (m.short.length) {
        lines.push('');
        lines.push('### Recent meetings');
        m.short.slice().reverse().forEach((s) => {
            const date = new Date(s.ts).toISOString().split('T')[0];
            const oneLine = (s.summary || '').replace(/\s+/g, ' ').slice(0, 240);
            lines.push(`- **${date} — ${s.name}**: ${oneLine}`);
        });
    }
    return lines.join('\n');
}
