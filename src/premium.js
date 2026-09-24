// MeetMate Premium — deliberately soft local gating for a Stripe purchase.

function runtimeRequest(message, payload = {}) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ message, ...payload }, (response) => {
            const runtimeError = chrome.runtime.lastError;
            if (runtimeError) return reject(new Error(runtimeError.message));
            if (!response) return reject(new Error("No response from MeetMate background service"));
            if (!response.ok) return reject(new Error(response.error || "Premium request failed"));
            resolve(response.data);
        });
    });
}

export async function getPremiumStatus({ force = false } = {}) {
    return runtimeRequest("premium_status", { force: !!force });
}

export async function openPremiumUpgrade() {
    return runtimeRequest("premium_upgrade");
}

export async function openPremiumLogin() {
    return runtimeRequest("premium_login");
}

export async function setPremiumPreview(enabled) {
    return runtimeRequest("premium_preview", { enabled: !!enabled });
}

export async function activateStripeSession(sessionId) {
    return runtimeRequest("premium_activate", { sessionId: String(sessionId || "") });
}
