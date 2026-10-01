const { initSetupPage, changeConf, normalizeShortcuts, FREE_SHORTCUT_SHOW_LIMIT, relayChat, fetchModels, reorganizeKnowledge, testKnowledgeQnA, mergeKnowledgeDocs } = require("./util")
const { getPremiumStatus, openPremiumUpgrade, openPremiumLogin, setPremiumPreview, activateStripeSession } = require("./premium")
const { extractStripeSessionId, extractStripePurchaseMode } = require("./premium-state")

document.addEventListener('DOMContentLoaded', async () => {
    const conf = await initSetupPage()
    const feedbackLink = document.querySelector('#feedbackLink')

    const settingsTabs = Array.from(document.querySelectorAll('[data-settings-tab]'))
    const settingsPanels = Array.from(document.querySelectorAll('[data-settings-panel]'))
    function selectSettingsTab(name, { persist = true } = {}) {
        const target = settingsTabs.some(tab => tab.dataset.settingsTab === name) ? name : 'general'
        settingsTabs.forEach(tab => {
            const active = tab.dataset.settingsTab === target
            tab.classList.toggle('active', active)
            tab.setAttribute('aria-selected', active ? 'true' : 'false')
            tab.tabIndex = active ? 0 : -1
        })
        settingsPanels.forEach(panel => {
            panel.hidden = panel.dataset.settingsPanel !== target
        })
        if (persist) chrome.storage.local.set({ settingsTab: target })
    }
    settingsTabs.forEach((tab, index) => {
        tab.addEventListener('click', () => selectSettingsTab(tab.dataset.settingsTab))
        tab.addEventListener('keydown', (event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
            event.preventDefault()
            let next = index
            if (event.key === 'ArrowLeft') next = (index - 1 + settingsTabs.length) % settingsTabs.length
            if (event.key === 'ArrowRight') next = (index + 1) % settingsTabs.length
            if (event.key === 'Home') next = 0
            if (event.key === 'End') next = settingsTabs.length - 1
            const nextTab = settingsTabs[next]
            selectSettingsTab(nextTab.dataset.settingsTab)
            nextTab.focus()
        })
    })
    chrome.storage.local.get('settingsTab', x => selectSettingsTab(x.settingsTab || 'general', { persist: false }))
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
        if (premiumOneTime) {
            premiumOneTime.style.display = paid ? 'none' : ''
            premiumOneTime.disabled = !premiumState.configuredModes?.includes('one_time')
            premiumOneTime.title = premiumOneTime.disabled ? 'Unavailable in this build.' : ''
        }
        if (premiumWeekly) {
            premiumWeekly.style.display = paid ? 'none' : ''
            premiumWeekly.disabled = !premiumState.configuredModes?.includes('weekly')
            premiumWeekly.title = premiumWeekly.disabled ? 'Unavailable in this build.' : ''
        }
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
    const knowledgeUpload = document.querySelector('#knowledgeUpload')
    const knowledgeStatus = document.querySelector('#knowledgeStatus')
    const knowledgeTestQuestion = document.querySelector('#knowledgeTestQuestion')
    const knowledgeTestBtn = document.querySelector('#knowledgeTestBtn')
    const knowledgeTestAnswer = document.querySelector('#knowledgeTestAnswer')
    const knowledgeOrganizeBtn = document.querySelector('#knowledgeOrganizeBtn')
    const knowledgeTree = document.querySelector('#knowledgeTree')
    const knowledgeNodeModal = document.querySelector('#knowledgeNodeModal')
    const knowledgeNodeModalTitle = document.querySelector('#knowledgeNodeModalTitle')
    const knowledgeNodeModalSummary = document.querySelector('#knowledgeNodeModalSummary')
    const knowledgeNodeModalContent = document.querySelector('#knowledgeNodeModalContent')
    const knowledgeNodeModalClose = document.querySelector('#knowledgeNodeModalClose')
    const knowledgePlanNote = document.querySelector('#knowledgePlanNote')

    function openKnowledgeNode(node, k) {
        if (!knowledgeNodeModal || !node) return
        if (knowledgeNodeModalTitle) knowledgeNodeModalTitle.textContent = node.name || 'Knowledge'
        if (knowledgeNodeModalSummary) knowledgeNodeModalSummary.textContent = node.summary || ''
        if (knowledgeNodeModalContent) knowledgeNodeModalContent.textContent = String(k?.nodeContents?.[node.id] || '(no organized content for this node)')
        knowledgeNodeModal.hidden = false
    }

    function closeKnowledgeNode() {
        if (knowledgeNodeModal) knowledgeNodeModal.hidden = true
    }

    knowledgeNodeModalClose?.addEventListener('click', closeKnowledgeNode)
    knowledgeNodeModal?.addEventListener('click', (event) => {
        if (event.target === knowledgeNodeModal) closeKnowledgeNode()
    })
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && knowledgeNodeModal && !knowledgeNodeModal.hidden) closeKnowledgeNode()
    })

    function renderOrganizedKnowledge(k) {
        if (!knowledgeTree) return
        knowledgeTree.innerHTML = ''
        const tree = Array.isArray(k?.tree) ? k.tree : []
        if (!tree.length) {
            knowledgeTree.innerHTML = '<em style="color:var(--muted)">(organized knowledge not ready)</em>'
            return
        }
        if (k.organizedStatus === 'stale') {
            const stale = document.createElement('div')
            stale.className = 'hint'
            stale.style.marginBottom = '10px'
            stale.textContent = 'Files changed. This TOC is stale — click Organize now to rebuild it.'
            knowledgeTree.appendChild(stale)
        }
        for (const group of tree) {
            const section = document.createElement('section')
            section.style.borderBottom = '1px solid var(--border)'
            section.style.padding = '8px 0'
            const head = document.createElement('button')
            head.type = 'button'
            head.className = 'subtle'
            head.style.fontWeight = '700'
            head.style.width = '100%'
            head.style.textAlign = 'left'
            head.textContent = '▾ ' + String(group.name || 'Untitled')
            const summary = document.createElement('div')
            summary.className = 'hint'
            summary.style.margin = '4px 0 6px 22px'
            summary.textContent = String(group.summary || '')
            const children = document.createElement('div')
            children.style.marginLeft = '18px'
            for (const node of Array.isArray(group.children) ? group.children : []) {
                const btn = document.createElement('button')
                btn.type = 'button'
                btn.className = 'subtle'
                btn.style.display = 'block'
                btn.style.width = '100%'
                btn.style.textAlign = 'left'
                btn.style.margin = '4px 0'
                btn.innerHTML = `<strong>${escapeAttr(node.name || 'Untitled')}</strong>${node.summary ? `<span class="hint"> · ${escapeAttr(node.summary)}</span>` : ''}`
                btn.addEventListener('click', () => openKnowledgeNode(node, k))
                children.appendChild(btn)
            }
            head.addEventListener('click', () => {
                const hidden = children.style.display === 'none'
                children.style.display = hidden ? '' : 'none'
                summary.style.display = hidden ? '' : 'none'
                head.textContent = (hidden ? '▾ ' : '▸ ') + String(group.name || 'Untitled')
            })
            section.appendChild(head)
            section.appendChild(summary)
            section.appendChild(children)
            knowledgeTree.appendChild(section)
        }
    }

    function markKnowledgeStale(k) {
        if (Array.isArray(k?.tree) && k.tree.length) k.organizedStatus = 'stale'
        else k.organizedStatus = 'empty'
        delete k.organizedError
        return k
    }

    async function reorganizeCurrentKnowledge() {
        const cur = await getKnowledge()
        if (!(cur.docs || []).length) {
            cur.tree = []
            cur.nodeContents = {}
            cur.organizedStatus = 'empty'
            delete cur.organizedError
            cur.organizedAt = Date.now()
            await setKnowledge(cur)
            if (knowledgeStatus) knowledgeStatus.textContent = 'No organized knowledge yet.'
            return
        }
        if (knowledgeStatus) knowledgeStatus.textContent = 'Reorganizing current knowledge…'
        cur.organizedStatus = 'organizing'
        cur.tree = []
        cur.nodeContents = {}
        await setKnowledge(cur)
        try {
            const organized = await reorganizeKnowledge({ maxChars: premiumState?.paid === true ? 0 : 5000 })
            const latest = await getKnowledge()
            latest.tree = organized.tree || []
            latest.nodeContents = organized.nodeContents || {}
            latest.organizedStatus = latest.tree.length ? 'ready' : 'failed'
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

    // Raw file changes never call the model. Only the explicit Organize now action
    // rebuilds organized knowledge from the current library.
    async function refreshKnowledge() {
        if (!knowledgeList) return
        const paid = premiumState?.paid === true
        if (knowledgeUpload) knowledgeUpload.disabled = false
        if (knowledgeTestQuestion) knowledgeTestQuestion.disabled = false
        if (knowledgeTestBtn) knowledgeTestBtn.disabled = false
        if (knowledgePlanNote) knowledgePlanNote.textContent = paid
            ? 'Premium · organized knowledge has no artificial character limit.'
            : 'Free · final organized knowledge is limited to 5,000 characters. Premium removes this limit.'
        const k = await getKnowledge()
        renderOrganizedKnowledge(k)
        const total = totalBytes(k)
        const totalKb = (total / 1024).toFixed(1)
        const esc = (s) => String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))
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
                    <button class="subtle" data-knowledge-delete="${esc(d.id)}">Remove</button>
                </div>
            </li>`)
        }
        parts.push('</ul>')
        knowledgeList.innerHTML = parts.join('')
        if (knowledgeStatus) {
            knowledgeStatus.textContent = k.organizedStatus === 'organizing'
                ? 'Reorganizing current knowledge…'
                : k.organizedStatus === 'failed'
                    ? `Organization failed: ${k.organizedError || 'unknown error'}`
                    : k.organizedStatus === 'stale'
                        ? 'Files changed · click Organize now to rebuild organized knowledge.'
                        : Array.isArray(k.tree) && k.tree.length
                            ? 'Knowledge organized from current files.'
                            : 'Knowledge has not been organized yet · click Organize now.'
        }
        knowledgeList.querySelectorAll('[data-knowledge-delete]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-knowledge-delete')
                const cur = await getKnowledge()
                cur.docs = (cur.docs || []).filter(d => d.id !== id)
                try {
                    markKnowledgeStale(cur)
                    await setKnowledge(cur)
                } catch (err) {
                    alert(`Could not update knowledge library — browser storage is full or unavailable: ${err.message || err}`)
                }
                refreshKnowledge()
            })
        })
    }
    if (knowledgeOrganizeBtn) {
        knowledgeOrganizeBtn.addEventListener('click', async () => {
            knowledgeOrganizeBtn.disabled = true
            try {
                await reorganizeCurrentKnowledge()
                await refreshKnowledge()
            } finally {
                knowledgeOrganizeBtn.disabled = false
            }
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
                markKnowledgeStale(cur)
                await setKnowledge(cur)
            } catch (err) {
                alert(`Could not save knowledge library — browser storage is full or unavailable: ${err.message || err}`)
            }
            knowledgeUpload.value = ''
            refreshKnowledge()
        })
    }
    if (knowledgeTestBtn) {
        knowledgeTestBtn.addEventListener('click', async () => {
            const q = String(knowledgeTestQuestion?.value || '').trim()
            if (!q) {
                if (knowledgeTestAnswer) knowledgeTestAnswer.textContent = 'Enter a question to test.'
                return
            }
            const cur = await getKnowledge()
            if (!(cur.docs || []).length) {
                if (knowledgeTestAnswer) knowledgeTestAnswer.textContent = 'Upload at least one knowledge document first.'
                return
            }
            knowledgeTestBtn.disabled = true
            if (knowledgeTestAnswer) knowledgeTestAnswer.textContent = 'Testing Q&A…'
            try {
                const answer = await testKnowledgeQnA(q)
                if (knowledgeTestAnswer) knowledgeTestAnswer.textContent = answer || '(no answer)'
            } catch (err) {
                if (knowledgeTestAnswer) knowledgeTestAnswer.textContent = err?.message || String(err)
            } finally {
                knowledgeTestBtn.disabled = false
            }
        })
    }

    refreshKnowledge()
})
