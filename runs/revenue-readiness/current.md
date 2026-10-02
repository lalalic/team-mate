# MeetMate revenue readiness audit — current

**Package status:** evidence-backed and ready for release planning; **not ready to publish**.
**Audited at:** 2026-10-02 00:14 UTC.
**Current main evidence base:** `lalalic/team-mate@b7c43c0077f2e151ea1dc7f8f5012d3a80489efa` (“Structured two-level knowledge TOC”).
**Managed PR head:** `revenue/v3@ac127c806f62ee6b2ebdcff01e645ed443ce2cd1`; the audit output is the only file added there.
**Diagnosis:** root cause is not applicable to this audit task. The implemented solution is this completed evidence audit/package.

## Executive decision

MeetMate has a coherent free/Premium product boundary in current main and both Stripe Payment Link surfaces are live, but revenue is not reachable through the current public funnel: Chrome Web Store still exposes version **4.2.0** with copy for removed capabilities. The shortest revenue path is therefore a corrective release, not new feature work.

Do not market the current public listing. Publish a current, copy-cleaned 4.5.7 build and replace the stale store/home-page claims first. Pricing, entitlement architecture, and product scope must remain unchanged.

## Current product behavior relevant to Premium Knowledge

Current main remains MeetMate’s grounded-Q&A scope: Teams captions append locally, the model is called only through an explicit ask, and answers use the bounded transcript plus knowledge context. There is no caption-triggered autonomous loop.

The implemented Knowledge behavior is:

- Users may upload any file type into local `chrome.storage.local`; storage follows browser capacity.
- Organization is **manual/on-demand**: the user clicks **Organize now**. Current main explicitly states that file changes never trigger the model automatically.
- The organized result is a two-level table of contents plus node content. The model receives only the compact catalog during meetings and can call the single `search_knowledge` tool for supporting detail.
- Free users receive Knowledge/Q&A but the final organized knowledge is limited to **5,000 characters**. Premium removes that cap.
- Premium also removes the three-shown-shortcut limit and enables answer provenance/sources plus the structured end-of-meeting report.

**Copy constraint:** current main does **not** implement “automatic organization.” Position it as *on-demand model organization plus in-meeting retrieval*. Automatic organization is rejected below as an insufficiently evidenced claim.

Current main has no tracked `Ask Knowledge` string. A comprehensive current-main search for the phrase returned no result. The public surfaces require the separate cleanup because they are not generated from current main.

## Fresh release, store, and payment status

### Current source and validation

| Surface | Fresh observation | Result |
|---|---|---|
| `origin/main` | Fetched and audited at `b7c43c0`; versions in both package/manifest remain `4.5.6`. | Current source is newer than the released artifact. |
| Unit tests | `npm test` on a detached current-main worktree: 39 focused-helper checks, 4 config-merge checks, plus feedback, Premium state, and meeting-file checks passed. | Validation passed. |
| Safety build | Clean unconfigured production build and `verify:release` passed; ZIP SHA-256 `f046b93a5fba9959fc38f6c373d3f94ab18d83569e037d11176b5e8b6674f580`; no Stripe link in bundle. | The safe free-plan build path works. |
| Source delta | Current main has 536 added / 77 removed lines in `src/` and extension settings versus release commit `c346006`, while the version is unchanged. | The GitHub artifact cannot be described as “current main” without a version bump. |

### GitHub Release

- `v4.5.6` was published on 2026-10-01 from commit `c34600651b404019133c129fd960cb9d55c5ee6f`.
- Fresh download of `team-mate.zip` returned HTTP 200; observed size 126,088 bytes and SHA-256 `475927addb9a90cac300d9334ecbb6e80b0a301ee8f02225d78480df5f813e56`; ZIP integrity passed.
- The artifact manifest reports version 4.5.6 and contains two distinct configured Stripe Payment Links.
- Workflow evidence from run `36866062895` confirms both the unconfigured safe path and configured one-time/weekly path passed, without exposing secret values.

### Chrome Web Store

Fresh public listing observation at 2026-10-02 00:07 UTC:

- URL: `https://chromewebstore.google.com/detail/meetmate-%E2%80%94-live-facts-kno/immkojolaicdjhkbbhkldmndhfjbehmf`.
- Public version: **4.2.0**, updated May 19, 2026.
- Public title/overview still advertise **Knowledge, Speaking Coach & Memory**, live minutes, autonomous suggestions, cross-meeting memory, and $1/$10/$100 pay-as-you-go top-ups.
- Observed social proof: 75 users and no ratings.
- The store-declared privacy and support links resolve to current MeetMate privacy/support pages.

