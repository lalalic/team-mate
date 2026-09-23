(() => {
    const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
    const ALLOWED_SCREENSHOT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
    const form = document.querySelector('#feedbackForm'), fileInput = document.querySelector('#screenshot');
    const preview = document.querySelector('#preview'), status = document.querySelector('#status'), submitButton = document.querySelector('#submitButton');
    const params = new URLSearchParams(location.search), product = 'MeetMate';
    const context = { product, surface: 'public-support', version: params.get('version') || document.querySelector('meta[name="product-version"]')?.content || 'unknown', extensionId: params.get('extensionId') || undefined, url: location.href, referrer: document.referrer || undefined, userAgent: navigator.userAgent };
    document.querySelector('#context').textContent = `Context attached: ${context.product} · ${context.surface} · version ${context.version}`;
    fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (!file) { preview.removeAttribute('src'); preview.style.display = 'none'; return; }
        if (!ALLOWED_SCREENSHOT_TYPES.has(file.type) || file.size > MAX_SCREENSHOT_BYTES) { fileInput.value = ''; preview.removeAttribute('src'); preview.style.display = 'none'; return showError('Choose a PNG, JPEG, or WebP image up to 5 MB.'); }
        preview.src = URL.createObjectURL(file); preview.style.display = 'block';
    });
    form.addEventListener('submit', async (event) => {
        event.preventDefault(); clearStatus();
        const message = document.querySelector('#message').value.trim(), email = document.querySelector('#email').value.trim(), file = fileInput.files?.[0];
        if (!message) return showError('Add a short description before sending.');
        if (email && !document.querySelector('#email').checkValidity()) return showError('Check the reply-to email address.');
        if (!document.querySelector('#safeToShare').checked) return showError('Confirm that the feedback is safe to share.');
        if (file && (file.size > MAX_SCREENSHOT_BYTES || !ALLOWED_SCREENSHOT_TYPES.has(file.type))) return showError('Choose a PNG, JPEG, or WebP image up to 5 MB.');
        const record = { schema:'neo.feedback.v1', recordType:'product_feedback', source:{kind:'public_surface', product, surface:context.surface, url:context.url, referrer:context.referrer}, context, feedback:{category:document.querySelector('#category').value, message, email:email || undefined}, consent:{safeToShare:true, confirmedAt:new Date().toISOString()}, attachments:file ? [{field:'screenshot', name:file.name, type:file.type, size:file.size}] : [] };
        const body = new FormData(); body.append('record', JSON.stringify(record)); if (file) body.append('screenshot', file, file.name);
        submitButton.disabled = true; submitButton.textContent = 'Recording feedback…';
        try {
            const endpoint = document.querySelector('meta[name="feedback-endpoint"]')?.content || '/api/feedback';
            const response = await fetch(endpoint, {method:'POST', body, headers:{Accept:'application/json'}}), result = await response.json().catch(() => ({}));
            if (!response.ok || !(result.recordId || result.id || result.status === 'recorded' || result.status === 'accepted')) throw new Error(result.error || `Feedback intake returned ${response.status}.`);
            form.reset(); preview.removeAttribute('src'); preview.style.display = 'none'; showSuccess('Thanks — your feedback was recorded.');
        } catch (error) { showError('We could not record this feedback right now. Please try again later.'); console.error('[meetmate] feedback intake failed', error); }
        finally { submitButton.disabled = false; submitButton.textContent = 'Send feedback'; }
    });
    function clearStatus() { status.textContent = ''; status.className = 'status'; }
    function showError(message) { status.textContent = message; status.className = 'status error'; }
    function showSuccess(message) { status.textContent = message; status.className = 'status success'; }
})();
