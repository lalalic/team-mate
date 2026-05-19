// src/ui-controller.js
//
// v4.1 UI controller. Owns the three new DOM surfaces:
//   - #meetmate-center      top-center overlay (states 1, 2, 3)
//   - #meetmate-rail        right-side idle strip + Ask bar (state 4)
//   - #meetmate-translation continuous-translation panel
//
// All access is via:
//   const ui = createUIController({ onAsk, onQuickHelp, onTranslateToggle })
//   ui.applyState({state, payload})        // call after classifyState()
//   ui.renderSuggestion({kind, text, options})  // routes by current state
//   ui.addIdleChip({kind, text, action})        // for state-4 rail chips
//   ui.pushTranslation({speaker, text})         // append to translation panel
//   ui.setTranslateOn(boolean)                  // show/hide translation panel
//   ui.dismissCenter()
//   ui.destroy()

const SAFE_HTML = (s) => String(s == null ? "" : s)
    .replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[c]))

const STATE_LABELS = {
    1: "💬 Live help",
    2: "🟡 You're up",
    3: "🔵 Asked",
    4: "Idle",
}

export function createUIController({ onAsk, onQuickHelp, onTranslateToggle, onContextSet, onAttentionToggle, onWillSay } = {}) {
    // Build DOM (idempotent — if elements already exist, reuse them).
    // Center panel — shows reply options (different SUGGEST variants/branches)
    // when user is mentioned (state 2), speaking (state 1), or attention
    // toggle is ON. FACT/RESEARCH bubbles continue to flow into the side
    // rail; the center is dedicated to "what can I say next?".
    const center = ensureEl("meetmate-center", `
        <div class="mm-c-head">
            <span class="mm-c-badge">💬 Live help</span>
            <button class="mm-c-close" title="Dismiss">×</button>
        </div>
        <div class="mm-c-section mm-c-suggests">
            <div class="mm-c-section-body"></div>
        </div>
    `)
    center.classList.add("shouldRemove")

    const rail = ensureEl("meetmate-rail", `
        <div class="mm-r-head">
            <input type="text" class="mm-r-context"
                placeholder="Meeting purpose / context (Enter to save)…"
            />
            <span class="mm-r-context-saved" style="display:none">✓ saved</span>
        </div>
        <div class="mm-r-log"></div>
        <div class="mm-r-chips"></div>
        <div class="mm-r-asker">
            <input type="text" placeholder="Ask anything…" />
            <button class="mm-r-send" title="Send">↩</button>
        </div>
    `)
    rail.classList.add("shouldRemove")

    const translation = ensureEl("meetmate-translation", `
        <div class="mm-t-body"></div>
    `)
    translation.classList.add("shouldRemove")
    translation.style.display = "none"

    // Wire close on center
    center.querySelector(".mm-c-close").addEventListener("click", dismissCenter)

    // Rail collapse removed; switching is handled by external button.

    // Wire Ask bar
    const askInput = rail.querySelector(".mm-r-asker input")
    const askSend  = rail.querySelector(".mm-r-asker .mm-r-send")
    function submitAsk() {
        const q = (askInput.value || "").trim()
        if (!q) return
        askInput.value = ""
        try { onAsk?.(q) } catch (e) { console.warn(e) }
    }
    askSend.addEventListener("click", submitAsk)
    askInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            submitAsk()
        }
    })
    askInput.addEventListener("focus", () => {
        try { onQuickHelp?.({ focused: true }) } catch (_) {}
    })

    // Wire meeting-context textarea (rail head). Saves on Enter (no shift)
    // and on blur if value changed.
    const ctxEl = rail.querySelector(".mm-r-context")
    let _ctxLast = ""
    function commitContext() {
        const v = (ctxEl.value || "").trim()
        if (v === _ctxLast) return
        _ctxLast = v
        try { onContextSet?.(v) } catch (e) { console.warn(e) }
        // Flash a brief "✓ saved" indicator so the user knows it took.
        try {
            const badge = rail.querySelector(".mm-r-context-saved")
            if (badge) {
                badge.style.display = "inline"
                clearTimeout(commitContext._t)
                commitContext._t = setTimeout(() => { badge.style.display = "none" }, 2000)
            }
        } catch (_) {}
    }
    if (ctxEl) {
        ctxEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault()
                ctxEl.blur()
                commitContext()
            }
        })
        ctxEl.addEventListener("blur", commitContext)
    }
    function setContextValue(v) {
        if (!ctxEl) return
        ctxEl.value = v || ""
        _ctxLast = (v || "").trim()
    }

    // Wire translation close → no-op (close button removed; toggle off via 🌐 button only)

    // Sync translation panel position: attach it AS A CHILD of Teams' Live
    // Captions wrapper so it looks like a native section of the captions UI.
    // Positioned absolute at the top-left of the wrapper, occupying the upper
    // portion so the native caption lines flow underneath.
    const TEAMS_CAPTIONS_SEL = '[data-tid="closed-caption-renderer-wrapper"]'
    let _ttRO = null
    function alignTranslationToCaptions() {
        try {
            const wrap = document.querySelector(TEAMS_CAPTIONS_SEL)
            if (!wrap) return
            // Adopt the translation element as a child of the captions wrapper
            // (once) so it inherits Teams' layout context. Becomes a native
            // sibling block in the captions DOM.
            if (translation.parentElement !== wrap) {
                try { wrap.appendChild(translation) } catch (_) {}
                // Ensure relative parent so absolute positioning anchors here.
                try {
                    const cs = getComputedStyle(wrap)
                    if (cs.position === "static") wrap.style.position = "relative"
                } catch (_) {}
            }
            // Reset any prior fixed positioning leftover from older runs.
            translation.style.position = "absolute"
            translation.style.top = "0"
            translation.style.left = "0"
            translation.style.right = "auto"
            translation.style.bottom = "auto"
            translation.style.width = "auto"
            translation.style.height = "auto"
            translation.style.maxWidth = "100%"
            translation.style.maxHeight = "100%"
            translation.style.height = "100%"
        } catch (_) {}
    }
    function attachCaptionsObserver() {
        try {
            const wrap = document.querySelector(TEAMS_CAPTIONS_SEL)
            if (!wrap || _ttRO) return
            _ttRO = new ResizeObserver(alignTranslationToCaptions)
            _ttRO.observe(wrap)
            window.addEventListener("resize", alignTranslationToCaptions)
            alignTranslationToCaptions()
        } catch (_) {}
    }

    // ── Internal state ────────────────────────────────────────────────────
    let currentState = 4
    let currentPayload = {}
    let lastSuggestion = null // {kind, text, options} so re-state can re-render
    let _attentionOn = false  // user-forced attention toggle (overrides state 4)
    let _centerBatch = 1      // batch id stamped on each SUGGEST; advances on pick
    let _lastCenterAppendAt = 0
    const NEW_TURN_GAP_MS = 4000  // > 4s since last append ⇒ next append is a new model turn

    // Attention toggle — button lives in the BOTTOM toolbar (createAISuggestion
    // in util.js). It dispatches a `meetmate:attention-toggle` CustomEvent;
    // we listen here so toggle state stays in sync with the centered panel.
    function _setAttention(on) {
        _attentionOn = !!on
        try { onAttentionToggle?.(_attentionOn) } catch (e) { console.warn(e) }
        applyState({ state: currentState, payload: currentPayload })
    }
    const _attHandler = (e) => {
        const on = !!(e?.detail?.on)
        _setAttention(on)
    }
    window.addEventListener("meetmate:attention-toggle", _attHandler)

    // True iff the centered panel should be visible (high-priority moment).
    function isCentered() {
        return _attentionOn || currentState === 1 || currentState === 2 || currentState === 3
    }

    // Append a SUGGEST reply variant into the centered panel. FACT and
    // RESEARCH bubbles go to the rail. Each SUGGEST is stamped with a
    // batch id; when the user picks one, all sibling un-picked entries
    // in the SAME batch disappear, the picked one stays, and the batch
    // counter advances so the LLM's next SUGGESTs form a fresh batch
    // below (drill-down trail).
    function appendCenterEntry({ kind, text, options }) {
        const k = String(kind || "SUGGEST").toUpperCase()
        if (k !== "SUGGEST") return // FACT/RESEARCH go to rail only
        const section = center.querySelector(".mm-c-suggests .mm-c-section-body")
        if (!section) return
        // NEW-TURN DETECTION: if > NEW_TURN_GAP_MS since last append, treat
        // this as the start of a fresh model turn. Drop any un-chosen
        // entries from the prior batch (the user didn't pick them; the
        // conversation has moved on) and advance the batch counter so this
        // new turn forms a fresh group. Chosen entries persist as
        // drill-down breadcrumbs.
        const now = Date.now()
        if (_lastCenterAppendAt && (now - _lastCenterAppendAt) > NEW_TURN_GAP_MS) {
            for (const sib of Array.from(section.children)) {
                if (!sib.classList.contains("mm-c-entry-chosen")) sib.remove()
            }
            _centerBatch++
        }
        _lastCenterAppendAt = now
        // Hard cap total visible items (trail can grow with drill-downs).
        while (section.children.length >= 8) section.removeChild(section.firstChild)
        const entry = document.createElement("div")
        entry.className = "mm-c-entry mm-c-entry-suggest mm-c-entry-clickable"
        entry.title = "Click — I'll speak to this topic"
        entry.dataset.batch = String(_centerBatch)
        // Parse leading **Topic** [—:] body
        const raw = String(text || "")
        const m = raw.match(/^\s*\*\*([^*]{1,60})\*\*\s*[—\-:]\s*(.*)$/s)
        if (m) {
            const topicEl = document.createElement("div")
            topicEl.className = "mm-c-entry-topic"
            topicEl.textContent = m[1].trim()
            entry.appendChild(topicEl)
            const bodyEl = document.createElement("div")
            bodyEl.className = "mm-c-entry-body"
            bodyEl.innerHTML = formatBody(m[2])
            entry.appendChild(bodyEl)
            entry.dataset.topic = m[1].trim()
        } else {
            const bodyEl = document.createElement("div")
            bodyEl.className = "mm-c-entry-body"
            bodyEl.innerHTML = formatBody(raw)
            entry.appendChild(bodyEl)
        }
        if (Array.isArray(options) && options.length) {
            const chipsEl = document.createElement("div")
            chipsEl.className = "mm-c-entry-chips"
            for (const opt of options.slice(0, 4)) {
                const b = document.createElement("button")
                b.type = "button"
                b.textContent = String(opt || "").trim()
                b.dataset.label = b.textContent
                b.addEventListener("click", (ev) => {
                    ev.stopPropagation()
                    Array.from(chipsEl.querySelectorAll("button")).forEach(x => x.disabled = true)
                    b.textContent = "✓ " + b.textContent
                    try {
                        if (window.__meetmate?.pushUserMsg) {
                            window.__meetmate.pushUserMsg(b.dataset.label)
                        }
                    } catch (e) { console.warn(e) }
                })
                chipsEl.appendChild(b)
            }
            entry.appendChild(chipsEl)
        }
        entry.addEventListener("click", () => {
            if (entry.classList.contains("mm-c-entry-chosen")) return
            const myBatch = entry.dataset.batch
            // Remove un-chosen siblings in the SAME batch; keep this one.
            for (const sib of Array.from(section.children)) {
                if (sib === entry) continue
                if (sib.dataset.batch === myBatch && !sib.classList.contains("mm-c-entry-chosen")) {
                    sib.remove()
                }
            }
            entry.classList.add("mm-c-entry-chosen")
            entry.classList.remove("mm-c-entry-clickable") // already picked
            // Advance batch counter so any next SUGGEST forms a fresh group.
            _centerBatch++
            try { onWillSay?.(text) } catch (e) { console.warn(e) }
        })
        section.appendChild(entry)
    }

    function clearCenterSections() {
        const sb = center.querySelector(".mm-c-suggests .mm-c-section-body")
        if (sb) sb.innerHTML = ""
        _centerBatch = 1
        _lastCenterAppendAt = 0
    }

    function applyState({ state, payload }) {
        const prevState = currentState
        currentState = state || 4
        currentPayload = payload || {}
        const wantCentered = isCentered()
        if (!wantCentered) {
            center.classList.remove("show")
            // Clear stale content so the next entry to high-priority starts blank.
            if (prevState !== 4 || _attentionOn === false) {
                setTimeout(() => { clearCenterSections() }, 220)
            }
            rail.style.display = "flex"
        } else {
            const hasContent = !!center.querySelector(".mm-c-suggests .mm-c-section-body")?.children.length
            if (hasContent || _attentionOn) {
                center.style.display = "block"
                center.classList.add("show")
            }
            center.dataset.state = String(currentState)
            const badge = center.querySelector(".mm-c-badge")
            badge.textContent = STATE_LABELS[currentState] || ""
            if (_attentionOn) {
                badge.textContent = "🎯 Attention"
            } else if (currentState === 2 && payload?.speaker) {
                badge.textContent = `🟡 ${payload.speaker} → you`
            } else if (currentState === 1 && payload?.sub === "paused") {
                badge.textContent = "💬 Polish"
            } else if (currentState === 1) {
                badge.textContent = "💬 Live help"
            } else if (currentState === 3) {
                badge.textContent = "🔵 Asked"
            }
        }
    }

    function renderSuggestion({ kind, text, options } = {}) {
        lastSuggestion = { kind, text, options: options || [] }
        if (isCentered()) {
            appendCenterEntry({ kind, text, options })
            center.style.display = "block"
            center.classList.add("show")
            center.dataset.state = String(currentState)
        }
        // For state 4 the rail (logToRail, called by content.js) is the
        // single rendering path — nothing to do here.
    }

    function formatBody(text) {
        const esc = SAFE_HTML(text || "")
        // Light markdown: **bold** + line breaks
        return esc
            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
            .replace(/\n/g, "<br>")
    }

    let _chipSeq = 0
    function addIdleChip({ kind, text, action } = {}) {
        const chipsEl = rail.querySelector(".mm-r-chips")
        // Cap to last 6 chips to avoid runaway accumulation
        while (chipsEl.children.length >= 6) chipsEl.removeChild(chipsEl.firstChild)
        const k = String(kind || "SUGGEST").toUpperCase()
        const icon = k === "FACT" ? "📌" : k === "RESEARCH" ? "❓" : "💬"
        const id = `mm-chip-${++_chipSeq}`
        const b = document.createElement("button")
        b.type = "button"
        b.id = id
        b.className = `mm-r-chip mm-r-chip-${k.toLowerCase()}`
        b.dataset.kind = k
        b.innerHTML = `
            <div class="mm-r-chip-row">
                <span class="mm-r-chip-icon" title="${SAFE_HTML(k)}">${icon}</span>
                <span class="mm-r-chip-text">${SAFE_HTML(text || "")}</span>
            </div>
            <div class="mm-r-chip-detail" style="display:none"></div>
        `
        const detailEl = b.querySelector(".mm-r-chip-detail")
        b.addEventListener("click", (ev) => {
            ev.stopPropagation()
            try {
                if (k === "FACT" || k === "RESEARCH") {
                    if (detailEl.style.display === "none") {
                        detailEl.style.display = "block"
                        detailEl.innerHTML = `<em class="mm-r-loading">Loading…</em>`
                        window.dispatchEvent(new CustomEvent("meetmate:detail_request", {
                            detail: { id, kind: k, text: text || "" },
                        }))
                    } else {
                        detailEl.style.display = "none"
                    }
                    return
                }
                // SUGGEST chip: send the text to chat (user wants to speak it)
                if (typeof action === "function") action()
                else if (window.__meetmate?.pushUserMsg) {
                    window.__meetmate.pushUserMsg(text || kind || "")
                }
                b.disabled = true
                b.style.opacity = "0.6"
            } catch (e) { console.warn(e) }
        })
        chipsEl.appendChild(b)
    }

    function pushTranslation({ speaker, text } = {}) {
        const body = translation.querySelector(".mm-t-body")
        // Cap to last 20 lines
        while (body.children.length >= 20) body.removeChild(body.firstChild)
        const line = document.createElement("div")
        line.className = "mm-t-line"
        const nameEl = document.createElement("div")
        nameEl.className = "mm-t-speaker"
        nameEl.textContent = speaker || "Speaker"
        const textEl = document.createElement("div")
        textEl.className = "mm-t-text"
        textEl.textContent = text || ""
        line.appendChild(nameEl)
        line.appendChild(textEl)
        body.appendChild(line)
        body.scrollTop = body.scrollHeight
    }

    function setTranslateOn(on) {
        translation.style.display = on ? "flex" : "none"
        if (on) {
            // Retry alignment a few times in case Teams captions wrapper
            // hasn't appeared yet.
            attachCaptionsObserver()
            let tries = 0
            const t = setInterval(() => {
                alignTranslationToCaptions()
                if (++tries >= 10) clearInterval(t)
            }, 300)
        }
    }

    function dismissCenter() {
        center.classList.remove("show")
        setTimeout(() => { center.style.display = "none" }, 200)
    }

    // Append a flowing log entry to the rail. No avatar, just text + icon.
    //   SUGGEST  💬  proposed reply the user can speak (no action)
    //   FACT     📌  recalled fact from memory/history (click → expand detail)
    //   RESEARCH 🔬  topic to look up (click → ask model to research deeper)
    let _entrySeq = 0
    function logToRail({ kind, text } = {}) {
        if (!text) return
        const log = rail.querySelector(".mm-r-log")
        if (!log) return
        // Cap to last 30 entries.
        while (log.children.length >= 30) log.removeChild(log.firstChild)
        const k = String(kind || "SUGGEST").toUpperCase()
        const icon = k === "FACT" ? "📌" : k === "RESEARCH" ? "❓" : "💬"
        const id = `mm-entry-${++_entrySeq}`
        const entry = document.createElement("div")
        entry.id = id
        entry.className = `mm-r-log-entry mm-r-kind-${k.toLowerCase()}`
        entry.dataset.kind = k
        entry.innerHTML = `
            <div class="mm-r-log-row">
                <span class="mm-r-log-icon" title="${SAFE_HTML(k)}">${icon}</span>
                <span class="mm-r-log-text">${SAFE_HTML(text)}</span>
            </div>
            <div class="mm-r-log-detail" style="display:none"></div>
        `
        const detailEl = entry.querySelector(".mm-r-log-detail")
        if (k === "FACT" || k === "RESEARCH") {
            entry.classList.add("mm-r-clickable")
            entry.addEventListener("click", (ev) => {
                ev.stopPropagation()
                if (detailEl.style.display === "none") {
                    detailEl.style.display = "block"
                    detailEl.innerHTML = `<em class="mm-r-loading">Loading…</em>`
                    try {
                        window.dispatchEvent(new CustomEvent("meetmate:detail_request", {
                            detail: { id, kind: k, text },
                        }))
                    } catch (_) {}
                } else {
                    detailEl.style.display = "none"
                }
            })
        } else if (k === "SUGGEST") {
            // Click a SUGGEST in the sidebar = "I'm going to speak this".
            // Promote to the centered panel and notify the LLM via onWillSay
            // so it can follow up / remember the user's intent.
            entry.classList.add("mm-r-clickable")
            entry.addEventListener("click", (ev) => {
                ev.stopPropagation()
                try {
                    appendCenterEntry({ kind: "SUGGEST", text, options: [] })
                    center.style.display = "block"
                    center.classList.add("show")
                    center.dataset.state = String(currentState || 1)
                    onWillSay?.(text)
                } catch (e) { console.warn(e) }
                entry.style.opacity = "0.6"
            })
        }
        log.appendChild(entry)
        log.scrollTop = log.scrollHeight
    }

    function populateDetail(id, text) {
        const entry = document.getElementById(id)
        if (!entry) return false
        const d = entry.querySelector(".mm-r-log-detail, .mm-r-chip-detail")
        if (!d) return false
        d.style.display = "block"
        d.innerHTML = SAFE_HTML(text).replace(/\n/g, "<br>")
        return true
    }

    // Append a "user asked" row to the rail with 👤 icon, the question as
    // title, and an empty detail container. Click toggles open. Returns the
    // entry id so the caller can later populate the detail with the answer.
    function addUserAskRow(text) {
        if (!text) return null
        const log = rail.querySelector(".mm-r-log")
        if (!log) return null
        while (log.children.length >= 30) log.removeChild(log.firstChild)
        const id = `mm-entry-${++_entrySeq}`
        const entry = document.createElement("div")
        entry.id = id
        entry.className = "mm-r-log-entry mm-r-kind-userask mm-r-clickable"
        entry.dataset.kind = "USERASK"
        entry.innerHTML = `
            <div class="mm-r-log-row">
                <span class="mm-r-log-icon" title="You asked">👤</span>
                <span class="mm-r-log-text">${SAFE_HTML(text)}</span>
            </div>
            <div class="mm-r-log-detail" style="display:block"><em class="mm-r-loading">Thinking…</em></div>
        `
        const detailEl = entry.querySelector(".mm-r-log-detail")
        entry.addEventListener("click", (ev) => {
            ev.stopPropagation()
            detailEl.style.display = detailEl.style.display === "none" ? "block" : "none"
        })
        log.appendChild(entry)
        log.scrollTop = log.scrollHeight
        return id
    }

    function destroy() {
        try { _ttRO?.disconnect?.(); _ttRO = null } catch (_) {}
        try { window.removeEventListener("resize", alignTranslationToCaptions) } catch (_) {}
        try { window.removeEventListener("meetmate:attention-toggle", _attHandler) } catch (_) {}
        try { center.remove() } catch (_) {}
        try { rail.remove() } catch (_) {}
        try { translation.remove() } catch (_) {}
    }

    return {
        applyState,
        renderSuggestion,
        addIdleChip,
        pushTranslation,
        setTranslateOn,
        dismissCenter,
        logToRail,
        populateDetail,
        addUserAskRow,
        setContextValue,
        setAttention: (on) => {
            _attentionOn = !!on
            applyState({ state: currentState, payload: currentPayload })
        },
        isAttentionOn: () => _attentionOn,
        destroy,
        // expose internals for live debugging
        _el: { center, rail, translation },
    }
}

function ensureEl(id, innerHTML) {
    let el = document.getElementById(id)
    if (el) {
        // Reset contents on reload so template updates take effect after
        // extension reloads while the host page is still alive.
        el.innerHTML = innerHTML
        return el
    }
    el = document.createElement("div")
    el.id = id
    el.innerHTML = innerHTML
    document.body.appendChild(el)
    return el
}