This listing is commercially unsafe: it describes deliberately removed architecture and a different pricing model, while the public version predates current Premium Knowledge behavior.

### Publisher access blocker

Fresh navigation to the extension’s Chrome Web Store package URL redirected to Google Sign-in. The available browser was not authenticated to the publisher account. No local or repository-visible `CWS_*` OAuth credential was available, and the repository has no `CWS_*` GitHub secret.

**Exact human action:** in the authorized Chrome session, sign in to the Chrome Web Store publisher account that owns extension `immkojolaicdjhkbbhkldmndhfjbehmf`, complete any required Google MFA/verification, and grant Chrome Web Store consent if prompted. Do not claim that MFA is definitely required; only the authenticated session can reveal that next step. Alternatively, provide an authorized `CWS_REFRESH_TOKEN` plus `CWS_CLIENT_ID`/`CWS_CLIENT_SECRET`.

### Stripe payment surfaces

No purchase or test transaction was made, and pricing was not changed.

- GitHub Action secrets `STRIPE_ONE_TIME_PAYMENT_LINK` and `STRIPE_WEEKLY_PAYMENT_LINK` exist; the latest release workflow confirmed both configured build paths. Their values remain redacted.
- The 4.5.6 release bundle contains two unique `buy.stripe.com` links.
- Fresh browser observation confirmed both Stripe Checkout pages render:
  - **MeetMate Premium One Time**: US$1.99 / observed CA$2.94, with card and Alipay payment methods.
  - **MeetMate Premium Weekly**: subscription to **MeetMate Premium Weekly**, observed CA$2.94 per week, with currency selection and card payment form.
- The entitlement service at `https://stripe.qili2.com/v1/entitlement` responded to controlled invalid-session probes with `active:false,status:not_found` for well-formed session IDs and `invalid_session_id` for malformed IDs. The request bound product to `team-mate`.
- The public success page is reachable and preserves Checkout session/purchase parameters before handing off to the extension setup page.

**Still unproven:** a completed paid Checkout and automatic activation on an installed extension. Do not claim successful end-to-end purchase conversion until a real payment is observed through Stripe and activation/refresh is verified.

### Public marketing site

The CDN `https://cdn.qili2.com/pub/teams/index.html` remains a stale pre-Premium page: it advertises autonomous suggestions, live minutes, cross-meeting memory, pay-as-you-go top-ups, and “~$2/month typical.” Current-main `www/index.html` instead describes grounded Q&A, Free + optional Premium, and the correct Stripe boundary.

The current-main public home page must be deployed before a corrected store launch. CDN credentials were not available to this worker, so deployment remains blocked.

## Rejected claims

The following claims are rejected for this release because current evidence is insufficient or contradicts current behavior:

- **“Automatic organization”** — current main requires the user to click **Organize now**.
- **“Ask Knowledge”** — absent from current main tracked source; public/stale copy only.
- **Autonomous suggestions, live minutes, cross-meeting memory, speaking coach, or memory** — removed scope; still visible in stale 4.2.0 CWS copy and stale CDN home copy.
- **$1/$10/$100 pay-as-you-go top-ups** — replaced by the fixed one-time/weekly Premium model.
- **“Most users spend $1–3/month” or any revenue/install performance claim** — no supporting current conversion data.
- **“4.4.9 / 4.5.6 is publicly shipped”** — prior claims are history. Fresh public CWS evidence remains 4.2.0.
- **End-to-end purchase success** — payment pages and entitlement probe are verified, but a paid conversion is not.

## Exact blockers

1. **Stale CWS listing/version:** public 4.2.0 copy must be replaced before promotion.
2. **Publisher authentication:** requires authorized human Google/CWS sign-in or OAuth credentials.
3. **Current source is unreleased:** current main is ahead of the 4.5.6 artifact but still identifies 4.5.6. It needs a copy-cleaned patch release.
4. **Manual listing fields:** CWS API does not update long description, category, screenshots, or tiles; a publisher must edit them.
5. **Stale CDN home page:** requires Qiniu credentials/authorized deployment.
6. **No conversion telemetry:** measurement depends on Stripe dashboard plus CWS dashboard; do not add speculative product instrumentation for this release.

