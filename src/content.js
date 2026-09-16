// src/content.js
//
// MeetMate content script — runs in the Teams tab.
//
// Responsibilities (and nothing else):
//   1. Detect meeting start/end and turn Teams captions on.
//   2. Capture captions into a local transcript buffer. Captions NEVER call
//      the model and NEVER create suggestions.
//   3. Show the Q&A rail. A typed question or a shortcut tap calls the single
//      `ask(question)` entry point in util.js, then renders the answer.
//   4. Hand the transcript to background.js for a VTT export at meeting end.

const { changeConf, getConf, since, isV2, getMeetingName, getShortcuts, normalizeShortcuts, getShownShortcuts, ask, askDetailed } = require("./util")
const { createUIController } = require("./ui-controller")
const { getPremiumStatus } = require("./premium")

async function init() {
    const transcripts = []
    const conversation = []
    const observer = new MutationObserver(checkStatus)
    let observed = null, enabled = false, startTime = null, containerObserver = null
    let _ui = null
    let _confHandler = null
    let _pendingAsks = 0
    let _premium = false

    // ── Transcript capture ────────────────────────────────────────────────
    function stampCaption(t) { if (t && !t._ts) t._ts = Date.now(); return t }

    function pushCaption(Name, Text) {
        if (!Text) return false
        transcripts.push(stampCaption({ Name, Text, Time: since(startTime) }))
        try { chrome.runtime.sendMessage({ message: "update_transcripts", count: transcripts.length }) } catch (_) {}
        onCaptionForStatus()
        return true
    }

    function checkCaptions(container = document, isLast) {
        // Newer Teams V2 caption renderer (data-tid based).
        // Falls back to the legacy .fui-ChatMessageCompact path for older builds.
        let last
        let Name = ''
        let Text = ''

        const v2Wrap = container.querySelector('[data-tid="closed-caption-v2-virtual-list-content"]')
        if (v2Wrap && v2Wrap.children.length) {
            const items = Array.from(v2Wrap.children).filter(d => (d.innerText || '').trim())
            last = items[isLast ? items.length - 1 : items.length - 2] || items[items.length - 1]
            if (last) {
                const authorEl = last.querySelector('[data-tid*="author"], [data-tid*="speaker-name"], [class*="author"]')
                const textEl = last.querySelector('[data-tid="closed-caption-text"], [data-tid*="caption-text"]')
                if (authorEl && textEl) {
                    Name = (authorEl.innerText || '').trim()
                    Text = (textEl.innerText || '').trim()
                }
            }
        }
        if (!Text) {
            last = container.querySelector('.fui-ChatMessageCompact:last-child')
            if (last && last.firstElementChild?.firstElementChild && last.firstElementChild?.lastElementChild) {
                Name = last.firstElementChild.firstElementChild.innerText
                Text = last.firstElementChild.lastElementChild.innerText
            }
        }

        if (!last || !Text) return
        const prev = transcripts[transcripts.length - 1]
        if (prev && prev.Text === Text && prev.Name === Name) return
        pushCaption(Name, Text)
    }

    // ── React fiber caption polling (Teams v2) ────────────────────────────
    // Teams v2 renders captions in a virtual list, so the MutationObserver
    // misses entries that scroll out of view. Polling React's internal
    // `currentEntries` array gives full coverage.
    let _fiberPollTimer = null
    const _fiberSeenIds = new Set()

    function _getFiberEntries() {
        try {
            const el = document.querySelector('[data-tid="closed-caption-v2-virtual-list-content"]')
            if (!el) return null
            const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber'))
            if (!fiberKey) return null
            let fiber = el[fiberKey]
            for (let i = 0; i < 10 && fiber; i++) {
                const entries = fiber.memoizedProps?.currentEntries
                if (Array.isArray(entries) && entries.length) return entries
                fiber = fiber.return
            }
        } catch (_) {}
        return null
    }

    function _pollFiberCaptions() {
        const entries = _getFiberEntries()
        if (!entries) return
        for (const entry of entries) {
            if (!entry.id || _fiberSeenIds.has(entry.id)) continue
            if (!entry.isFinal) continue  // skip partial/in-progress entries
            _fiberSeenIds.add(entry.id)
            const Name = entry.user?.displayName || 'Speaker'
            const Text = (entry.text || '').trim()
            if (!Text) continue
            const isDup = transcripts.slice(-5).some(t => t.Text === Text && t.Name === Name)
            if (isDup) continue
            pushCaption(Name, Text)
        }
    }

    function startFiberPolling() {
        if (_fiberPollTimer) return
        _fiberPollTimer = setInterval(_pollFiberCaptions, 800)
    }
    function stopFiberPolling() {
        if (_fiberPollTimer) { clearInterval(_fiberPollTimer); _fiberPollTimer = null }
        _fiberSeenIds.clear()
    }

    // ── Meeting lifecycle ─────────────────────────────────────────────────
    let observerOnIframe = false
    let _endPollTimer = null

    function checkStatus() {
        const liveCaptionOnId = '#captions-settings-menu-trigger-button, #captions-settings-menu-trigger-button-non-overflow'
        const meetingOnId = '#call-duration-custom, [data-tid="call-duration"]'

        if (!enabled) {
            if (!isV2 && !observerOnIframe) {
                const iframe = document.querySelector('iframe')
                if (iframe?.contentDocument?.body) {
                    observer.disconnect()
                    observer.observe(observed = iframe.contentDocument, { childList: true, subtree: true })
                    observerOnIframe = true
                    return
                }
            }

            const meetingActive = !!observed.querySelector(meetingOnId)
            if (!meetingActive) {
                delete startMeeting.doing
                return
            }

            enabled = true
            startTranscription(document.body)

            if (!observed.querySelector(liveCaptionOnId)) startMeeting()

            if (_endPollTimer) clearInterval(_endPollTimer)
            _endPollTimer = setInterval(() => {
                if (!enabled) return
                if (!observed.querySelector(meetingOnId)) {
                    enabled = false
                    try { stopTranscription() } catch (e) { console.warn('[meetmate] poll teardown failed', e) }
                    delete startMeeting.doing
                    clearInterval(_endPollTimer); _endPollTimer = null
                }
            }, 1500)
            return
        }

        if (!observed.querySelector(meetingOnId)) {
            enabled = false
            stopTranscription()
            delete startMeeting.doing
            if (_endPollTimer) { clearInterval(_endPollTimer); _endPollTimer = null }
        }
    }

    function startMeeting() {
        if (startMeeting.doing) return
        startMeeting.doing = true
        const moreButton = observed.querySelector('#callingButtons-showMoreBtn')
        if (!moreButton) { delete startMeeting.doing; return }
        moreButton.click()
        setTimeout(() => observed.querySelector('#LanguageSpeechMenuControl-id')?.click(), 500)
        setTimeout(() => observed.querySelector('#closed-captions-button')?.click(), 1000)
    }

    async function startTranscription(container) {
        const durationEl = observed?.querySelector('#call-duration-custom') || observed?.querySelector('[data-tid="call-duration"]') || document.querySelector('[data-tid="call-duration"]')
        const [seconds, minutes, hours = 0] = (durationEl?.textContent || '0:00').split(":").map(a => parseInt(a)).reverse()
        startTime = Date.now() - (hours * 60 * 60 + minutes * 60 + seconds) * 1000
        await changeConf({ author: getAuthorName() })
        chrome.runtime.sendMessage({ message: "start_capture" })

        transcripts.splice(0)
        conversation.splice(0)
        checkCaptions(container)
        containerObserver = new MutationObserver(() => checkCaptions(container))
        containerObserver.observe(container, { subtree: true, childList: true })
        try { startFiberPolling() } catch (_) {}

        await mountAskUI()
    }

    // ── Ask UI ────────────────────────────────────────────────────────────
    async function mountAskUI() {
        if (_ui) return
        const status = await getPremiumStatus().catch(() => ({ paid: false }))
        _premium = status?.paid === true
        const allShortcuts = await getShortcuts()
        const shortcuts = getShownShortcuts(allShortcuts, { premium: _premium })
        _ui = createUIController({ shortcuts, onAsk: handleAsk })
        // Live-apply shortcut edits made in Setup. Setup lives in a different
        // tab, so listen on chrome.storage instead of a page-local event.
        _confHandler = (changes, area) => {
            if (area !== 'local' || !changes.conf) return
            const list = changes.conf.newValue?.shortcuts
            try {
                const normalized = normalizeShortcuts(list !== undefined ? list : allShortcuts)
                _ui?.setShortcuts(getShownShortcuts(normalized, { premium: _premium }))
            } catch (_) {}
        }
        chrome.storage.onChanged.addListener(_confHandler)
    }

    /**
     * The ONE ask path. Both typed questions and shortcut taps land here.
     */
    async function handleAsk(question, entryId) {
        const q = String(question || '').trim()
        if (!q) return

        // Freeze the meeting context at the instant the user asks. The user
        // turn is recorded immediately so later transcript lines can be
        // interleaved correctly with this Q&A on the next Ask.
        const transcriptSnapshot = transcripts.slice()
        const priorConversation = conversation.slice()
        conversation.push({ role: 'user', content: q, _ts: Date.now() })

        _pendingAsks++
        try {
            const result = await askDetailed({
                question: q,
                transcripts: transcriptSnapshot,
                conversation: priorConversation,
                meetingName: getMeetingName(),
                includeProvenance: _premium,
            })
            conversation.push({ role: 'assistant', content: result.answer, _ts: Date.now() })
            _ui?.resolveAsk?.(entryId, result.answer, _premium ? result.sources : [])
        } catch (e) {
            console.warn('[meetmate] ask failed', e)
            const msg = e?.message || String(e)
            _ui?.failAsk?.(entryId, msg)
        } finally {
            _pendingAsks--
        }
    }

    async function buildPremiumReport() {
        if (!_premium || !transcripts.length) return ""
        const conf = await getConf().catch(() => ({}))
        if (conf?.premiumStructuredReport !== true) return ""
        try {
            const result = await askDetailed({
                question: "Create the structured meeting report now.",
                transcripts: transcripts.slice(),
                conversation: conversation.slice(),
                meetingName: getMeetingName(),
                maxTranscriptChars: 30000,
                responseMode: 'report',
            })
            return result.answer || ""
        } catch (e) {
            console.warn('[meetmate] premium report failed', e)
            return ""
        }
    }

    let _stopping = false
    async function stopTranscription() {
        if (_stopping) return
        _stopping = true
        try {
            stopFiberPolling()
            if (containerObserver) { containerObserver.disconnect(); containerObserver = null }
            if (_confHandler) { chrome.storage.onChanged.removeListener(_confHandler); _confHandler = null }

            // The meeting UI should leave with the meeting. Report generation can
            // continue after teardown, with a small explicit status indicator.
            try { _ui?.destroy(); _ui = null } catch (_) {}

            const hasTranscript = transcripts.length > 0
            if (hasTranscript) showStatus("Saving meeting transcript…", 60000)

            let premiumReport = ""
            const conf = await getConf().catch(() => ({}))
            const generatingReport = _premium && transcripts.length > 0 && conf?.premiumStructuredReport === true
            if (generatingReport) showStatus(hasTranscript ? "Saving transcript · Generating report…" : "Generating meeting report…", 60000)
            try { premiumReport = await buildPremiumReport() }
            catch (e) { console.warn('[meetmate] premium report failed', e) }
            if (generatingReport && !premiumReport) showStatus("Transcript saved · Report could not be generated", 3500)

            chrome.runtime.sendMessage({
                message: "stop_capture",
                transcripts,
                premiumReport,
                name: getMeetingName(),
            }, () => {
                if (chrome.runtime.lastError) {
                    console.warn('[meetmate] meeting files save failed', chrome.runtime.lastError.message)
                    showStatus("Could not save meeting files", 4000)
                    return
                }
                if (generatingReport && premiumReport) showStatus("Transcript + report saved", 3500)
                else if (hasTranscript) showStatus("Transcript saved", 3500)
            })
        } finally {
            try { Array.from(document.querySelectorAll('.shouldRemove')).forEach(a => a.remove()) } catch (_) {}
            try { if (messageContainer) messageContainer.innerHTML = '' } catch (_) {}
            _pendingAsks = 0
            startTime = null
            transcripts.splice(0)
            conversation.splice(0)
            _stopping = false
        }
    }

    // ── Status pill (local feedback only — never model-driven) ────────────
    const messageContainer = document.createElement('div')
    messageContainer.id = "liveAI-message"
    document.body.appendChild(messageContainer)

    const statusPill = document.createElement('div')
    statusPill.id = 'meetmate-status'
    document.body.appendChild(statusPill)
    let _statusFadeTimer = 0
    let _statusClearTimer = 0
    function showStatus(text, ttl = 4000) {
        if (!text) return
        if (_statusFadeTimer) { clearTimeout(_statusFadeTimer); _statusFadeTimer = 0 }
        if (_statusClearTimer) { clearTimeout(_statusClearTimer); _statusClearTimer = 0 }
        statusPill.textContent = text
        statusPill.classList.add('show')
        _statusFadeTimer = setTimeout(() => {
            statusPill.classList.remove('show')
            _statusFadeTimer = 0
            _statusClearTimer = setTimeout(() => { statusPill.textContent = ''; _statusClearTimer = 0 }, 250)
        }, ttl)
    }

    let _captionCountForStatus = 0
    function onCaptionForStatus() {
        _captionCountForStatus++
        if ([1, 25, 100].includes(_captionCountForStatus)) {
            showStatus(`\uD83C\uDF99 Capturing captions \u2022 ${_captionCountForStatus} line${_captionCountForStatus === 1 ? '' : 's'}`, 2500)
        }
    }

    function getAuthorName() {
        try {
            return (document.querySelector('[data-tid="me-control-avatar"]')?.getAttribute('aria-label') || '').split(',')[0].trim()
        } catch (_) { return '' }
    }

    // ── Test / automation hooks ───────────────────────────────────────────
    window.__meetmate = window.__meetmate || {}
    // Async: await startup so an injected caption can't race the transcript
    // clear that happens inside startTranscription (test/automation hook).
    window.__meetmate.injectCaption = async ({ Name, Text } = {}) => {
        if (!Name || !Text) return false
        if (!enabled) { enabled = true; await startTranscription(document.body) }
        return pushCaption(Name, Text)
    }
    window.__meetmate.ask = (text) => _ui?.submit?.(String(text || ''))
    window.__meetmate.debugSnapshot = () => ({
        enabled,
        asking: _pendingAsks,
        transcripts: transcripts.length,
        lastCaption: transcripts[transcripts.length - 1] || null,
    })

    document.addEventListener('meetmate:inject_caption', (e) => {
        try { Promise.resolve(window.__meetmate?.injectCaption?.(e?.detail || {})).catch(() => {}) } catch (_) {}
    })
    document.addEventListener('meetmate:ask', (e) => {
        try { window.__meetmate?.ask?.(e?.detail?.question || e?.detail?.text || '') } catch (_) {}
    })
    document.addEventListener('meetmate:debug_request', () => {
        try { document.documentElement.dataset.meetmateDebug = JSON.stringify(window.__meetmate?.debugSnapshot?.() || null) } catch (_) {}
    })
    document.addEventListener('meetmate:leave', () => {
        if (!enabled) return
        enabled = false
        try { stopTranscription() } catch (e) { console.warn(e) }
        delete startMeeting.doing
        if (_endPollTimer) { clearInterval(_endPollTimer); _endPollTimer = null }
    })

    // CDP/automation trigger: set data-inject-caption on <body>.
    new MutationObserver((muts) => {
        for (const m of muts) {
            if (m.attributeName !== 'data-inject-caption') continue
            const json = document.body.getAttribute('data-inject-caption')
            if (!json) continue
            document.body.removeAttribute('data-inject-caption')
            try {
                const { Name, Text } = JSON.parse(json)
                Promise.resolve(window.__meetmate.injectCaption({ Name, Text })).catch(() => {})
            } catch (_) {}
        }
    }).observe(document.body, { attributes: true, attributeFilter: ['data-inject-caption'] })

    observer.observe(observed = document, { childList: true, subtree: true })
}

// Guard: content_scripts run in all_frames, but sandboxed/cross-origin child
// iframes don't get chrome.storage. Bail out quietly so we don't throw
// "Cannot read properties of undefined (reading 'get')".
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    init()
}
