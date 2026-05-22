const {createUI, changeConf, since, isV2, getMeetingName, makeLoopClient, renderAssistantBubble, getConf} = require("./util")
const {resetRelayClient} = require("./relay")
const {classifyState} = require("./state-machine")
const {createUIController} = require("./ui-controller")

// Tiny markdown -> HTML for the live minutes panel. Handles ## H2, ### H3,
// `-`/`*`/`1.` lists, **bold**, and inline `code`. No HTML injection: input
// is escaped first, then a small set of tokens is converted.
function renderMinutesMarkdown(md) {
    const esc = (s) => String(s).replace(/[<>&"]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;' }[c]))
    const lines = String(md || '').split('\n')
    const out = []
    let inList = false
    const closeList = () => { if (inList) { out.push('</ul>'); inList = false } }
    for (const raw of lines) {
        const line = raw.trimEnd()
        if (!line.trim()) { closeList(); continue }
        let m
        if ((m = line.match(/^###\s+(.*)$/))) { closeList(); out.push(`<h4>${esc(m[1])}</h4>`); continue }
        if ((m = line.match(/^##\s+(.*)$/)))  { closeList(); out.push(`<h3>${esc(m[1])}</h3>`); continue }
        if ((m = line.match(/^[-*]\s+(.*)$/)) || (m = line.match(/^\d+\.\s+(.*)$/))) {
            if (!inList) { out.push('<ul>'); inList = true }
            out.push(`<li>${inline(esc(m[1]))}</li>`); continue
        }
        closeList()
        out.push(`<p>${inline(esc(line))}</p>`)
    }
    closeList()
    return out.join('')
    function inline(s) {
        return s
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
    }
}

async function init(){
    const transcripts = Object.assign([],{
        toString(){
            return this.map(({Name,Text})=>`${Name} : ${Text}`).join("\n")
        }
    });
    const history=[]
    const observer = new MutationObserver(checkStatus);
    let observed=null, enabled=false, timer=null, startTime=null, containerObserver=null
    let _captionBatch=[]        // captions to flush in next pushCaption
    let _flushTimer=null
    let _loop=null              // active LoopSession for the current meeting
    // (continuous-translation runtime removed 2026-05)
    // v4.1 UI controller (4-state) — initialized in startTranscription
    let _ui = null
    let _uiState = 4
    let _uiStateEnter = 0
    let _lastSpeakRefreshAt = 0  // wall-clock of last mid-speech [SPEAKING_REFRESH] push
    let _lastSpeakRefreshCount = 0 // transcripts.length at that point
    let _askBar = { active: false, query: "", ts: 0, dismissed: false }
    // FIFO of pending FACT/RESEARCH detail requests (from rail-log clicks).
    // Each: { id, kind, ts }
    let _pendingDetails = []
    // FIFO of pending USER-ASK rows awaiting their first answer bubble.
    // Each: { id, ts }
    let _pendingAskAnswers = []
    let _stateTimer = null      // periodic re-classify to expire stickies
    // Extras for VTT export: translations + LLM suggestions
    let _extras = []

    // Expose user-message hook so the chat panel (util.js#createAIChatUI) can
    // route its input into the loop session as head-of-queue user_msg events.
    window.__meetmate = window.__meetmate || {}
    window.__meetmate.pushUserMsg = (text) => {
        try { _loop?.pushUserMsg(text) } catch(_) {}
    }
    // Chat panel uses this to push user input AND wait for the model's reply
    // (a send_suggestion tool call). Resolves with {kind, text, options} or null.
    window.__meetmate.askLoop = (text, opts) => {
        if (!_loop?.askLoop) return Promise.resolve(null)
        return _loop.askLoop(text, opts)
    }
    // Back-compat no-ops (the v1 createAIChatUI still calls these).
    window.__meetmate.pauseAutoJudge = () => {}
    window.__meetmate.resumeAutoJudge = () => {}

    // Lets util.js renderAssistantBubble flash the status pill on Copy.
    window.__meetmate.flashStatus = (text, ttl) => {
        try { showStatus(text, ttl) } catch (_) {}
    }
    // v4.1 — synthetic caption injection for live e2e tests. Pushes a real
    // entry into the transcripts array and runs the same downstream hooks
    // (loop flush + status pill + state reclassify) so we don't need to
    // wait for real Teams speech.
    window.__meetmate.injectCaption = ({ Name, Text } = {}) => {
        if (!enabled) return false
        if (!Name || !Text) return false
        const t = stampCaption({ Name, Text, Time: since(startTime) })
        transcripts.push(t)
        try { scheduleAutoSuggest(t) } catch (_) {}
        try { onCaptionForStatus() } catch (_) {}
        try { onCaptionForState(t) } catch (_) {}
        return true
    }
    // v4.1 — debug accessor for tests
    window.__meetmate.debugSnapshot = () => ({
        state: _uiState,
        sinceMs: Date.now() - _uiStateEnter,
        askBar: _askBar,
        transcripts: transcripts.length,
        lastCaption: transcripts[transcripts.length - 1] || null,
    })

    // Push a single caption into the loop session, batching into ≤3-line
    // chunks or 4s windows to limit heartbeat answers.
    function scheduleAutoSuggest(t) {
        if (!_loop) return
        if (t && t.Text) _captionBatch.push(t)
        const flush = () => {
            _flushTimer = null
            const chunk = _captionBatch.splice(0)
            if (chunk.length) _loop.pushCaption(chunk)
        }
        if (_captionBatch.length >= 3) {
            if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null }
            flush()
        } else if (!_flushTimer) {
            _flushTimer = setTimeout(flush, 4000)
        }
    }

    // ── v4.1 state-machine integration ─────────────────────────────────
    // Run after every caption ingest AND on a low-frequency timer (1s) to
    // expire state-2 / state-3 stickies and transition into state 4.
    async function reclassifyState() {
        if (!_ui) return
        if (window.__meetmateDemoFreeze) return
        try {
            const conf = await getConf().catch(() => null)
            const me = (conf?.author) || ''
            const result = classifyState({
                transcripts,
                me,
                now: Date.now(),
                askBar: _askBar,
                lastState: _uiState,
                lastEnter: _uiStateEnter,
            })
            if (result.state !== _uiState) {
                const prev = _uiState
                _uiState = result.state
                _uiStateEnter = Date.now()
                console.log('[meetmate] state →', result.state, result.reason)
                // High-priority entry: tell the LLM to prepare the centered
                // panel with 1 SUGGEST + supporting FACTs + clarifying
                // RESEARCH. Fire once per state transition (debounce via the
                // state-change condition above).
                try {
                    if (result.state === 2 && prev !== 2) {
                        const sp = result.payload?.speaker || 'someone'
                        _loop?.pushUserMsg?.(`[FOCUS_HIGH source=mentioned speaker="${sp}"] You were just addressed. Centered panel is about to open. Emit, in order: 1 SUGGEST (a concise proposed reply you would speak), 1-2 FACTs (relevant context from memory or earlier in this meeting), 1-2 RESEARCH (clarifying questions worth knowing). ≤ 25 words each. No reassurance line.`)
                    } else if (result.state === 1 && prev !== 1) {
                        _lastSpeakRefreshAt = Date.now()
                        _lastSpeakRefreshCount = transcripts.length
                        _loop?.pushUserMsg?.(`[FOCUS_HIGH source=speaking] User just started speaking. Emit 2-3 SUGGEST topic branches anchored to what they appear to be steering toward (continuation drafts they could finish the thought with, or pivot angles). Format each as **<Topic ≤ 5 words>** — <draft ≤ 25 words>. Plus 1 FACT + 1 RESEARCH for the rail. Refresh these as new captions arrive (you'll see [SPEAKING_REFRESH] triggers).`)
                    }
                } catch (_) {}
            } else if (result.state === 1) {
                // STILL speaking. Throttled mid-speech refresher: every ≥ 8s
                // AND ≥ 2 new captions, ask LLM to adapt reply branches
                // based on the latest content.
                const now = Date.now()
                if (now - _lastSpeakRefreshAt >= 8000 && transcripts.length - _lastSpeakRefreshCount >= 2) {
                    _lastSpeakRefreshAt = now
                    _lastSpeakRefreshCount = transcripts.length
                    try { _loop?.pushUserMsg?.(`[SPEAKING_REFRESH] User is still speaking; their latest captions may have shifted the direction. Re-emit 2-3 fresh SUGGEST topic branches that fit what they're saying NOW (not what they started with). Keep the **Topic** — body format. If the previous branches are still apt, you may emit fewer or skip.`) } catch (_) {}
                }
            }
            _ui.applyState(result)
        } catch (e) { console.warn('[meetmate] classify failed', e) }
    }
    // Stamp a wall-clock timestamp on captions so the state machine can
    // measure recency from insertion time (Time field is mm:ss only).
    function stampCaption(t) { if (t && !t._ts) t._ts = Date.now(); return t }

    // Called from caption-ingest sites. Reclassifies UI state.
    // (Continuous-translation hook was removed 2026-05.)
    async function onCaptionForState(t) {
        try { reclassifyState() } catch (_) {}
    }

    function checkCaptions(container=document, isLast) {
        // Newer Teams V2 caption renderer (data-tid based, ~2026 layout).
        // Falls back to the legacy .fui-ChatMessageCompact path for older builds.
        let last;
        let Name = '';
        let Text = '';

        const v2Wrap = container.querySelector('[data-tid="closed-caption-v2-virtual-list-content"]');
        if (v2Wrap && v2Wrap.children.length) {
            const items = Array.from(v2Wrap.children).filter(d => (d.innerText || '').trim());
            last = items[isLast ? items.length - 1 : items.length - 2] || items[items.length - 1];
            if (last) {
                // Author lookup: try data-tid first, then heuristic on first child.
                const authorEl = last.querySelector('[data-tid*="author"], [data-tid*="speaker-name"], [class*="author"]');
                const textEl   = last.querySelector('[data-tid="closed-caption-text"], [data-tid*="caption-text"]');
                if (authorEl && textEl) {
                    Name = (authorEl.innerText || '').trim();
                    Text = (textEl.innerText || '').trim();
                } else {
                    // Last-ditch: split innerText into "Name\nText" or "Name: Text"
                    const raw = (last.innerText || '').trim();
                    const colon = raw.indexOf(':');
                    const newline = raw.indexOf('\n');
                    if (newline > 0 && newline < 64) {
                        Name = raw.slice(0, newline).trim();
                        Text = raw.slice(newline + 1).trim();
                    } else if (colon > 0 && colon < 64) {
                        Name = raw.slice(0, colon).trim();
                        Text = raw.slice(colon + 1).trim();
                    } else {
                        Name = 'Speaker';
                        Text = raw;
                    }
                }
            }
        } else {
            // Legacy path
            const items = Array.from(container.querySelectorAll('.fui-ChatMessageCompact .fui-ChatMessageCompact__body'));
            last = items[isLast ? items.length - 1 : items.length - 2];
            if (last && last.firstElementChild?.firstElementChild && last.firstElementChild?.lastElementChild) {
                Name = last.firstElementChild.firstElementChild.innerText;
                Text = last.firstElementChild.lastElementChild.innerText;
            }
        }

        if (last && Text) {
            const lastInSaved = transcripts[transcripts.length - 1];
            if (!lastInSaved || lastInSaved.Text != Text || lastInSaved.Name != Name) {
                const t = stampCaption({ Name, Text, Time: since(startTime) });
                transcripts.push(t);
                chrome.runtime.sendMessage({ message: "update_transcripts", count: transcripts.length });
                try { scheduleAutoSuggest(t); } catch(_) {}
                try { onCaptionForStatus(); } catch(_) {}
                try { onCaptionForState(t); } catch(_) {}
            }
        }
    }

    // ── React fiber caption polling (Teams v2) ─────────────────────────
    // Teams v2 uses a virtual list that only renders visible items. The
    // MutationObserver misses ~50% of captions. Polling React's internal
    // `currentEntries` array via the fiber gives 100% coverage.
    let _fiberPollTimer = null
    const _fiberSeenIds = new Set()

    function _getFiberEntries() {
        try {
            const el = document.querySelector('[data-tid="closed-caption-v2-virtual-list-content"]')
            if (!el) return null
            const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber'))
            if (!fiberKey) return null
            let fiber = el[fiberKey]
            // Walk up to find the component with currentEntries
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
            // Dedup against DOM-captured transcripts
            const lastT = transcripts[transcripts.length - 1]
            if (lastT && lastT.Text === Text && lastT.Name === Name) continue
            // Also check last few entries for dedup (DOM may have captured with slight text diff)
            const isDup = transcripts.slice(-5).some(t => t.Text === Text && t.Name === Name)
            if (isDup) continue
            const t = stampCaption({ Name, Text, Time: since(startTime) })
            transcripts.push(t)
            chrome.runtime.sendMessage({ message: "update_transcripts", count: transcripts.length })
            try { scheduleAutoSuggest(t) } catch (_) {}
            try { onCaptionForStatus() } catch (_) {}
            try { onCaptionForState(t) } catch (_) {}
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

    let observerOnIframe=false
    let _endPollTimer=null   // polling fallback: detect meeting-end even when
                             // no DOM mutations fire after Leave.
    function checkStatus(mutationList, observer){
        const liveCaptionOnId='#captions-settings-menu-trigger-button, #captions-settings-menu-trigger-button-non-overflow'
        const meetingOnId='#call-duration-custom, [data-tid="call-duration"]'
        let trigger
        if(!enabled){
            if(!isV2 && !observerOnIframe){
                const iframe=document.querySelector('iframe')
                if(iframe?.contentDocument?.body){
                    observer.disconnect()
                    observer.observe(observed=iframe.contentDocument, { childList: true, subtree: true })
                    console.log('observer is switched to iframe')
                    observerOnIframe=true
                    return 
                }
            }
    
            if(startMeeting.doing){
                if(!observed.querySelector(meetingOnId)){
                    delete startMeeting.doing
                }
            }else{
                if(observed.querySelector(meetingOnId)){
                    startMeeting()
                }
            }
    
            if(!!(trigger=observed.querySelector(liveCaptionOnId))){
                enabled=true
                startTranscription(document.body)
                // Polling fallback — Mutation events may stop firing after
                // the user clicks Leave (page settles), in which case the
                // mutation-driven else-branch below never runs and the chat
                // UI stays orphaned. Poll every 1.5s as a backstop.
                if (_endPollTimer) clearInterval(_endPollTimer)
                _endPollTimer = setInterval(() => {
                    if (!enabled) return
                    if (!observed.querySelector(liveCaptionOnId) || !observed.querySelector(meetingOnId)) {
                        enabled = false
                        try { stopTranscription() } catch (e) { console.warn('[meetmate] poll teardown failed', e) }
                        delete startMeeting.doing
                        clearInterval(_endPollTimer); _endPollTimer = null
                    }
                }, 1500)
                return 
            }
        }else{
            // Meeting ended OR captions turned off — either way, tear down.
            if(!observed.querySelector(liveCaptionOnId) || !observed.querySelector(meetingOnId)){
                enabled=false
                stopTranscription()
                delete startMeeting.doing
                if (_endPollTimer) { clearInterval(_endPollTimer); _endPollTimer = null }
            }
        }
    }
    
    function startMeeting(){
        if(startMeeting.doing)
            return 
        startMeeting.doing=true
        try{
            observed.querySelector('#callingButtons-showMoreBtn').click()
            setTimeout(()=>observed.querySelector('#LanguageSpeechMenuControl-id')?.click(),500)
            setTimeout(()=>observed.querySelector('#closed-captions-button')?.click(), 1000)
        }finally{
    
        }
    }
    
    async function startTranscription(container) {
        const durationEl = observed?.querySelector('#call-duration-custom') || observed?.querySelector('[data-tid="call-duration"]') || document.querySelector('[data-tid="call-duration"]')
        const [seconds,minutes,hours=0]=(durationEl?.textContent || '0:00').split(":").map(a=>parseInt(a)).reverse()
        startTime=Date.now()-(hours*60*60+minutes*60+seconds)*1000
        await changeConf({author:getAuthorName()})
        chrome.runtime.sendMessage({message: "start_capture"});
        checkCaptions(container)
        containerObserver=new MutationObserver((mutationList)=>{
            checkCaptions(container)
        })
        containerObserver.observe(container, { subtree:true, childList:true })
        // Start React fiber polling for Teams v2 (catches captions missed by
        // the MutationObserver due to virtual-list rendering).
        try { startFiberPolling() } catch (_) {}
        transcripts.splice(0)
        history.splice(0)
        createUI({transcripts, history})

        // The greeting bubble is now produced by the LLM as its first
        // send_suggestion (see "First message contract" in agent-prompt.md).
        // We no longer hardcode a deterministic greeting here so the model
        // can tailor the goal-collection chips to the user's saved
        // user_context (role, projects, language).

        // Spin up the per-meeting loop session. Suggestions stream back as
        // tool calls and are rendered as bubbles by showSuggestion().
        try {
            const meetingName = getMeetingName()
            const meetingId = `${meetingName || 'meeting'}-${startTime}`
            _captionCountForStatus = 0
            _loop = await makeLoopClient({
                meetingId,
                name: meetingName,
                transcripts,
                history,
            })
            _loop.onSuggestion(showSuggestion)
            // (Dedicated translator session removed 2026-05 — continuous-
            // translation feature retired. Captions feed only the main loop.)
            // ── v4.1 UI controller ────────────────────────────────────────
            try {
                const conf = await getConf().catch(() => null)
                if (conf?.useLegacyUI) {
                    document.body.classList.add('meetmate-legacy')
                } else {
                    document.body.classList.remove('meetmate-legacy')
                    _ui = createUIController({
                        onAsk: (q) => {
                            _askBar = { active: true, query: q, ts: Date.now(), dismissed: false }
                            _uiState = 3; _uiStateEnter = Date.now()
                            // Add a 👤 user-question row to the rail and queue
                            // its id so the next FACT/SUGGEST answer is routed
                            // into its detail container instead of as a fresh
                            // log entry.
                            try {
                                const askId = _ui?.addUserAskRow?.(q)
                                if (askId) {
                                    _pendingAskAnswers.push({ id: askId, ts: Date.now() })
                                    if (_pendingAskAnswers.length > 4) _pendingAskAnswers.shift()
                                }
                            } catch (_) {}
                            try { _loop?.pushUserMsg?.(`[ASK_BAR] ${q}`) } catch (_) {}
                            try { reclassifyState() } catch (_) {}
                            // Auto-dismiss the "active" flag after a short
                            // window so subsequent re-classification can fall
                            // back to sticky-3 then idle.
                            setTimeout(() => { _askBar.active = false }, 1500)
                        },
                        onQuickHelp: ({ quick } = {}) => {
                            if (!quick) return  // focus-only is non-committal
                            _askBar = { active: true, query: '', ts: Date.now(), dismissed: false }
                            _uiState = 3; _uiStateEnter = Date.now()
                            try {
                                const recent = transcripts.slice(-5)
                                    .map(c => `${c.Name}: ${c.Text}`).join('\n')
                                _loop?.pushUserMsg?.(
                                    `[QUICK_HELP] User pressed the quick-help button. Based on these last 5 captions, give 1 short helpful suggestion (action / answer / fact) with up to 3 chips:\n${recent}`
                                )
                            } catch (_) {}
                            try { reclassifyState() } catch (_) {}
                            setTimeout(() => { _askBar.active = false }, 1500)
                        },
                        onTranslateToggle: () => {
                            // (Continuous-translation feature retired — callback no-op.)
                        },
                        onContextSet: (ctx) => {
                            // Persist meeting context locally KEYED BY MEETING
                            // NAME so recurring meetings each keep their own
                            // purpose/goal.
                            const mtgName = getMeetingName() || ""
                            try {
                                chrome?.storage?.local?.get?.(['meetmateContexts'], (res) => {
                                    const map = (res && res.meetmateContexts) || {}
                                    if (mtgName) map[mtgName] = ctx || ""
                                    // Also store as fallback for unnamed meetings
                                    map['__last__'] = ctx || ""
                                    chrome?.storage?.local?.set?.({ meetmateContexts: map })
                                })
                            } catch (_) {}
                            try {
                                if (ctx) {
                                    _loop?.pushUserMsg?.(`[MEETING_CONTEXT] ${ctx}`)
                                } else {
                                    _loop?.pushUserMsg?.(`[MEETING_CONTEXT] (cleared)`)
                                }
                            } catch (_) {}
                        },
                        onAttentionToggle: (on) => {
                            // User toggled the 🎯 attention button. Tell the
                            // LLM this is a high-priority moment so it should
                            // prioritise emitting a SUGGEST + supporting FACTs
                            // + clarifying RESEARCH questions for the centered
                            // panel.
                            try {
                                if (on) {
                                    _loop?.pushUserMsg?.("[FOCUS_HIGH source=attention_toggle] User toggled attention ON — they want help RIGHT NOW. Emit: 1 SUGGEST (proposed reply they could speak), 1-2 FACTs (relevant recall), 1-2 RESEARCH questions (clarifications worth knowing). Concise, ≤ 25 words each.")
                                } else {
                                    _loop?.pushUserMsg?.("[FOCUS_LOW] User toggled attention OFF.")
                                }
                            } catch (_) {}
                        },
                        onWillSay: (text) => {
                            // User clicked a SUGGEST topic branch in the
                            // centered panel — they want to speak to THAT
                            // topic. Tell the LLM to emit refined drafts
                            // focused on that topic.
                            try {
                                _loop?.pushUserMsg?.(`[WILL_SAY] User picked this TOPIC branch to speak to: "${text}". Per trigger 4f: parse the **Topic** label, emit 1-2 refined SUGGEST variants in the SAME topic (different phrasings), and optionally 1 FACT + 1 RESEARCH for the rail. If the line implies a commitment, call remember.`)
                            } catch (_) {}
                        },
                    })
                    // (continuous-translation init removed 2026-05)
                    // Restore previously-saved meeting context (if any) and
                    // push it to the loop so the model has the context
                    // available from turn 0. Only load context that matches
                    // the current meeting title — don't load stale context
                    // from a different meeting.
                    try {
                        const mtgName = getMeetingName() || ""
                        chrome?.storage?.local?.get?.(['meetmateContexts'], (res) => {
                            const map = (res && res.meetmateContexts) || {}
                            // Only load context for THIS meeting title
                            const ctx = (mtgName && map[mtgName]) || ""
                            if (ctx) {
                                _ui.setContextValue?.(ctx)
                                try { _loop?.pushUserMsg?.(`[MEETING_CONTEXT] ${ctx}`) } catch (_) {}
                            }
                        })
                    } catch (_) {}
                    // Periodic reclassify so stickies expire
                    if (_stateTimer) clearInterval(_stateTimer)
                    _stateTimer = setInterval(() => { reclassifyState() }, 1500)
                }
            } catch (e) { console.warn('[meetmate] ui-controller init failed', e) }
            // Expose loop methods so chip taps in renderAssistantBubble() can
            // push the chip label as a user message. Without this, chips were
            // silent no-ops (askLoop/pushUserMsg both undefined on __meetmate).
            window.__meetmate.pushUserMsg = (text) => {
                try { _loop?.pushUserMsg(String(text || '')) } catch (e) { console.warn(e) }
            }
            // Subtle status pill instead of a chat-panel bubble.
            _loop.onConnected?.(() => showStatus('\u2713 Connected \u2014 watching captions', 4000))
            // Current topic: model calls update_live_minutes to show what's
            // being discussed right now. Pipe the markdown into the side panel.
            _loop.onLiveMinutes?.(({ markdown }) => {
                try {
                    const panel = document.getElementById('liveMinutes')
                    if (!panel) return
                    const body = panel.querySelector('.meetmate-minutes-body')
                    const status = panel.querySelector('.meetmate-minutes-status')
                    if (body) body.innerHTML = renderMinutesMarkdown(markdown || '')
                    if (status) status.textContent = `updated ${new Date().toLocaleTimeString()}`
                    // Auto-show the panel on first update.
                    if (panel.style.visibility === 'hidden') {
                        panel.style.visibility = 'unset'
                        document.getElementById('liveMinutesButton')?.classList.add('doing')
                    }
                } catch (_) {}
            })
            // Conversation state tracker: phase badge (REMOVED in v4.1 —
            // End-of-meeting confirmation that the user actually sees in the UI.
            _loop.onMinutes?.(() => {
                showStatus('\u2713 Minutes saved \u2014 open the popup to review', 6000)
            })
            await _loop.start()
        } catch (e) { console.warn('[meetmate] loop start failed', e) }
    }

    function stopTranscription() {
        // Ensure UI cleanup runs even if intermediate steps throw.
        try {
        //add last transcript
        checkStatus(document.body, true)
        transcripts.forEach(a=>{
            a.language && (a.Text=`${a.Text}[?]`);
            a.meeting && (a.Text=`${a.Text}[!]`);
        })
        timer && clearInterval(timer);
        if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null }
        if (_stateTimer) { clearInterval(_stateTimer); _stateTimer = null }
        try { stopFiberPolling() } catch (_) {}
        try { _ui?.destroy(); _ui = null; _uiState = 4; _uiStateEnter = 0; _askBar = { active:false, query:"", ts:0, dismissed:false }; _pendingDetails = []; _pendingAskAnswers = [] } catch (_) {}
        // Flush any remaining captions before signaling end.
        if (_captionBatch.length && _loop) {
            try { _loop.pushCaption(_captionBatch.splice(0)) } catch(_) {}
        }

        // Hand off to the loop session: it will call save_minutes + save_memory
        // before we disconnect.
        const loopRef = _loop
        _loop = null
        if (loopRef) {
            (async () => {
                try { await loopRef.end() } catch(_) {}
                try { resetRelayClient() } catch(_) {}
            })()
        } else {
            try { resetRelayClient() } catch(_) {}
        }

        chrome.runtime.sendMessage({
            message: "stop_capture", 
            transcripts,
            history,
            extras: _extras,
            name: getMeetingName()
        });
        timer=null
        startTime=null
        transcripts.splice(0)
        history.splice(0)
        _extras = []
        if (containerObserver) { containerObserver.disconnect(); containerObserver=null }
        } finally {
        // Tear down any UI the assistant injected (chat panel, action buttons, bubbles).
        // In the finally block so cleanup runs even if earlier steps threw.
        try { Array.from(document.querySelectorAll('.shouldRemove')).forEach(a=>a.remove()) } catch (_) {}
        try { if (messageContainer) { messageContainer.innerHTML = ''; if (messageTimer) { clearTimeout(messageTimer); messageTimer = 0 } } } catch (_) {}
        // Persistent statusPill: just clear its content / state so it doesn't
        // bleed across meetings.
        try {
            statusPill.classList.remove('show')
            statusPill.textContent = ''
            if (_statusFadeTimer) { clearTimeout(_statusFadeTimer); _statusFadeTimer = 0 }
            if (_statusClearTimer) { clearTimeout(_statusClearTimer); _statusClearTimer = 0 }
            _captionCountForStatus = 0
        } catch(_) {}
        }
    }

    const messageContainer=document.createElement('div')
    messageContainer.id="liveAI-message"
    document.body.appendChild(messageContainer)

    // --- Subtle status pill (NOT a chat bubble) -------------------------
    // Used for transient signals like "connected", "live captions: N", and
    // "minutes saved". Auto-fades; never persists in the chat history.
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

    // Track caption count to drive the "live captions: N" status pill.
    // Show once at first caption, then again at 5 / 25 / 100 to confirm
    // the loop is still consuming captions without spamming.
    let _captionCountForStatus = 0
    function onCaptionForStatus() {
        _captionCountForStatus++
        if ([1, 5, 25, 100].includes(_captionCountForStatus)) {
            showStatus(`\uD83C\uDF99 Live captions \u2022 ${_captionCountForStatus} line${_captionCountForStatus===1?'':'s'}`, 2500)
        }
    }
    
    let messageTimer=0
    function showMessage(m){
        if(messageTimer){
            clearTimeout(messageTimer)
            messageTimer=0
        }
        messageContainer.innerHTML=m
        messageTimer=setTimeout(()=>{
            messageContainer.innerHTML=""
            messageTimer=0
        }, 3000)
    }

    /**
     * Render a suggestion bubble with up to 4 clickable option chips.
     * Tapping a chip enqueues a head-of-queue user_msg with the chip label,
     * letting the in-meeting user steer the agent without typing.
     *
     * The bubble is rendered in TWO places:
     *   1. The floating #liveAI-message at the bottom-right (transient,
     *      auto-clears after 30s).
     *   2. The persistent chat panel #aichat (scrollable history).
     * Both use renderAssistantBubble() from util.js so action buttons
     * (Copy / Refine) and chip handlers are wired identically.
     */
    function showSuggestion({ kind, text, options }) {
        if (messageTimer) { clearTimeout(messageTimer); messageTimer = 0 }
        // v4.1: route through the UI controller (center overlay / idle rail
        // based on current state). The legacy #aichat path is kept below for
        // back-compat (its CSS is hidden when v4.1 UI is active).
        try {
            history.push({ role: "assistant", content: text || "", kind, options })
            _extras.push({ type: 'suggestion', kind: kind || 'SUGGEST', text: text || '', Time: since(startTime) })
            if (_ui) {
                // If a FACT/RESEARCH detail expansion was just requested, route
                // the next reply to populateDetail on that entry instead of as
                // a fresh log line.
                const now = Date.now()
                while (_pendingDetails.length && (now - _pendingDetails[0].ts) > 60000) _pendingDetails.shift()
                if (_pendingDetails.length) {
                    const pd = _pendingDetails.shift()
                    try { _ui.populateDetail?.(pd.id, text || "") } catch (_) {}
                    return
                }
                // If the user just asked via the ask-bar and we have an empty
                // 👤 row awaiting its answer, route the FIRST FACT or SUGGEST
                // bubble into that row's detail. Follow-up RESEARCH chips
                // (and any later bubbles) still flow normally to logToRail.
                while (_pendingAskAnswers.length && (now - _pendingAskAnswers[0].ts) > 20000) _pendingAskAnswers.shift()
                if (_pendingAskAnswers.length && (kind === "FACT" || kind === "SUGGEST")) {
                    const pa = _pendingAskAnswers.shift()
                    try { _ui.populateDetail?.(pa.id, text || "") } catch (_) {}
                    try { _ui.renderSuggestion({ kind, text, options }) } catch (e) { console.warn(e) }
                    _askBar.dismissed = true
                    return
                }
                try { _ui.renderSuggestion({ kind, text, options }) } catch (e) { console.warn(e) }
                try { _ui.logToRail?.({ kind, text }) } catch (_) {}
            }
        } catch (_) {}
        // Legacy #aichat is hidden via CSS in v4.1; skip rendering there.
    }

    function getAuthorName(){
        if(isV2){
            const el=document.querySelector("button#idna-me-control-avatar-trigger img")
            return new URLSearchParams(el.src.split("?")[1]).get('displayname')
        }else{
            const el=document.querySelector("button.me-profile profile-picture img")
            const alt=el?.alt||""
            return alt.replace("Profile picture of","").trim()
        }
    }

    // --- Test harness ---------------------------------------------------
    // Inline copy of tests/fixtures/scenarios.json so content scripts don't
    // need a fetch. Keep them in sync. Triggered from any browser context:
    //   window.dispatchEvent(new CustomEvent('meetmate:replay', {detail:'name'}))
    //   window.dispatchEvent(new CustomEvent('meetmate:tap_chip', {detail:'label'}))
    //   window.dispatchEvent(new CustomEvent('meetmate:leave'))
    const TEST_SCENARIOS = {
        silence_chitchat: [
            { Name: 'Alice Chen', Text: 'Did you watch the game last night?', delayMs: 0 },
            { Name: 'Bob Kim', Text: "Yeah, what a finish. Couldn't believe the last shot.", delayMs: 2200 },
            { Name: 'Raymond Li', Text: 'Haha, I missed it, was packing for the trip.', delayMs: 4500 },
        ],
        silence_others_focus: [
            { Name: 'Alice Chen', Text: 'Bob, can you take the customer onboarding session next week?', delayMs: 0 },
            { Name: 'Bob Kim', Text: 'Sure, Tuesday or Wednesday works for me.', delayMs: 2500 },
            { Name: 'Alice Chen', Text: "Tuesday 10am then, I'll send the invite.", delayMs: 5000 },
        ],
        direct_question: [
            { Name: 'Customer (Acme)', Text: "Raymond, what's your team's bandwidth for the integration work next month?", delayMs: 0 },
        ],
        project_grounded: [
            { Name: 'Customer (Acme)', Text: 'How is the Phoenix migration going on your side?', delayMs: 0 },
            { Name: 'Customer (Acme)', Text: 'Anything blocking the rollout we should know about?', delayMs: 2500 },
        ],
        language_barrier: [
            { Name: '客户 (Acme)', Text: 'Raymond，你们 Phoenix 迁移什么时候能完成？', delayMs: 0 },
            { Name: '客户 (Acme)', Text: '我们月底要给董事会汇报。', delayMs: 2500 },
        ],
        unfamiliar_jargon: [
            { Name: 'Customer (Acme)', Text: 'Our concern is whether your service can guarantee MEV-resistant atomic settlement under load.', delayMs: 0 },
        ],
        user_commitment: [
            { Name: 'Bob Kim', Text: 'We still need someone to own the design doc.', delayMs: 0 },
            { Name: 'Raymond Li', Text: "I'll take it. I'll send it out by end of Friday.", delayMs: 2500 },
        ],
        fact_correction: [
            { Name: 'Bob Kim', Text: "Wasn't Q3 user retention around 38 percent?", delayMs: 0 },
        ],
        request_for_advice: [
            { Name: 'Bob Kim', Text: 'Raymond, prod keeps OOM-ing every couple of hours since the last deploy. Any idea where to look first?', delayMs: 0 },
        ],
        end_meeting_wrap: [
            { Name: 'Raymond Li', Text: "Alright let's wrap. Action items: I'll send design doc Friday, Bob owns PR review, Alice schedules customer onboarding Tuesday.", delayMs: 0 },
            { Name: 'Alice Chen', Text: 'Sounds good, talk next week.', delayMs: 3000 },
        ],
        // --- New scenarios covering goal/memory/multi-bubble/translate/minutes/phase ---
        bootstrap_greeting_no_memory: [],
        goal_recall_recurring: [],
        goal_binding_persists: [
            { Name: '__chip_tap__', Text: 'Draft customer replies', delayMs: 500 },
            { Name: 'Customer (Acme)', Text: 'Raymond, can you walk us through your rollback plan?', delayMs: 3000 },
        ],
        multi_bubble_jargon_question: [
            { Name: 'Customer (Acme)', Text: 'Raymond, how does your platform handle MEV-resistant atomic settlement when the validator set rotates mid-block?', delayMs: 0 },
        ],
        user_mentioned_passive: [
            { Name: 'Alice Chen', Text: 'We should probably loop Raymond in on the migration timeline at some point.', delayMs: 0 },
            { Name: 'Bob Kim', Text: 'Yeah, no rush though.', delayMs: 2500 },
        ],
        speech_polish_language_match: [
            { Name: 'Raymond Li', Text: "So basically what I'm trying to say is that we kind of looked at the data and it sort of seems like maybe the migration could possibly slip if we don't sort of get the dual-write thing nailed down by like next week or so.", delayMs: 0 },
        ],
        speech_polish_language_mismatch: [
            { Name: 'Raymond Li', Text: '嗯那个 Phoenix 的事情我们大概下周可能差不多能搞定吧。', delayMs: 0 },
        ],
        // (translate_button_current_intent demo scenario removed 2026-05.)
        live_minutes_decision_action: [
            { Name: 'Alice Chen', Text: 'Decision: we ship Phoenix dual-write to 100% of traffic on Nov 15.', delayMs: 0 },
            { Name: 'Bob Kim', Text: 'Raymond, can you own the rollback runbook by Nov 10?', delayMs: 3000 },
            { Name: 'Raymond Li', Text: "Yes, I'll have it ready by EOD Nov 10.", delayMs: 5500 },
            { Name: 'Alice Chen', Text: "Open question: do we need a customer comms plan? Let's revisit Friday.", delayMs: 8000 },
        ],
        phase_transitions_full_arc: [
            { Name: 'Alice Chen', Text: 'Hey everyone, thanks for joining. Quick agenda: status update, one decision on cutover date, then wrap.', delayMs: 0 },
            { Name: 'Bob Kim', Text: "On the dual-write side, we're seeing a 0.3% mismatch rate. Investigating the root cause now.", delayMs: 4000 },
            { Name: 'Raymond Li', Text: "Let's discuss whether to push cutover from Nov 15 to Nov 22.", delayMs: 8000 },
            { Name: 'Alice Chen', Text: 'Decision: cutover stays Nov 15. We accept the 0.3% mismatch for now.', delayMs: 12000 },
            { Name: 'Bob Kim', Text: 'Alright wrapping up. Action items captured. Talk Thursday.', delayMs: 16000 },
        ],
        chip_click_lifecycle: [
            { Name: 'Customer (Acme)', Text: 'Raymond, can you give us a one-line status on Phoenix?', delayMs: 0 },
            { Name: '__chip_tap__', Text: 'More formal tone', delayMs: 4000 },
        ],

        // ---------------------------------------------------------------
        // Demo-arc scenarios — slices of one coherent meeting between
        // Bob Kim (EM, English), Raymond Li (you, Mandarin native), and
        // 客户 (Acme) (customer, Mandarin). Each slice is independently
        // replayable. Used by demo-video storyboards in
        // .market/assets/demos/<slug>/storyboard.md.
        // ---------------------------------------------------------------

        // Pre-call: Bob gives Raymond two FYIs before the customer joins.
        // Used by `sidebar` (FACT + RESEARCH stream) and `attention-toggle`.
        arc_pre_call: [
            { Name: 'Bob Kim', Text: "Hey Raymond — quick FYI before the customer joins. Prod's been OOM-ing every couple of hours since the last deploy.", delayMs: 0 },
            { Name: 'Bob Kim', Text: 'Also, did you read the Acme security review? They flagged the token rotation flow.', delayMs: 3500 },
            { Name: 'Bob Kim', Text: "OK they're joining now.", delayMs: 7000 },
        ],

        // Customer speaks Mandarin, three accumulating lines. Used by
        // `knowledge-grounded` (line 3 references the migration doc).
        arc_customer_block: [
            { Name: '客户 (Acme)', Text: 'Raymond，你们 Phoenix 迁移什么时候能完成？', delayMs: 0 },
            { Name: '客户 (Acme)', Text: '我们月底要给董事会汇报。', delayMs: 3000 },
            { Name: '客户 (Acme)', Text: '迁移之后的性能回退会不会影响我们高峰期？我们看过你们发的迁移文档但还有疑问。', delayMs: 6000 },
        ],

        // Bob hands the floor to Raymond. Used by `center-mentioned`.
        arc_addressed: [
            { Name: 'Bob Kim', Text: 'Raymond, want to take this one?', delayMs: 0 },
        ],

        // Raymond types a rough Mandarin reply that MeetMate polishes.
        // Used by `center-speaking`.
        arc_user_speak: [
            { Name: 'Raymond Li', Text: '嗯那个 Phoenix 的事情我们大概下周可能差不多能搞定吧，性能回退我们做了 dual-write 应该问题不大。', delayMs: 0 },
        ],

        // Customer wraps. Used by `attention-toggle` (closing chitchat).
        arc_wrap: [
            { Name: '客户 (Acme)', Text: '好，谢谢 Raymond。', delayMs: 0 },
            { Name: 'Bob Kim', Text: 'Talk next week.', delayMs: 2000 },
        ],
    }

    function replayScenario(name) {
        const lines = TEST_SCENARIOS[name]
        if (!lines) { console.warn('[meetmate] unknown scenario:', name, 'available:', Object.keys(TEST_SCENARIOS)); return false }
        if (!enabled) { console.warn('[meetmate] force-enabling for replay scenario:', name); enabled = true; startTranscription(document.body) }
        console.log('[meetmate] replaying scenario:', name, '(' + lines.length + ' lines)')
        lines.forEach(({ Name, Text, delayMs }) => {
            setTimeout(() => {
                if (!enabled) return
                // Special markers: not real captions — drive the UI instead.
                if (Name === '__chip_tap__') {
                    try { tapChipByLabel(Text) } catch (_) {}
                    return
                }
                if (Name === '__toolbar_click__') {
                    const role = Text || 'translate'
                    const btn = document.querySelector(`#liveAI-toolbar button[role="${role}"]`)
                        || document.querySelector(`button[role="${role}"]`)
                    if (btn) btn.click()
                    else console.warn('[meetmate] no toolbar button with role:', role)
                    return
                }
                const t = { Name, Text, Time: since(startTime) }
                transcripts.push(t)
                try { chrome.runtime.sendMessage({ message: 'update_transcripts', count: transcripts.length }) } catch(_) {}
                try { scheduleAutoSuggest(t) } catch (_) {}
                try { onCaptionForStatus() } catch (_) {}
                try { stampCaption(t); onCaptionForState(t) } catch (_) {}
            }, delayMs || 0)
        })
        return true
    }

    function injectFakeCaption(Name, Text) {
        if (!enabled) { enabled = true; startTranscription(document.body) }
        const t = { Name, Text, Time: since(startTime) }
        transcripts.push(t)
        try { chrome.runtime.sendMessage({ message: 'update_transcripts', count: transcripts.length }) } catch(_) {}
        try { scheduleAutoSuggest(t) } catch (_) {}
        try { onCaptionForStatus() } catch (_) {}
        try { stampCaption(t); onCaptionForState(t) } catch (_) {}
    }

    function tapChipByLabel(label) {
        // Chips can render in either the chat panel (#aichat) or the
        // floating bubble (#liveAI-message). Search both.
        const btn = Array.from(document.querySelectorAll('#aichat button.meetmate-chip, #liveAI-message button.meetmate-chip'))
            .find(b => (b.dataset.label || b.textContent || '').trim() === label)
        if (!btn) { console.warn('[meetmate] no chip with label:', label); return false }
        btn.click()
        return true
    }

    document.addEventListener('meetmate:replay', (e) => { replayScenario(e?.detail) })
    document.addEventListener('meetmate:tap_chip', (e) => { tapChipByLabel(e?.detail) })

    // Cross-context bridge: page-world (e.g. agent-browser eval, demo-runtime)
    // can drive scenarios via window.postMessage. postMessage IS cross-world
    // safe, unlike CustomEvent dispatch on window. Content script listens on
    // its own window; the bridge handles message-shaped events.
    window.addEventListener('message', (ev) => {
        try {
            const d = ev?.data
            if (!d || typeof d !== 'object' || d.source !== 'meetmate-bridge') return
            switch (d.type) {
                case 'replay':       if (d.detail) replayScenario(d.detail); break
                case 'tap_chip':     if (d.detail) tapChipByLabel(d.detail); break
                case 'inject_caption': window.__meetmate?.injectCaption?.(d.detail || {}); break
                case 'log_to_rail':  _ui?.logToRail?.({ kind: d.kind || 'SUGGEST', text: d.text }); break
                case 'center_state': _ui?.applyState?.({ state: d.state, payload: d.payload || {} }); break
                case 'center_suggest': _ui?.renderSuggestion?.({ kind: d.kind || 'SUGGEST', text: d.text, options: d.options || [] }); break
                case 'dismiss_center': _ui?.dismissCenter?.(); break
                case 'set_attention': _ui?.setAttention?.(!!d.on); break
                case 'demo_freeze': window.__meetmateDemoFreeze = !!d.on; break
                case 'leave':        document.dispatchEvent(new CustomEvent('meetmate:leave')); break
            }
        } catch (_) {}
    })
    // (meetmate:translate-toggle listener removed 2026-05 — continuous-translation feature retired.)

    // DOM-based trigger for CDP/automation: set data-replay="<scenario>" or
    // data-inject-caption='{"Name":"...","Text":"..."}' on document.body.
    // Uses body (not #aichat) because #aichat is created later by createUI.
    new MutationObserver((muts) => {
        for (const m of muts) {
            if (m.attributeName === 'data-replay') {
                const name = document.body.getAttribute('data-replay')
                if (name) { document.body.removeAttribute('data-replay'); replayScenario(name) }
            }
            if (m.attributeName === 'data-inject-caption') {
                const json = document.body.getAttribute('data-inject-caption')
                if (json) { document.body.removeAttribute('data-inject-caption'); try { const {Name,Text} = JSON.parse(json); injectFakeCaption(Name, Text) } catch(_){} }
            }
        }
    }).observe(document.body, { attributes: true, attributeFilter: ['data-replay', 'data-inject-caption'] })

    // v4.1 — FACT / RESEARCH detail-on-click. Asks the model to expand and
    // routes the next assistant reply back to the originating rail entry.
    document.addEventListener('meetmate:detail_request', (e) => {
        try {
            const { id, kind, text } = e?.detail || {}
            if (!id || !text) return
            _pendingDetails.push({ id, kind, ts: Date.now() })
            if (_pendingDetails.length > 8) _pendingDetails.shift()
            const prompt = kind === 'RESEARCH'
                ? `[DETAIL_RESEARCH] Answer this question concisely in 2-3 sentences. Lead with the direct answer; add 1 sentence on how it applies to the current meeting only if relevant. No new chips. Question: ${text}`
                : `[DETAIL_FACT] Expand on this recalled fact with specifics from memory or the meeting history (who, when, source). 2-3 sentences. Fact: ${text}`
            _loop?.pushUserMsg?.(prompt)
        } catch (_) {}
    })
    // v4.1 — synthetic caption injection from CDP / page world.
    // CDP Runtime.evaluate runs in the page's main world, while content
    // scripts run in an isolated world. window.__meetmate is therefore
    // invisible to CDP — but CustomEvents traverse the boundary. Use an
    // event to drive injectCaption from tests.
    document.addEventListener('meetmate:inject_caption', (e) => {
        try { window.__meetmate?.injectCaption?.(e?.detail || {}) } catch (_) {}
    })
    // Debug snapshot is also exposed via a CustomEvent / response event.
    document.addEventListener('meetmate:debug_request', () => {
        try {
            const snap = window.__meetmate?.debugSnapshot?.() || null
            // Put result on a DOM data attribute the main world can read.
            document.documentElement.dataset.meetmateDebug = JSON.stringify(snap)
        } catch (_) {}
    })
    document.addEventListener('meetmate:leave', () => {
        // Force-tear down without needing the user to click Leave (useful for
        // verifying minutes-saved + cleanup behaviour).
        if (enabled) {
            enabled = false
            try { stopTranscription() } catch (e) { console.warn(e) }
            delete startMeeting.doing
            if (_endPollTimer) { clearInterval(_endPollTimer); _endPollTimer = null }
        }
    })


    observer.observe(
        observed=document, 
        { childList: true, subtree: true }
    );

    chrome.runtime.onMessage.addListener((request)=>{
        switch(request.type){
            case 'message':
                showMessage(request.data)
            break
        }
    })
}


// Guard: content_scripts run in all_frames (manifest), but sandboxed/cross-origin
// child iframes (e.g. some Teams sub-frames) don't get chrome.storage. Bail out
// quietly so we don't throw "Cannot read properties of undefined (reading 'get')".
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    init()
}