## Minimum next commercial step

Ship one corrective Premium release. No pricing change, architecture change, or new feature is required.

1. Merge the separate grounded Premium copy cleanup, ensuring every user-facing/store-facing string uses **Premium Knowledge = on-demand organization + in-meeting retrieval** and omits `Ask Knowledge`.
2. Bump package/manifest together to **4.5.7** because this is a user-visible release after the current-main behavior changes.
3. Run the existing workflow with both Stripe Payment Link secrets; verify one-time and weekly configured paths, no secrets in the bundle, tests, build, and ZIP integrity.
4. Deploy the already-current `www/` marketing, privacy, support, and success pages to CDN.
5. With authorized publisher access, upload the 4.5.7 ZIP, replace title/short/long listing copy and screenshots, retain the verified privacy/support URLs, and submit for review.
6. Verify the public CWS detail page reports exactly 4.5.7 and corrected copy before any promotion.

## Market-safe core positioning

**Positioning:** MeetMate is private, grounded Q&A inside Microsoft Teams. Premium Knowledge adds on-demand organization of your own files and in-meeting retrieval, while Premium removes shortcut limits and adds answer provenance and a structured meeting report.

**Primary CTA:** Install free from Chrome Web Store; upgrade to US$1.99 one-time/7-day or US$1.99/week only after the corrected version is publicly verified.

Claim-to-evidence map for launch copy:

| Approved claim | Evidence source |
|---|---|
| Captions stay local until an explicit ask; model is grounded in transcript/knowledge. | Current-main README architecture and `src/focused.js` tests. |
| Any-file Knowledge is local; organization is on-demand. | Current-main `extension/setup.html`, `src/setup.js`, tests. |
| In-meeting retrieval uses `search_knowledge` and a compact catalog. | Current-main `src/focused.js`, Knowledge UI, focused-helper tests. |
| Premium removes the 5,000-character organized-knowledge cap. | Current-main Knowledge card and `maxChars: paid ? 0 : 5000` implementation. |
| Premium adds unlimited shown shortcuts, provenance/sources, structured report. | Current-main Premium card and Premium/status tests. |
| Two payment choices are US$1.99 one-time/7-day and US$1.99/week. | Source constants, GitHub workflow configured-path evidence, fresh Stripe pages. |

## Measurement criteria for the next commercial step

Use existing dashboards only. Do not add speculative analytics code for this corrective release.

Before promotion, all launch gates must be true:

- Public CWS version is exactly **4.5.7**.
- Public title/short/long copy and screenshots contain no removed-feature claims and no `Ask Knowledge`.
- Public home page matches current-main positioning and both CTA/payment choices.
- Both payment buttons are enabled in the installed release and open the observed Stripe surfaces without exposing secrets.

Measure the first 7 days after public 4.5.7 verification:

- **Traffic:** record CWS listing views and new-install count from CWS dashboard daily.
- **Acquisition:** target at least **100 listing views** and **10 new installs** as the first meaningful demand signal; below either threshold, stop paid/organic promotion and revise listing framing before code work.
- **Purchase intent:** record Stripe Checkout sessions started by one-time versus weekly mode.
- **Revenue:** target at least **1 completed payment** and at least **1 distinct Premium activation observed from an authorized manual install**. A Checkout page view is not revenue.
- **Activation quality:** weekly refresh calls the `team-mate` entitlement endpoint and returns `active:true` after a completed weekly payment; one-time entitlement remains locally valid for seven days. Track support tickets and activation failures separately.
- **Social proof:** record ratings/reviews, including any activation, payment, or removed-feature confusion.

Do not scale promotion until the public version/copy gate passes and at least one completed payment plus activation is observed.

## Handoff and unresolved evidence

**Release Agent handoff requirements:** merged copy cleanup; 4.5.7 source/build; both Stripe links configured as secrets; safe and configured bundle checks; public CDN refresh; authorized CWS publisher session; exact post-publication version/copy verification; fresh release manifest.

**Missing evidence:** completed paid transaction, authenticated CWS listing screens, CWS upload/review status, CDN deployment status after 4.5.7, and quantitative post-launch conversion. These items are not fulfilled by this package.

**No speculative work authorized:** no pricing change, new Knowledge feature, autonomous loop, analytics implementation, or other scope expansion is required for the shortest commercial step.
