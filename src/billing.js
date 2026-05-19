// Client-side balance ledger — Stripe one-time top-ups, no server.
//
// chrome.storage.local.billing shape:
//   {
//     credits: number,                  // total USD added via top-ups
//     creditedSessions: { [sid]: ts },  // dedupe by Stripe checkout_session_id
//   }
//
// Balance shown in setup = credits - usage.cost (from relay.js)

const KEY = 'billing';

function defaults() { return { credits: 0, creditedSessions: {} }; }

export async function getBilling() {
    return new Promise((resolve) => {
        try {
            chrome.storage.local.get([KEY], (res) => {
                const b = res[KEY] || defaults();
                if (typeof b.credits !== 'number') b.credits = 0;
                if (!b.creditedSessions || typeof b.creditedSessions !== 'object') b.creditedSessions = {};
                resolve(b);
            });
        } catch { resolve(defaults()); }
    });
}

async function setBilling(b) {
    return new Promise((resolve) => {
        try { chrome.storage.local.set({ [KEY]: b }, () => resolve(b)); }
        catch { resolve(b); }
    });
}

/**
 * Apply a credit, server-verified against Stripe and deduped by session id.
 *
 * The URL `amount` parameter is IGNORED (it is forgeable). The real amount
 * comes from `/stripe/verify` which calls Stripe API to confirm payment_status
 * and returns amountTotalCents. This is the only safe way to credit users.
 *
 * Returns { applied: boolean, credits: number, reason?: string }.
 */
const RELAY_VERIFY_URL = 'https://relay.ai.qili2.com/stripe/verify';

export async function applyCredit({ sessionId, amount /* ignored, kept for back-compat */ }) {
    const sid = String(sessionId || '').trim();
    if (!sid) return { applied: false, credits: 0, reason: 'missing session id' };
    const b = await getBilling();
    if (b.creditedSessions[sid]) {
        return { applied: false, credits: b.credits, reason: 'already credited' };
    }
    // Verify with relay (which calls Stripe API).
    let verify;
    try {
        const r = await fetch(RELAY_VERIFY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sid }),
        });
        verify = await r.json();
    } catch (e) {
        return { applied: false, credits: b.credits, reason: 'verify request failed: ' + (e.message || e) };
    }
    if (!verify || !verify.ok) {
        return { applied: false, credits: b.credits, reason: verify?.error || 'verify rejected' };
    }
    const cents = Number(verify.amountTotalCents);
    if (!Number.isFinite(cents) || cents <= 0) {
        return { applied: false, credits: b.credits, reason: 'invalid amount from verify' };
    }
    const num = cents / 100;
    b.credits += num;
    b.creditedSessions[sid] = Date.now();
    await setBilling(b);

    // Mirror the server-authoritative wallet balance if relay sent one.
    if (Number.isFinite(Number(verify.balanceCents))) {
        try { chrome.storage.local.set({ walletBalanceCents: Number(verify.balanceCents) }); } catch {}
    }

    return { applied: true, credits: b.credits, amount: num, balanceCents: Number(verify.balanceCents) };
}

export async function clearBilling() {
    return setBilling(defaults());
}
