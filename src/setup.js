const { initSetupPage, changeConf, normalizeShortcuts, FREE_SHORTCUT_SHOW_LIMIT, relayChat, fetchModels } = require("./util")
const { getPremiumStatus, openPremiumUpgrade, openPremiumLogin, setPremiumPreview } = require("./premium")

document.addEventListener('DOMContentLoaded', async () => {
    const conf = await initSetupPage()

    const uiLanguage = chrome.i18n.getUILanguage?.() || navigator.language || 'en'
    const browserLanguageOption = document.querySelector('#browserLanguageOption')
    if (browserLanguageOption) {
        const label = chrome.i18n.getMessage('browserLanguage') || 'Browser language'
        browserLanguageOption.textContent = `${label} (${uiLanguage})`
    }

    // --- Premium --------------------------------------------------------------
    let premiumState = { paid: false, configured: false, preview: false }
    const premiumStatusText = document.querySelector('#premiumStatusText')
    const premiumUpgrade = document.querySelector('#premiumUpgrade')
    const premiumLogin = document.querySelector('#premiumLogin')
    const premiumRefresh = document.querySelector('#premiumRefresh')
    const premiumPreview = document.querySelector('#premiumPreview')
    const premiumStructuredReport = document.querySelector('#premiumStructuredReport')
    const shortcutsList = document.querySelector('#shortcutsList')
    const shortcutLimitStatus = document.querySelector('#shortcutLimitStatus')
    const escapeAttr = (s) => String(s == null ? "" : s)
        .replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]))

    function renderPremiumState() {
        const paid = premiumState?.paid === true
        if (premiumStatusText) {
            premiumStatusText.classList.toggle('active', paid)
            premiumStatusText.textContent = paid
                ? `Premium active${premiumState.preview ? ' · local preview' : ''}`
                : (premiumState.configured ? 'Free plan · up to 3 shown shortcuts' : 'Payment not configured in this build · Free plan')
        }
        if (premiumUpgrade) premiumUpgrade.style.display = (!paid && premiumState.configured) ? '' : 'none'
        if (premiumStructuredReport) premiumStructuredReport.disabled = !paid
        if (premiumLogin) premiumLogin.style.display = (!paid && premiumState.configured) ? '' : 'none'
        if (premiumPreview) {
            premiumPreview.style.display = premiumState.configured ? 'none' : ''
            premiumPreview.textContent = premiumState.preview ? 'Disable Premium Preview' : 'Enable Premium Preview'
        }
    }

    async function refreshPremium({ force = false } = {}) {
        try { premiumState = await getPremiumStatus({ force }) }
        catch (e) { premiumState = { paid: false, configured: false, preview: false, error: e?.message || String(e) } }
        renderPremiumState()
        return premiumState
    }

    premiumUpgrade?.addEventListener('click', async () => {
        try { await openPremiumUpgrade() }
        catch (e) { alert(e?.message || String(e)) }
    })
    premiumLogin?.addEventListener('click', async () => {
        try { await openPremiumLogin() }
        catch (e) { alert(e?.message || String(e)) }
    })
    premiumRefresh?.addEventListener('click', async () => {
        premiumRefresh.disabled = true
        await refreshPremium({ force: true })
        premiumRefresh.disabled = false
        renderShortcuts(normalizeShortcuts((await new Promise(r => chrome.storage.local.get('conf', x => r((x.conf || {}).shortcuts)) )) || null))
    })
    premiumPreview?.addEventListener('click', async () => {
        try {
            premiumState = await setPremiumPreview(!(premiumState?.preview === true))
            renderPremiumState()
            renderShortcuts(normalizeShortcuts((await new Promise(r => chrome.storage.local.get('conf', x => r((x.conf || {}).shortcuts)) )) || null))
        } catch (e) { alert(e?.message || String(e)) }
    })
    await refreshPremium()

    // --- Direct provider / BYOK ---------------------------------------------
    const testBtn = document.querySelector('#testConnection')
    const testStatus = document.querySelector('#testStatus')
    if (testBtn) {
        testBtn.addEventListener('click', async () => {
            testBtn.disabled = true
            if (testStatus) {
                testStatus.textContent = 'Testing…'
                testStatus.style.color = 'var(--muted)'
            }
            try {
                const answer = await relayChat('Reply with exactly: OK', {
                    systemMessage: 'You are a connection test. Follow the user instruction exactly.',
                })
                if (testStatus) {
                    testStatus.textContent = answer ? `Connected · ${String(answer).trim().slice(0, 80)}` : 'Connected'
                    testStatus.style.color = 'var(--good)'
                }
            } catch (err) {
                if (testStatus) {
                    testStatus.textContent = err?.message || String(err)
                    testStatus.style.color = '#b91c1c'
                }
            } finally {
                testBtn.disabled = false
            }
        })
    }

    // --- Model picker --------------------------------------------------------
    const modelSelect = document.querySelector('#modelName')
    const modelFilter = document.querySelector('#modelFilter')
    const customModelInput = document.querySelector('#customModelName')
    const baseURLInput = document.querySelector('#baseURL')
    const apiKeyInput = document.querySelector('#apiKey')
    const modelStatus = document.querySelector('#modelStatus')
    const refreshModelsBtn = document.querySelector('#refreshModels')

    function isOpenRouter() {
        return /(^|\.)openrouter\.ai$/i.test((() => {
            try { return new URL(baseURLInput?.value || '').hostname } catch { return '' }
        })())
    }

    function modelLabel(model) {
        const id = String(model?.id || model || '')
        const name = String(model?.name || '')
        return name && name !== id ? `${name} — ${id}` : id
    }

    let modelOptions = []

    function renderModelOptions(selected = modelSelect?.value || '') {
        if (!modelSelect) return
        const query = String(modelFilter?.value || '').trim().toLowerCase()
        const visible = query ? modelOptions.filter(item => `${item.id} ${item.label}`.toLowerCase().includes(query)) : modelOptions
        modelSelect.innerHTML = ''
        for (const item of visible) {
            const opt = document.createElement('option')
            opt.value = item.id
            opt.textContent = item.label
            modelSelect.appendChild(opt)
        }
        const custom = document.createElement('option')
        custom.value = 'custom'
        custom.textContent = 'Custom model…'
        modelSelect.appendChild(custom)
        if (visible.some(item => item.id === selected)) modelSelect.value = selected
        else if (selected && modelOptions.some(item => item.id === selected)) {
            const current = modelOptions.find(item => item.id === selected)
            const opt = document.createElement('option')
            opt.value = current.id; opt.textContent = `✓ ${current.label}`; modelSelect.insertBefore(opt, modelSelect.firstChild); modelSelect.value = selected
        }
    }

    async function populateModels({ preserve = true } = {}) {
        if (!modelSelect || !customModelInput) return
        const selected = preserve ? String((await new Promise(r => chrome.storage.local.get('conf', x => r(x.conf || {})))).modelName || modelSelect.value || 'openrouter/auto') : ''
        if (modelStatus) modelStatus.textContent = 'Loading models…'
        if (refreshModelsBtn) refreshModelsBtn.disabled = true

        let models = []
        let error = ''
        try {
            models = await fetchModels()
        } catch (err) {
            error = err?.message || String(err)
        }

        const seen = new Set()
        const options = []
        const add = (id, label = id) => {
            id = String(id || '').trim()
            if (!id || seen.has(id)) return
            seen.add(id)
            options.push({ id, label })
        }

        if (isOpenRouter()) {
            add('openrouter/auto', 'openrouter/auto — Auto router')
            add('openrouter/free', 'openrouter/free — Free router')
        }
        models
            .slice()
            .sort((a, b) => String(a?.name || a?.id || '').localeCompare(String(b?.name || b?.id || '')))
            .forEach(m => add(m?.id, modelLabel(m)))

        modelOptions = options
        renderModelOptions(selected)

        if (selected && seen.has(selected)) {
            modelSelect.value = selected
            customModelInput.style.display = 'none'
        } else if (selected && selected !== 'custom') {
            modelSelect.value = 'custom'
            customModelInput.style.display = ''
            customModelInput.value = selected
        } else if (options.length) {
            modelSelect.value = options[0].id
            customModelInput.style.display = 'none'
            await changeConf({ modelName: options[0].id })
        } else {
            modelSelect.value = 'custom'
            customModelInput.style.display = ''
        }

        if (modelStatus) {
            modelStatus.textContent = error ? `Could not load /models: ${error}` : `${models.length} models from /models`
            modelStatus.style.color = error ? '#b91c1c' : 'var(--muted)'
        }
        if (refreshModelsBtn) refreshModelsBtn.disabled = false
    }

    if (modelSelect && customModelInput) {
        modelSelect.addEventListener('change', async () => {
            if (modelSelect.value === 'custom') {
                customModelInput.style.display = ''
                customModelInput.focus()
                return
            }
            customModelInput.style.display = 'none'
            await changeConf({ modelName: modelSelect.value })
        })
        customModelInput.addEventListener('change', async () => {
            const value = customModelInput.value.trim()
            if (value) await changeConf({ modelName: value })
        })
        modelFilter?.addEventListener('input', () => renderModelOptions(modelSelect.value))
        refreshModelsBtn?.addEventListener('click', () => populateModels())
        baseURLInput?.addEventListener('change', () => setTimeout(() => populateModels(), 0))
        apiKeyInput?.addEventListener('change', () => setTimeout(() => populateModels(), 0))
        await populateModels()
    }

    // --- Shortcuts (the rail's one-tap asks) --------------------------------
    // Storage: conf.shortcuts = [{label, prompt, show}]. Hidden shortcuts remain
    // in the library but are inactive in the meeting rail.
    function applyPlanShowLimit(list) {
        const items = (Array.isArray(list) ? list : []).map(s => ({ ...s }))
        if (premiumState?.paid === true) return items
        let shown = 0
        return items.map(s => {
            if (s.show === false) return s
            shown++
            if (shown <= FREE_SHORTCUT_SHOW_LIMIT) return s
            return { ...s, show: false }
        })
    }

    function updateShortcutLimitStatus(list) {
        if (!shortcutLimitStatus) return
        const shown = (Array.isArray(list) ? list : []).filter(s => s.show !== false).length
        shortcutLimitStatus.classList.remove('warn')
        if (premiumState?.paid === true) {
            shortcutLimitStatus.textContent = `${shown} shown · Premium has no shortcut limit.`
        } else {
            shortcutLimitStatus.textContent = `${shown}/${FREE_SHORTCUT_SHOW_LIMIT} shown · Free plan. Premium removes the limit.`
        }
    }

    async function saveShortcutRows(list) {
        const clean = (Array.isArray(list) ? list : [])
            .map(s => {
                const show = s?.show !== false
                return {
                    label: String((s && s.label) || '').trim(),
                    prompt: String((s && s.prompt) || '').trim(),
                    show,
                }
            })
            .filter(s => s.label || s.prompt)
        const limited = applyPlanShowLimit(clean)
        await changeConf({ shortcuts: limited })
        updateShortcutLimitStatus(limited)
        return limited
    }

    function readShortcutRows() {
        if (!shortcutsList) return []
        return Array.from(shortcutsList.querySelectorAll('[data-shortcut-row]')).map(row => {
            const show = !!row.querySelector('[data-shortcut-show]')?.checked
            return {
                label: row.querySelector('[data-shortcut-label]').value,
                prompt: row.querySelector('[data-shortcut-prompt]').value,
                show,
            }
        })
    }

    function renderShortcuts(list) {
        if (!shortcutsList) return
        let items = (Array.isArray(list) && list.length)
            ? list.map(s => ({
                label: String(s?.label || ''),
                prompt: String(s?.prompt || ''),
                show: s?.show !== false,
            }))
            : normalizeShortcuts(null)
        items = applyPlanShowLimit(items)
        shortcutsList.innerHTML = ''
        items.forEach((s, i) => {
            const row = document.createElement('div')
            row.className = 'shortcut-row'
            row.setAttribute('data-shortcut-row', '')
            const showHelp = premiumState?.paid
                ? 'Show this shortcut in the meeting rail'
                : `Show this shortcut in the meeting rail. Free plan can show up to ${FREE_SHORTCUT_SHOW_LIMIT}.`
            row.innerHTML = `
                <input type="text" data-shortcut-label maxlength="24"
                    value="${escapeAttr(s.label)}" placeholder="Label" />
                <input type="text" data-shortcut-prompt
                    value="${escapeAttr(s.prompt)}" placeholder="Question sent to the assistant" />
                <label class="shortcut-toggle" title="${escapeAttr(showHelp)}" aria-label="${escapeAttr(showHelp)}">
                    <input type="checkbox" data-shortcut-show ${s.show !== false ? 'checked' : ''} />
                </label>
                <button class="subtle" data-shortcut-remove title="Remove">×</button>
            `

            const showInput = row.querySelector('[data-shortcut-show]')
            showInput.addEventListener('change', async () => {
                if (showInput.checked && premiumState?.paid !== true) {
                    const currentlyShown = readShortcutRows().filter(x => x.show).length
                    if (currentlyShown > FREE_SHORTCUT_SHOW_LIMIT) {
                        showInput.checked = false
                        if (shortcutLimitStatus) {
                            shortcutLimitStatus.textContent = `Free plan can show up to ${FREE_SHORTCUT_SHOW_LIMIT} shortcuts. Upgrade to show more.`
                            shortcutLimitStatus.classList.add('warn')
                        }
                        return
                    }
                }
                const saved = await saveShortcutRows(readShortcutRows())
                renderShortcuts(saved)
            })
            row.querySelector('[data-shortcut-remove]').addEventListener('click', async () => {
                const next = readShortcutRows().filter((_, idx) => idx !== i)
                const saved = await saveShortcutRows(next)
                renderShortcuts(saved)
            })
            shortcutsList.appendChild(row)
        })

        const actions = document.createElement('div')
        actions.className = 'shortcut-actions'
        const addBtn = document.createElement('button')
        addBtn.className = 'subtle'
        addBtn.textContent = chrome.i18n.getMessage('addShortcut') || '+ Add shortcut'
        addBtn.addEventListener('click', async () => {
            const current = await saveShortcutRows(readShortcutRows())
            const shown = current.filter(s => s.show !== false).length
            const show = premiumState?.paid === true || shown < FREE_SHORTCUT_SHOW_LIMIT
            renderShortcuts(current.concat([{ label: chrome.i18n.getMessage('newShortcut') || 'New', prompt: '', show }]))
        })
        const resetBtn = document.createElement('button')
        resetBtn.className = 'subtle'
        resetBtn.textContent = chrome.i18n.getMessage('resetShortcuts') || 'Reset to defaults'
        resetBtn.addEventListener('click', async () => {
            if (!confirm(chrome.i18n.getMessage('resetShortcutsConfirm') || 'Replace your shortcuts with the defaults?')) return
            const defaults = applyPlanShowLimit(normalizeShortcuts(null))
            await changeConf({ shortcuts: defaults })
            renderShortcuts(defaults)
        })
        actions.appendChild(addBtn)
        actions.appendChild(resetBtn)
        shortcutsList.appendChild(actions)

        let saveTimer = null
        shortcutsList.querySelectorAll('[data-shortcut-label], [data-shortcut-prompt]').forEach(inp => {
            inp.addEventListener('input', () => {
                clearTimeout(saveTimer)
                saveTimer = setTimeout(() => { saveShortcutRows(readShortcutRows()) }, 500)
            })
        })
        updateShortcutLimitStatus(items)
    }
    renderShortcuts(normalizeShortcuts((conf && conf.shortcuts) || null))

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

    // Uploads are local-only: the raw text is stored and TF-IDF retrieval runs
    // at ask time. No model call happens on upload.
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
            parts.push(`<li style="padding:6px 0; border-bottom:1px solid #eee">
                <div style="display:flex; align-items:center; gap:8px">
                    <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${esc(d.name)}</span>
                    <span style="font-size:11px; color:var(--muted)">${kb} KB</span>
                    <button class="subtle" data-knowledge-delete="${esc(d.id)}">Remove</button>
                </div>
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
    }
    if (knowledgeUpload) {
        knowledgeUpload.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files || [])
            if (!files.length) return
            const cur = await getKnowledge()
            cur.docs = cur.docs || []
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
                    }
                    cur.docs.push(doc)
                } catch (err) {
                    console.warn('knowledge upload failed', f.name, err)
                    alert(`Failed to read ${f.name}: ${err.message || err}`)
                }
            }
            await setKnowledge(cur)
            knowledgeUpload.value = ''
            refreshKnowledge()
        })
    }
    refreshKnowledge()
})
