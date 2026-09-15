// src/ui-controller.js
//
// The in-meeting rail. There is no state machine here: the rail is a static
// Q&A surface that is always available while a meeting is being captured.
//
//   ┌ MeetMate ────────────────┐
//   │ [Reply][Facts][Q][Chal.] │  ← configured shortcuts (one tap = one ask)
//   │ ─────────────────────────│
//   │ 👤 Why is cutover at risk?│  ← asked questions + grounded answers
//   │ 💡 Bob said the dual-write…│
//   │ ─────────────────────────│
//   │ [Ask anything…      ][↩] │  ← free-form ask
//   └──────────────────────────┘

const escapeHtml = (s) => String(s == null ? "" : s)
    .replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));

const withBreaks = (s) => escapeHtml(s).replace(/\n/g, "<br>");

const LOG_MAX = 40;

/**
 * @param {object} opts
 * @param {(question: string) => void} opts.onAsk  single entry point for both
 *        shortcut taps and typed questions.
 * @param {Array<{label: string, prompt: string}>} [opts.shortcuts]
 */
export function createUIController({ onAsk, shortcuts = [] } = {}) {
    const rail = ensureEl("meetmate-rail", `
        <div class="mm-r-head">
            <span class="mm-r-title">MeetMate</span>
            <button class="mm-r-toggle" type="button" title="Minimize" aria-label="Minimize MeetMate">–</button>
        </div>
        <div class="mm-r-chips"></div>
        <div class="mm-r-log">
            <div class="mm-r-empty">Live captions are being captured locally. Tap a shortcut or ask a question — nothing is sent to the model until you do.</div>
        </div>
        <div class="mm-r-asker">
            <input type="text" placeholder="Ask anything…" />
            <button class="mm-r-send" title="Send">↩</button>
        </div>
    `);
    rail.classList.add("shouldRemove");

    const logEl = rail.querySelector(".mm-r-log");
    const chipsEl = rail.querySelector(".mm-r-chips");
    const inputEl = rail.querySelector(".mm-r-asker input");
    const toggleBtn = rail.querySelector(".mm-r-toggle");

    const shortcutTooltip = document.createElement("div");
    shortcutTooltip.className = "mm-r-shortcut-tooltip shouldRemove";
    shortcutTooltip.setAttribute("role", "tooltip");
    shortcutTooltip.style.display = "none";
    document.body.appendChild(shortcutTooltip);

    function showShortcutTooltip(btn, prompt) {
        shortcutTooltip.textContent = String(prompt || "");
        shortcutTooltip.style.display = "block";
        shortcutTooltip.style.visibility = "hidden";
        const rect = btn.getBoundingClientRect();
        const tipRect = shortcutTooltip.getBoundingClientRect();
        let left = rect.left - tipRect.width - 8;
        if (left < 8) left = Math.min(window.innerWidth - tipRect.width - 8, rect.right + 8);
        let top = rect.top + rect.height / 2 - tipRect.height / 2;
        top = Math.max(8, Math.min(window.innerHeight - tipRect.height - 8, top));
        shortcutTooltip.style.left = `${Math.max(8, left)}px`;
        shortcutTooltip.style.top = `${top}px`;
        shortcutTooltip.style.visibility = "visible";
    }

    function hideShortcutTooltip() {
        shortcutTooltip.style.display = "none";
    }

    let minimized = false;
    let entrySeq = 0;
    let currentShortcuts = [];

    function setMinimized(next) {
        minimized = !!next;
        rail.classList.toggle("minimized", minimized);
        toggleBtn.textContent = minimized ? "+" : "–";
        toggleBtn.title = minimized ? "Restore" : "Minimize";
        toggleBtn.setAttribute("aria-label", minimized ? "Restore MeetMate" : "Minimize MeetMate");
    }
    toggleBtn.addEventListener("click", () => setMinimized(!minimized));

    const askFromInput = () => {
        const q = String(inputEl.value || "").trim();
        if (!q) return;
        inputEl.value = "";
        submit(q);
    };
    rail.querySelector(".mm-r-send").addEventListener("click", askFromInput);
    inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            askFromInput();
        }
    });

    /** Fire an ask for `question` and render the pending row. */
    function submit(question) {
        const q = String(question || "").trim();
        if (!q) return null;
        const id = addUserAsk(q);
        try { onAsk?.(q, id); } catch (e) { console.warn("[meetmate] ask failed", e); }
        return id;
    }

    function clearEmpty() {
        const empty = logEl.querySelector(".mm-r-empty");
        if (empty) empty.remove();
    }

    function trimLog() {
        while (logEl.children.length > LOG_MAX) logEl.removeChild(logEl.firstChild);
    }

    /** Append the 👤 row for a question. Returns the entry id. */
    function addUserAsk(text) {
        const q = String(text || "").trim();
        if (!q) return null;
        clearEmpty();
        const id = `mm-entry-${++entrySeq}`;
        const entry = document.createElement("div");
        entry.id = id;
        entry.className = "mm-r-log-entry mm-r-kind-userask mm-r-clickable";
        entry.dataset.kind = "USERASK";
        entry.innerHTML = `
            <div class="mm-r-log-row">
                <span class="mm-r-log-icon" title="You asked">👤</span>
                <span class="mm-r-log-text">${escapeHtml(q)}</span>
            </div>
            <div class="mm-r-log-detail"><em class="mm-r-loading">Thinking…</em></div>
        `;
        const detailEl = entry.querySelector(".mm-r-log-detail");
        entry.addEventListener("click", (ev) => {
            ev.stopPropagation();
            detailEl.style.display = detailEl.style.display === "none" ? "block" : "none";
        });
        logEl.appendChild(entry);
        logEl.scrollTop = logEl.scrollHeight;
        trimLog();
        return id;
    }

    function detailOf(id) {
        const entry = document.getElementById(id);
        return entry ? entry.querySelector(".mm-r-log-detail") : null;
    }

    /** Fill the row's detail block with the grounded answer. */
    function resolveAsk(id, answer, sources = []) {
        const detail = detailOf(id);
        if (!detail) return false;
        const text = String(answer || "").trim();
        detail.innerHTML = text
            ? `<div class="mm-r-answer">${withBreaks(text)}</div>`
            : '<em class="mm-r-loading">No answer returned.</em>';

        const usable = Array.isArray(sources) ? sources.filter(Boolean) : [];
        if (usable.length) {
            const box = document.createElement("details");
            box.className = "mm-r-sources";
            const summary = document.createElement("summary");
            summary.textContent = `Sources · ${usable.length}`;
            box.appendChild(summary);
            for (const source of usable) {
                const row = document.createElement("div");
                row.className = "mm-r-source";
                if (source.type === "knowledge") {
                    row.innerHTML = `<strong>${escapeHtml(source.source || "Knowledge")}</strong><span>${escapeHtml(source.quote || "")}</span>`;
                } else {
                    const label = `${source.speaker || "Speaker"}${source.time ? ` · ${source.time}` : ""}`;
                    row.innerHTML = `<strong>${escapeHtml(label)}</strong><span>${escapeHtml(source.quote || "")}</span>`;
                }
                box.appendChild(row);
            }
            detail.appendChild(box);
        }

        detail.style.display = "block";
        logEl.scrollTop = logEl.scrollHeight;
        return true;
    }

    /** Turn the pending row into an error row. */
    function failAsk(id, message) {
        const detail = detailOf(id);
        if (!detail) return false;
        const text = message && message.message ? message.message : message;
        detail.innerHTML = `<em class="mm-r-loading">⚠️ ${escapeHtml(text || "Failed.")}</em>`;
        detail.style.display = "block";
        return true;
    }

    /** Re-render the shortcut buttons (Setup changes apply live). */
    function setShortcuts(list) {
        currentShortcuts = Array.isArray(list) ? list : [];
        chipsEl.innerHTML = "";
        for (const s of currentShortcuts) {
            if (!s || !s.label || !s.prompt) continue;
            const btn = document.createElement("button");
            btn.className = "mm-r-chip";
            btn.type = "button";
            btn.setAttribute("aria-label", `${s.label}: ${s.prompt}`);
            btn.innerHTML = `<span class="mm-r-chip-text">${escapeHtml(s.label)}</span>`;
            btn.addEventListener("mouseenter", () => showShortcutTooltip(btn, s.prompt));
            btn.addEventListener("mouseleave", hideShortcutTooltip);
            btn.addEventListener("focus", () => showShortcutTooltip(btn, s.prompt));
            btn.addEventListener("blur", hideShortcutTooltip);
            btn.addEventListener("click", () => { hideShortcutTooltip(); submit(s.prompt); });
            chipsEl.appendChild(btn);
        }
        chipsEl.style.display = currentShortcuts.length ? "" : "none";
    }
    setShortcuts(shortcuts);

    function destroy() {
        try { rail.remove() } catch (_) {}
        try { shortcutTooltip.remove() } catch (_) {}
    }

    return {
        setShortcuts,
        submit,
        addUserAsk,
        resolveAsk,
        failAsk,
        setMinimized,
        destroy,
    };
}

function ensureEl(id, innerHTML) {
    let el = document.getElementById(id);
    if (el) {
        // Reset contents on reload so template changes take effect while the
        // host page stays alive.
        el.innerHTML = innerHTML;
        return el;
    }
    el = document.createElement("div");
    el.id = id;
    el.innerHTML = innerHTML;
    document.body.appendChild(el);
    return el;
}
