// MeetMate Premium — deliberately soft client-side gating.
//
// ExtensionPay is used only in background.js. UI/content code talks to the
// background through these small helpers so payment code never leaks into the
// meeting logic. A local preview override is available only in builds where
// no ExtensionPay extension id was configured.

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

