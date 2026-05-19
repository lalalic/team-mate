const {makePredictAPI, createUI, since, initSetupPage, getConf, getUsage, resetUsage, getMemory, replaceMemory, getBilling, applyCredit, getWalletBalanceCents, fetchWalletBalance} = require("./util")
const {STRIPE_PAYMENT_LINK, STRIPE_PAYMENT_LINKS, fetchModels, relayChat} = require("./relay")
const {getDeviceId} = require("./auth")

async function makeTest(conf){
    conf=conf || (await getConf())
    const button=document.querySelector('#test')
    if(!(conf.token || conf.apiKey)){
        button?.remove()
        return 
    }
    
    button.addEventListener('click',async ()=>{
        try{
            button.disabled=true
            const service=await makePredictAPI()
            const suggest=await service.suggest([{role:"user", content:"hello"}],[])
            alert(suggest)
        }catch(e){
            alert(`error: ${e.message}`)
        }finally{
            button.disabled=false
        }
    })
}

let uiContainer=null
let startTime=Date.now()//only for test
document.addEventListener('DOMContentLoaded',async ()=>{
    const conf=await initSetupPage()

    globalThis.makeTest=makeTest

    // --- Populate model picker from relay --------------------------------
    // GET /llm/v1/models (OpenAI-shaped: { data: [{id, ...}] })
    // If stored conf.relayModel isn't in the list, fall back to first entry.
    try {
        const models = await fetchModels()
        if (Array.isArray(models) && models.length) {
            const sel = document.querySelector('#relayModel')
            if (sel) {
                const stored = conf.relayModel
                sel.innerHTML = ''
                for (const m of models) {
                    const id = m.id || m
                    const opt = document.createElement('option')
                    opt.value = id
                    // OpenAI shape has no `multiplier`; fall back to id-only label.
                    opt.textContent = m.multiplier != null ? `${id} (×${m.multiplier})` : id
                    sel.appendChild(opt)
                }
                const ids = models.map(m => m.id || m)
                if (stored && ids.includes(stored)) {
                    sel.value = stored
                } else {
                    const def = (models.find(m => m.default) || models[0])
                    const defId = def.id || def
                    sel.value = defId
                    if (stored !== defId) {
                        conf.relayModel = defId
                        chrome.storage.local.set({ conf })
                    }
                }
            }
        }
    } catch (e) {
        // Offline / relay down — keep static <option> fallback in HTML
        console.warn('[setup] failed to fetch model list:', e.message)
    }

    document.querySelectorAll('.topup-tier').forEach(btn => {
        btn.addEventListener('click', async () => {
            const amount = Number(btn.dataset.amount) || 1
            const link = ((STRIPE_PAYMENT_LINKS && STRIPE_PAYMENT_LINKS[amount]) || STRIPE_PAYMENT_LINK || '').trim()
            if (!link || link.includes('REPLACE_ME')) {
                alert('Top-up is not yet configured. Please contact the extension publisher.')
                return
            }
            // Append client_reference_id so relay webhook can credit the wallet
            const deviceId = await getDeviceId()
            const url = new URL(link)
            url.searchParams.set('client_reference_id', deviceId)
            chrome.tabs.create({ url: url.toString() })
        })
    })

    // --- Credit-from-URL: when Stripe redirects back here, verify & apply ---
    // The URL `credit` param is informational only; the real amount is
    // returned by the relay's /stripe/verify call against Stripe API.
    async function applyCreditFromURL() {
        const params = new URLSearchParams(location.search)
        const session = params.get('session')
        if (!session) return
        const res = await applyCredit({ sessionId: session })
        if (res.applied) {
            alert(`\u2705 Credited $${res.amount.toFixed(2)}. New balance: $${res.credits.toFixed(2)}`)
        } else if (res.reason === 'already credited') {
            // silent — user just refreshed
        } else {
            alert(`Credit not applied: ${res.reason}`)
        }
        // Strip query so a refresh doesn't re-trigger.
        history.replaceState(null, '', location.pathname)
    }
    applyCreditFromURL()

    // --- Balance ------------------------------------------------------------
    async function refreshBalanceAndUsage() {
        // Always fetch from server to get latest wallet balance
        const serverCents = await fetchWalletBalance()
        const el = document.querySelector('#balance')
        if (serverCents != null) {
            if (el) el.textContent = (serverCents / 100).toFixed(2)
            return
        }
        // Fallback to cached value
        const cachedCents = await getWalletBalanceCents()
        if (cachedCents != null) {
            if (el) el.textContent = (cachedCents / 100).toFixed(2)
            return
        }
        const [u, b] = await Promise.all([getUsage(), getBilling()])
        const balance = (b.credits || 0) - (u.cost || 0)
        if (el) el.textContent = balance.toFixed(2)
    }

    // --- Usage panel (removed from UI; kept stub for storage listener) ------
    async function refreshUsage() { /* no-op: panel removed */ }
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.usage) { refreshBalanceAndUsage() }
        if (area === 'local' && changes.billing) refreshBalanceAndUsage()
        if (area === 'local' && changes.walletBalanceCents) refreshBalanceAndUsage()
        if (area === 'local' && changes.memory) refreshMemory()
        if (area === 'local' && changes.knowledge) refreshKnowledge()
    })
    refreshBalanceAndUsage()

    // --- Reset userContext to template --------------------------------------
    const USER_CONTEXT_TEMPLATE = `## About me
(Who you are, your role, expertise, communication style.)
- Role: 
- English / Chinese / other languages I speak (and which I'm strong / weak in for meetings):
- Communication style I aim for (concise / friendly / formal):

## People I meet with
(List frequent colleagues / clients with one line on their role and how they prefer to be addressed.)

## Current projects / cases / customers
(Specific things I'm actively working on. The agent should reference these by
name when drafting replies, e.g. "the NewYorkLife integration", "ticket #1234",
"the Q2 onboarding redesign".)

## How I want the agent to help
- When to suggest something vs. stay silent
- Tone (concise / formal / friendly)
- Things to never say or do
- If I'm a non-native speaker of the meeting language: produce polished,
  natural phrasing I can say verbatim.

## Knowledge / Reference
(Facts, glossary, product specs, OKRs, canned answers — anything the agent should know about. Add as you go.)

## Goals & Themes
(Recurring goals, current quarter's priorities, hot topics.)
`
    document.querySelector('#userContextReset')?.addEventListener('click', async (e) => {
        e.preventDefault()
        const el = document.querySelector('#userContext')
        if (el.value.trim() && !confirm('Replace your current context with the template? Your text will be lost.')) return
        el.value = USER_CONTEXT_TEMPLATE
        el.dispatchEvent(new Event('change'))
    })
    // Auto-fill template if currently empty (first install or post-revert).
    {
        const el = document.querySelector('#userContext')
        if (el && !el.value.trim()) {
            el.value = USER_CONTEXT_TEMPLATE
            el.dispatchEvent(new Event('change'))
        }
    }

    // --- Memory panel --------------------------------------------------------
    const memoryLongEl = document.querySelector('#memoryLong')
    const memoryShortEl = document.querySelector('#memoryShortPanel')
    const memoryLongCount = document.querySelector('#memoryLongCount')
    const memoryLongStatus = document.querySelector('#memoryLongStatus')
    let memoryEditing = false
    let memorySaveTimer = null

    async function refreshMemory() {
        const m = await getMemory()
        if (!memoryEditing && memoryLongEl) {
            memoryLongEl.value = (m.long || []).join('\n')
        }
        if (memoryLongCount) memoryLongCount.textContent = (m.long || []).length
        if (!memoryShortEl) return
        if (!m.short.length) {
            memoryShortEl.innerHTML = '<em style="color:var(--muted)">(no recent meetings yet)</em>'
            return
        }
        const esc = (s) => String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))
        // Render each meeting as an editable row (header + textarea + × delete).
        const parts = ['<ul style="list-style:none; padding:0; margin:0">']
        m.short.slice().reverse().forEach(s => {
            const date = new Date(s.ts).toISOString().split('T')[0]
            parts.push(`<li data-ts="${s.ts}" style="padding:6px 0; border-bottom:1px solid #eee">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px">
                    <b style="flex:1">${esc(date)} \u2014 ${esc(s.name)}</b>
                    <button class="subtle" data-short-delete="${s.ts}" title="Remove this meeting">\u00d7</button>
                </div>
                <textarea data-short-edit="${s.ts}" style="width:100%; min-height:48px; box-sizing:border-box; font-size:12px">${esc(s.summary)}</textarea>
            </li>`)
        })
        parts.push('</ul>')
        memoryShortEl.innerHTML = parts.join('')
        // Per-item delete.
        memoryShortEl.querySelectorAll('[data-short-delete]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const ts = Number(btn.getAttribute('data-short-delete'))
                const cur = await getMemory()
                await replaceMemory({ short: (cur.short || []).filter(x => x.ts !== ts) })
                refreshMemory()
            })
        })
        // Per-item inline edit + autosave (debounced).
        const editTimers = new Map()
        memoryShortEl.querySelectorAll('[data-short-edit]').forEach(ta => {
            const ts = Number(ta.getAttribute('data-short-edit'))
            ta.addEventListener('input', () => {
                clearTimeout(editTimers.get(ts))
                editTimers.set(ts, setTimeout(async () => {
                    const cur = await getMemory()
                    const next = (cur.short || []).map(x => x.ts === ts ? { ...x, summary: ta.value } : x)
                    await replaceMemory({ short: next })
                }, 500))
            })
        })
    }
    if (memoryLongEl) {
        memoryLongEl.addEventListener('focus', () => { memoryEditing = true })
        memoryLongEl.addEventListener('blur', () => { memoryEditing = false; refreshMemory() })
        memoryLongEl.addEventListener('input', () => {
            memoryEditing = true
            clearTimeout(memorySaveTimer)
            memorySaveTimer = setTimeout(async () => {
                const long = memoryLongEl.value.split('\n').map(s => s.trim()).filter(Boolean)
                await replaceMemory({ long })
                if (memoryLongCount) memoryLongCount.textContent = long.length
                if (memoryLongStatus) {
                    memoryLongStatus.classList.add('show')
                    setTimeout(() => memoryLongStatus.classList.remove('show'), 1200)
                }
            }, 400)
        })
    }
    document.querySelector('#memoryClear')?.remove()
    refreshMemory()

    // --- Knowledge (uploaded reference docs) -------------------------------
    // Storage: chrome.storage.local under 'knowledge' = { docs: [{id, name, size, addedAt, content}] }
    const KNOWLEDGE_MAX_BYTES = 5 * 1024 * 1024 // ~5MB
    async function getKnowledge() {
        return new Promise(r => chrome.storage.local.get('knowledge', x => r(x.knowledge || { docs: [] })))
    }
    async function setKnowledge(k) {
        return new Promise(r => chrome.storage.local.set({ knowledge: k }, r))
    }
    function bytesOf(s) { return new Blob([s || '']).size }
    function totalBytes(k) { return (k.docs || []).reduce((n, d) => n + bytesOf(d.content), 0) }
    function readFileAsText(f) {
        return new Promise((resolve, reject) => {
            const r = new FileReader()
            r.onerror = () => reject(r.error)
            r.onload = () => resolve(String(r.result || ''))
            r.readAsText(f)
        })
    }
    const knowledgeList = document.querySelector('#knowledgeList')
    const knowledgeUpload = document.querySelector('#knowledgeUpload')

    // Ask the LLM to build a tiny wiki entry for a doc — gets injected into
    // the system prompt so the agent knows what's in the corpus without
    // having to call recall_knowledge first.
    async function buildWikiEntry(name, content) {
        const sample = String(content || "").slice(0, 6000)
        const prompt = [
            `Build a one-paragraph wiki entry for the document "${name}".`,
            ``,
            `Output EXACTLY these 4 lines (no preamble, no markdown headers):`,
            `Title: <short descriptive title, ≤ 60 chars>`,
            `Keywords: <5–10 comma-separated terms / project names / acronyms>`,
            `Sections: <bulleted topics joined by " • ", ≤ 6 items>`,
            `Summary: <1–2 sentences, ≤ 200 chars>`,
            ``,
            `--- document begin ---`,
            sample,
            `--- document end ---`,
        ].join("\n")
        try {
            const txt = await relayChat(prompt, { temperature: 0.2 })
            return String(txt || "").trim().slice(0, 600)
        } catch (e) {
            console.warn("buildWikiEntry failed", e)
            return ""
        }
    }

    async function refreshKnowledge() {
        if (!knowledgeList) return
        const k = await getKnowledge()
        const total = totalBytes(k)
        const totalKb = (total / 1024).toFixed(1)
        const esc = (s) => String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))
        if (!k.docs.length) {
            knowledgeList.innerHTML = '<em style="color:var(--muted)">(no docs yet)</em>'
            return
        }
        const parts = [`<div style="font-size:12px; color:var(--muted); margin-bottom:6px">${k.docs.length} doc(s), ${totalKb} KB</div>`]
        parts.push('<ul style="list-style:none; padding:0; margin:0">')
        for (const d of k.docs) {
            const kb = ((d.size || 0) / 1024).toFixed(1)
            const indexed = d.wikiEntry ? '<span title="indexed" style="color:#16a34a">●</span>' : '<span title="no index — click Rebuild" style="color:#9ca3af">○</span>'
            const wiki = d.wikiEntry ? `<div style="font-size:11px; color:var(--muted); margin:2px 0 0 14px; white-space:pre-wrap; max-height:60px; overflow:hidden">${esc(d.wikiEntry)}</div>` : ''
            parts.push(`<li style="padding:6px 0; border-bottom:1px solid #eee">
                <div style="display:flex; align-items:center; gap:8px">
                    ${indexed}
                    <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${esc(d.name)}</span>
                    <span style="font-size:11px; color:var(--muted)">${kb} KB</span>
                    <button class="subtle" data-knowledge-rebuild="${esc(d.id)}">Re-index</button>
                    <button class="subtle" data-knowledge-delete="${esc(d.id)}">Remove</button>
                </div>
                ${wiki}
            </li>`)
        }
        parts.push('</ul>')
        knowledgeList.innerHTML = parts.join('')
        knowledgeList.querySelectorAll('[data-knowledge-delete]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-knowledge-delete')
                const cur = await getKnowledge()
                cur.docs = (cur.docs || []).filter(d => d.id !== id)
                await setKnowledge(cur)
                refreshKnowledge()
            })
        })
        knowledgeList.querySelectorAll('[data-knowledge-rebuild]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-knowledge-rebuild')
                btn.disabled = true; btn.textContent = '…'
                const cur = await getKnowledge()
                const d = (cur.docs || []).find(x => x.id === id)
                if (!d) return
                d.wikiEntry = await buildWikiEntry(d.name, d.content)
                await setKnowledge(cur)
                refreshKnowledge()
            })
        })
    }
    if (knowledgeUpload) {
        knowledgeUpload.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files || [])
            if (!files.length) return
            const cur = await getKnowledge()
            cur.docs = cur.docs || []
            const fresh = []
            for (const f of files) {
                try {
                    if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
                        alert(`Skipping ${f.name} \u2014 PDF text extraction not yet supported. Convert to .txt or .md first (try convertio.co).`)
                        continue
                    }
                    const content = await readFileAsText(f)
                    if (!content.trim()) { alert(`Skipping ${f.name} \u2014 empty`); continue }
                    if (totalBytes(cur) + bytesOf(content) > KNOWLEDGE_MAX_BYTES) {
                        alert(`Skipping ${f.name} \u2014 would exceed 5 MB total cap`)
                        continue
                    }
                    const doc = {
                        id: `k-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                        name: f.name,
                        size: bytesOf(content),
                        addedAt: Date.now(),
                        content,
                        wikiEntry: "",
                    }
                    cur.docs.push(doc)
                    fresh.push(doc)
                } catch (err) {
                    console.warn('knowledge upload failed', f.name, err)
                    alert(`Failed to read ${f.name}: ${err.message || err}`)
                }
            }
            await setKnowledge(cur)
            knowledgeUpload.value = ''
            refreshKnowledge()
            // Build wiki entries in the background — let user see the list
            // appear first; then progressively fill in the index.
            for (const d of fresh) {
                const entry = await buildWikiEntry(d.name, d.content)
                if (!entry) continue
                const k2 = await getKnowledge()
                const target = (k2.docs || []).find(x => x.id === d.id)
                if (target) {
                    target.wikiEntry = entry
                    await setKnowledge(k2)
                    refreshKnowledge()
                }
            }
        })
    }
    refreshKnowledge()

    return 
    uiContainer=document.createElement('div')
    uiContainer.id="uiContainer"
    document.body.appendChild(uiContainer)

    const transcripts=[
        {Time:since(startTime),  Name:"Tom",           Text:"Great deal. let's move to next topic"},
        {Time:since(startTime),  Name:"Jeff",          Text:"next topic is to discuss how to implement table of content."},
        {Time:since(startTime),  Name:conf.author,    Text:"TOC is a dynamic collecting feature, there's nothing to do other than leave a flag somewhere in a document."},
    ]

    document.addEventListener('confChange',({detail:{key, conf}})=>{
        uiContainer.innerHTML=""
        createUI({uiContainer, transcripts, history:[]})
            .finally(()=>uiContainer.querySelector('#aiChatButton').click())
    })
    
})
