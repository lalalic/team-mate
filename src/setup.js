const { initSetupPage, changeConf, normalizeShortcuts, FREE_SHORTCUT_SHOW_LIMIT, relayChat, fetchModels, reorganizeKnowledge, mergeKnowledgeDocs, parseKnowledgeTree } = require("./util")
const { getPremiumStatus, openPremiumUpgrade, openPremiumLogin, setPremiumPreview, activateStripeSession } = require("./premium")
const { extractStripeSessionId, extractStripePurchaseMode } = require("./premium-state")

document.addEventListener('DOMContentLoaded', async () => {
    const conf = await initSetupPage()
    const feedbackLink = document.querySelector('#feedbackLink')
    if (feedbackLink) {
        feedbackLink.href = 'https://github.com/lalalic/team-mate'
    }

    const uiLanguage = chrome.i18n.getUILanguage?.() || navigator.language || 'en'
    const browserLanguageOption = document.querySelector('#browserLanguageOption')
    if (browserLanguageOption) {
        const label = chrome.i18n.getMessage('browserLanguage') || 'Browser language'
        browserLanguageOption.textContent = `${label} (${uiLanguage})`
    }

    // --- Premium --------------------------------------------------------------
    let premiumState = { paid: false, configured: false, preview: false }
    const premiumStatusText = document.querySelector('#premiumStatusText')
    const premiumOneTime = document.querySelector('#premiumOneTime')
    const premiumWeekly = document.querySelector('#premiumWeekly')
    const premiumLogin = document.querySelector('#premiumLogin')
    const premiumRefresh = document.querySelector('#premiumRefresh')
    const premiumPreview = document.querySelector('#premiumPreview')
    const premiumStructuredReport = document.querySelector('#premiumStructuredReport')
    const shortcutsList = document.querySelector('#shortcutsList')
    const shortcutLimitStatus = document.querySelector('#shortcutLimitStatus')
    const stripeSessionId = extractStripeSessionId(window.location)
    const stripePurchaseMode = extractStripePurchaseMode(window.location)
    if (stripeSessionId) {
        try {
            await activateStripeSession(stripeSessionId, stripePurchaseMode)
            window.history.replaceState({}, document.title, window.location.pathname)
        } catch (e) { console.warn('[meetmate] Stripe activation failed', e) }
    }
    const escapeAttr = (s) => String(s == null ? "" : s)
        .replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]))

    function renderPremiumState() {
        const paid = premiumState?.paid === true
        if (premiumStatusText) {
            premiumStatusText.classList.toggle('active', paid)
            premiumStatusText.textContent = paid
                ? `Premium active${premiumState.preview ? ' · local preview' : premiumState.purchaseMode === 'weekly' ? ' · 1.99$/week' : premiumState.purchaseMode === 'one_time' ? ' · 1.99$ one time' : ''}`
                : (premiumState.configured ? 'Free plan · up to 3 shown shortcuts' : 'Payment not configured in this build · Free plan')
        }
        if (premiumOneTime) premiumOneTime.style.display = (!paid && premiumState.configuredModes?.includes('one_time')) ? '' : 'none'
        if (premiumWeekly) premiumWeekly.style.display = (!paid && premiumState.configuredModes?.includes('weekly')) ? '' : 'none'
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

    premiumOneTime?.addEventListener('click', async () => {
        try { await openPremiumUpgrade('one_time') }
        catch (e) { alert(e?.message || String(e)) }
    })
    premiumWeekly?.addEventListener('click', async () => {
        try { await openPremiumUpgrade('weekly') }
        catch (e) { alert(e?.message || String(e)) }
    })
    premiumLogin?.addEventListener('click', async () => {
        try { await openPremiumLogin() }
        catch (e) { alert(e?.message || String(e)) }
    })
    premiumRefresh?.addEventListener('click', async () => {
        premiumRefresh.disabled = true
        await refreshPremium({ force: true })
        refreshKnowledge().catch(() => {})
        premiumRefresh.disabled = false
        renderShortcuts(normalizeShortcuts((await new Promise(r => chrome.storage.local.get('conf', x => r((x.conf || {}).shortcuts)) )) || null))
    })
    premiumPreview?.addEventListener('click', async () => {
        try {
            premiumState = await setPremiumPreview(!(premiumState?.preview === true))
            renderPremiumState()
            refreshKnowledge().catch(() => {})
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
        const visible = modelOptions
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
    async function getKnowledge() {
        return new Promise(r => chrome.storage.local.get('knowledge', x => r(x.knowledge || { docs: [] })))
    }
    async function setKnowledge(k) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.set({ knowledge: k }, () => {
                const err = chrome.runtime.lastError
                if (err) return reject(new Error(err.message || 'Local storage capacity exceeded'))
                resolve()
            })
        })
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
    const knowledgeTree = document.querySelector('#knowledgeTree')
    const knowledgeUpload = document.querySelector('#knowledgeUpload')
    const knowledgeStatus = document.querySelector('#knowledgeStatus')
    const knowledgePremiumNote = document.querySelector('#knowledgePremiumNote')

    async function reorganizeCurrentKnowledge() {
        const cur = await getKnowledge()
        if (!(cur.docs || []).length) {
            cur.organized = ''
            cur.organizedTree = null
            cur.organizedStatus = 'empty'
            delete cur.organizedError
            cur.organizedAt = Date.now()
            await setKnowledge(cur)
            if (knowledgeStatus) knowledgeStatus.textContent = 'No organized knowledge yet.'
            return
        }
        if (knowledgeStatus) knowledgeStatus.textContent = 'Reorganizing current knowledge…'
        cur.organizedStatus = 'organizing'
        await setKnowledge(cur)
        try {
            const organized = await reorganizeKnowledge()
            const latest = await getKnowledge()
            latest.organizedTree = organized.tree
            latest.organized = organized.markdown
            latest.organizedStatus = 'ready'
            delete latest.organizedError
            latest.organizedAt = Date.now()
            await setKnowledge(latest)
            if (knowledgeStatus) knowledgeStatus.textContent = 'Knowledge organized from current files.'
        } catch (err) {
            const latest = await getKnowledge()
            latest.organizedStatus = 'failed'
            latest.organizedError = err?.message || String(err)
            await setKnowledge(latest)
            if (knowledgeStatus) knowledgeStatus.textContent = `Knowledge changed, but reorganization failed: ${latest.organizedError}`
        }
    }

    // Raw files remain local. A model call happens only after the user explicitly
    // changes the library, to rebuild the organized knowledge from current files.
    async function refreshKnowledge() {
        if (!knowledgeList) return
        const paid = premiumState?.paid === true
        if (knowledgeUpload) knowledgeUpload.disabled = !paid
        if (knowledgePremiumNote) knowledgePremiumNote.style.display = paid ? 'none' : ''
        const k = await getKnowledge()
        const total = totalBytes(k)
        const totalKb = (total / 1024).toFixed(1)
        const esc = (s) => String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))
        if (knowledgeTree) {
            const tree = k.organizedTree?.roots ? { title: 'Knowledge', children: k.organizedTree.roots, content: [] } : parseKnowledgeTree(k.organized)
            const renderNode = (node) => `<details class="knowledge-tree-node" data-knowledge-node><summary>${esc(node.title)}</summary>${
                node.content.length ? `<div class="knowledge-tree-content">${node.content.map(line => `<div>${esc(line)}</div>`).join('')}</div>` : ''
            }${node.children.map(renderNode).join('')}</details>`
            knowledgeTree.innerHTML = tree
                ? `<div class="knowledge-tree" aria-label="Organized knowledge">${tree.children.map(renderNode).join('')}</div>`
                : ''
        }
        if (!k.docs.length) {
            knowledgeList.innerHTML = '<em style="color:var(--muted)">(no docs yet)</em>'
            if (knowledgeStatus) knowledgeStatus.textContent = 'No organized knowledge yet.'
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
                    <button class="subtle" data-knowledge-delete="${esc(d.id)}" ${paid ? '' : 'disabled'}>Remove</button>
                </div>
            </li>`)
        }
        parts.push('</ul>')
        knowledgeList.innerHTML = parts.join('')
        if (knowledgeStatus) {
            knowledgeStatus.textContent = k.organizedStatus === 'organizing'
                ? 'Reorganizing current knowledge…'
                : k.organizedStatus === 'failed'
                    ? `Knowledge changed, but reorganization failed: ${k.organizedError || 'unknown error'}`
                    : k.organized
                        ? 'Knowledge organized from current files.'
                        : 'Knowledge has not been organized yet.'
        }
        knowledgeList.querySelectorAll('[data-knowledge-delete]').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (premiumState?.paid !== true) return
                const id = btn.getAttribute('data-knowledge-delete')
                const cur = await getKnowledge()
                cur.docs = (cur.docs || []).filter(d => d.id !== id)
                try {
                    await setKnowledge(cur)
                    await reorganizeCurrentKnowledge()
                } catch (err) {
                    alert(`Could not update knowledge library — browser storage is full or unavailable: ${err.message || err}`)
                }
                refreshKnowledge()
            })
        })
    }
    if (knowledgeUpload) {
        knowledgeUpload.addEventListener('change', async (e) => {
            if (premiumState?.paid !== true) { alert('Knowledge Library is a Premium feature.'); knowledgeUpload.value = ''; return }
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
                    const doc = {
                        id: `k-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                        name: f.name,
                        size: bytesOf(content),
                        addedAt: Date.now(),
                        content,
                    }
                    cur.docs = mergeKnowledgeDocs(cur.docs, [doc])
                } catch (err) {
                    console.warn('knowledge upload failed', f.name, err)
                    alert(`Failed to read ${f.name}: ${err.message || err}`)
                }
            }
            try {
                await setKnowledge(cur)
                await reorganizeCurrentKnowledge()
            } catch (err) {
                alert(`Could not save knowledge library — browser storage is full or unavailable: ${err.message || err}`)
            }
            knowledgeUpload.value = ''
            refreshKnowledge()
        })
    }
    refreshKnowledge()
})
