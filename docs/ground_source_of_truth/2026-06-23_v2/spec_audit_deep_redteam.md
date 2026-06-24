# Deep Specification Audit Report — DealRadar v2

**Auditor:** Principal Architect (Red-Team Pass)  
**Date:** 2026-06-23  
**Method:** Line-by-line cross-reference of v2 specs × source PRD × live codebase × 2025/2026 industry best practices  
**Scope:** All files in `docs/ground_source_of_truth/2026-06-23_v2/` + every relevant source file

---

## Audit Methodology

| Axis | What was checked |
|---|---|
| **Spec ↔ Source PRD** | Every claim in v2 specs traced back to a line in [DealRadar.md](file:///Users/danielmanzela/DealRadar/docs/High-level%20docs/DealRadar.md) |
| **Spec ↔ Live Codebase** | Every file path, function name, interface field, and column name verified against actual source |
| **Spec ↔ Industry SOTA** | Compared against Idealo/MyDealz/Pepper/PriceRunner patterns and 2025/2026 regulatory guidance |
| **Internal Consistency** | Cross-referenced requirements.md ↔ design.md ↔ tasks.md for drift |
| **False Positive Check** | Re-validated all 12 original audit findings to confirm they are genuinely resolved |

---

## Section 1: Original 12 Audit Findings — Revalidation Status

> [!TIP]
> All 12 findings from `spec_audit.md` have been re-verified against the live codebase and remain correctly resolved in the v2 specifications. No regressions detected.

| ID | Finding | Status |
|---|---|---|
| D-1 | Deduplication Contradiction | ✅ Correctly resolved — Hybrid strategy (EAN → name+merchant → lowest price → priority) |
| M-1 | Missing `price_history` Table | ✅ Correctly resolved — Full DDL with trigger in design.md |
| M-2 | Missing `transactions` Table | ✅ Correctly resolved — Full DDL with RLS and indexes |
| H-1 | Strackr Endpoint URL | ✅ Correctly marked provisional, Phase 0 task exists |
| H-2 | Strackr Response Payload | ✅ Correctly marked provisional |
| D-2 | Cron Schedule Mismatch | ✅ Correctly resolved — daily schedule documented |
| D-3 | `updated_at` Column Mismatch | ✅ Correctly resolved — maps to existing `last_updated` |
| D-4 | Strackr Service Path | ✅ Correctly resolved — `src/lib/providers/strackr.ts` |
| M-3 | Missing `STRACKR_API_KEY` | ✅ Task 7.1 covers `.env.example` update |
| M-4 | Strackr CDN remotePatterns | ✅ Task 7.2 covers `next.config.mjs` update |
| M-5 | subID Parameter Structure | ✅ Correctly specified with network-specific param mapping |
| M-6 | Sitemap Path Architecture | ✅ Root-level `sitemap.ts` with alternates |
| M-7 | GDPR/Privacy Assessment | ✅ HMAC unsubscribe + data minimization documented |
| M-8 | Deal Detail `notFound` | ✅ `notFound()` handling specified |

---

## Section 2: New Findings (Red-Team Deep Pass)

### Finding N-1: Missing Unsubscribe Link in Email Template

| Attribute | Value |
|---|---|
| **Severity** | 🔴 **CRITICAL — GDPR Compliance Breach** |
| **Category** | Spec ↔ Live Codebase |
| **Evidence** | [alerts.repo.ts L84-94](file:///Users/danielmanzela/DealRadar/src/lib/db/alerts.repo.ts#L84-L94) — The `priceDropEmail()` function generates the email HTML. It has **zero** unsubscribe link. The only footer text is: `"You're receiving this because you set a price alert on DealRadar."` |
| **Spec Claim** | `FR-PRIV-2` in requirements.md states: *"the system shall append an automated secure unsubscribe link"*. design.md specifies the HMAC token generation and `/api/alerts/unsubscribe` endpoint. |
| **The Gap** | The v2 spec **correctly specifies** the unsubscribe endpoint and HMAC logic, but does **not explicitly include a task or design detail** for modifying the existing `priceDropEmail()` function in `alerts.repo.ts` to actually embed the unsubscribe URL in the email HTML. The tasks.md only has Task 6.5 (create the unsubscribe route) — it never mentions updating the email template. |
| **Risk** | Without the link in the email body, the entire HMAC unsubscribe architecture is dead code. GDPR Article 7(3) and ePrivacy regulations require a withdrawal mechanism in **every** commercial email. German UWG §7 explicitly penalizes email without clear opt-out. |
| **Resolution** | Add an explicit task to modify `priceDropEmail()` in `alerts.repo.ts` to inject the HMAC-signed unsubscribe URL. The email must include both: (1) a visible "Unsubscribe" text link, and (2) a `List-Unsubscribe` header in the `sendEmail()` function for RFC 8058 compliance. |

---

### Finding N-2: Missing `robots.txt` Disallow for `/api/postbacks`

| Attribute | Value |
|---|---|
| **Severity** | 🟡 **WARNING — Security/SEO** |
| **Category** | Spec ↔ Source PRD |
| **Evidence** | Source PRD (DealRadar.md L490-491) disallows `/api/click` and `/api/refresh`. `FR-GEO-3` in requirements.md copies this: *"disallowing execution routes (`/api/click`, `/api/refresh`)"*. |
| **The Gap** | The v2 spec adds a new `/api/postbacks` endpoint (Task 5.2) but the `robots.txt` specification in `FR-GEO-3` does **not** include a `Disallow: /api/postbacks` rule. Additionally, `/api/click` doesn't exist in the codebase — there is no such route in [src/app/api/](file:///Users/danielmanzela/DealRadar/src/app/api). The spec blindly copied the source PRD's `Disallow` rules without verifying against actual routes. |
| **Risk** | Low — bots hitting `/api/postbacks` would get 401s. But the `robots.txt` spec is factually inaccurate about which routes exist. |
| **Resolution** | Update `FR-GEO-3` and design.md `robots.txt` spec to: (1) Remove `/api/click` (does not exist), (2) Add `/api/postbacks`, (3) Add `/api/alerts` (contains PII endpoint), (4) Consider blanket `Disallow: /api/` for simplicity. |

---

### Finding N-3: Affiliate Disclosure Not Adjacent to Links

| Attribute | Value |
|---|---|
| **Severity** | 🟡 **WARNING — Regulatory Compliance** |
| **Category** | Industry SOTA ↔ Live Codebase |
| **Evidence** | [Footer.tsx L9](file:///Users/danielmanzela/DealRadar/src/components/layout/Footer.tsx#L9) — The affiliate disclosure is in the footer only: `t('affiliateDisclosure')`. Best practice (per EU/FTC 2025 guidance) requires disclosure **adjacent to the affiliate link itself**, not buried in the footer. |
| **Spec Claim** | `FR-PRIV-1` mentions footer links. The spec_audit.md says *"Affiliate Disclosure Statement: Already rendered in the footer."* |
| **The Gap** | The v2 spec treats the footer placement as sufficient. Industry SOTA (confirmed by our web research) says disclosures must be "unavoidable" and placed "directly next to affiliate links." The existing `rel="noopener nofollow sponsored"` in [DealCard.tsx L91](file:///Users/danielmanzela/DealRadar/src/components/deals/DealCard.tsx#L91) is correct for SEO but invisible to users. |
| **Risk** | Medium — German UWG (unfair competition law) and EU Directive 2005/29/EC on unfair commercial practices could flag this. MyDealz/Pepper always show "Affiliate-Link" badges adjacent to outbound links. |
| **Resolution** | Add a visible "Affiliate Link" or "Werbung" badge/tooltip directly on deal cards and the deal detail page next to the CTA button. This does NOT require architectural changes — it's a CSS/copy task. Add as a sub-task under Task 6.1 and 6.2. |

---

### Finding N-4: Missing Cookie Consent Banner Specification

| Attribute | Value |
|---|---|
| **Severity** | 🟡 **WARNING — GDPR Compliance** |
| **Category** | Industry SOTA ↔ v2 Specs |
| **Evidence** | design.md Section 4 mentions *"Cookie consent details (Essential cookies vs optional analytics preferences)"* under the Privacy Policy page content. `FR-PRIV-1` mentions *"an option to adjust cookie preferences"* in the footer. But **no task, no component, and no technical specification** exists anywhere in the v2 spec suite for an actual cookie consent banner/modal. |
| **The Gap** | The v2 specs describe what the privacy *policy text* should say about cookies, and mention a footer link for cookie preferences, but never specify the actual consent mechanism implementation. Current codebase has no cookie consent banner — grep for "cookie" across components yields zero consent-related results. |
| **Risk** | High for EU deployment — GDPR + ePrivacy Directive require explicit opt-in consent before setting any non-essential cookies. German TTDSG (Telecommunications-Telemedia Data Protection Act) has been actively enforced since 2021. |
| **Resolution** | Per CRITICAL PRAGMATISM directive: do NOT build a custom consent banner. Specify integration of [CookieConsent by Orest Bida](https://cookieconsent.orestbida.com/) — a zero-cost, GDPR-compliant, lightweight FOSS library. Add a Phase 6 task for this integration. |

---

### Finding N-5: `price_history` FK References `deals(product_id)` — Missing Cascade Handling for Upsert

| Attribute | Value |
|---|---|
| **Severity** | 🟠 **MEDIUM — Data Integrity** |
| **Category** | Spec ↔ Live Codebase |
| **Evidence** | design.md L95: `product_id text NOT NULL REFERENCES public.deals(product_id) ON DELETE CASCADE`. The existing [schema.sql](file:///Users/danielmanzela/DealRadar/supabase/schema.sql) `deals` table uses `product_id text primary key` with provider-prefixed IDs like `kelkoo:12345`. |
| **The Gap** | The v2 spec's `price_history` trigger fires `AFTER INSERT OR UPDATE OF sale_price ON public.deals`. If the refresh job deletes stale deals (the schema.sql L57-58 comments mention a 24h purge cron), `ON DELETE CASCADE` will silently wipe all associated price history. This is correct behavior for truly removed products, but the trigger + FK interaction needs explicit documentation: if a product temporarily disappears from a feed and then reappears, its entire history is lost. |
| **Risk** | Medium — data loss for products that experience temporary feed gaps. Historical 90-day low calculations will be incorrect. |
| **Resolution** | Document explicitly in design.md that the 24h purge cron (currently commented out in schema.sql) must be used with caution. Consider changing `ON DELETE CASCADE` to `ON DELETE SET NULL` for `price_history.product_id` and making it nullable, OR add a `soft_delete` / `is_active` flag to `deals` instead of hard-deleting. This is a design decision for the user. |

---

### Finding N-6: Edge Middleware Geo-Cookie — spec vs. codebase architecture mismatch

| Attribute | Value |
|---|---|
| **Severity** | 🟢 **LOW — Architecture Clarity** |
| **Category** | Spec ↔ Live Codebase |
| **Evidence** | The v2 spec (design.md L55) says: *"[MODIFY] Wrap intlMiddleware to parse geo-headers and set response cookie"*. `FR-GEO-1` specifies using Netlify headers (`x-nf-client-connection-ip`, `X-NF-Country`). However, the actual codebase has a **complete, separate geo-resolution system** in [resolve.ts](file:///Users/danielmanzela/DealRadar/src/lib/geo/resolve.ts) that uses a 3-tier client-side chain: stored cookie → browser Geolocation API → server `/api/geo` fallback. The middleware comment at [middleware.ts L3-4](file:///Users/danielmanzela/DealRadar/src/middleware.ts#L3-L4) explicitly says *"The geo cookie (dr_location) is read by pages directly via cookies(); nothing geo-related is needed here."* |
| **The Gap** | The v2 spec proposes modifying middleware to set geo cookies from edge headers, but the existing architecture intentionally keeps geo-resolution on the client side and reads the result via `cookies()` in server components. These are **two different approaches**: edge-resolved (spec) vs. client-resolved (codebase). The spec needs to explicitly state which approach wins and what happens to the existing `resolve.ts` system. |
| **Resolution** | The spec's edge-middleware approach is architecturally superior for CLS prevention (source PRD Section 4 explicitly says CLS is a problem with client-side location). But the spec should document that `resolve.ts`'s client-side chain becomes a **fallback** for when edge headers are absent (e.g., local dev, non-Netlify hosts). This is not a code change — it's a design clarification. |

---

### Finding N-7: `DealCard.tsx` Modal → SSR Page Transition — No Backwards Compatibility Task

| Attribute | Value |
|---|---|
| **Severity** | 🟢 **LOW — UX Regression Risk** |
| **Category** | Tasks ↔ Live Codebase |
| **Evidence** | Task 6.2 says: *"Modify DealCard.tsx and detail triggers to route to the static path `/[locale]/deal/[slug]` instead of a modal."* The current codebase has both [DealCard.tsx](file:///Users/danielmanzela/DealRadar/src/components/deals/DealCard.tsx) (which opens a modal) and [DealDetailModal.tsx](file:///Users/danielmanzela/DealRadar/src/components/deals/DealDetailModal.tsx) (156+ lines of modal UI). |
| **The Gap** | The task says to modify DealCard but doesn't mention what to do with `DealDetailModal.tsx`. Should it be deleted? Kept as a fallback? The spec doesn't address the transition strategy. |
| **Resolution** | Add a sub-task under 6.2: deprecate/delete `DealDetailModal.tsx` after the SSR page is live. Or keep it as a mobile quickview fallback — this is a UX design decision for the user. |

---

## Section 3: Internal Consistency Verification

Cross-referencing all requirement IDs across prd.md ↔ requirements.md ↔ design.md ↔ tasks.md:

| Requirement ID | prd.md | requirements.md | design.md | tasks.md | Status |
|---|---|---|---|---|---|
| FR-ING-1 (Refresh trigger) | FR-ING-1 ✅ | FR-ING-1 ✅ | Section 3 ✅ | Task 4.1 ✅ | **Consistent** |
| FR-ING-2 (Normalization) | FR-ING-2 ✅ | FR-ING-2 ✅ | Section 2 ✅ | Task 2.4 ✅ | **Consistent** |
| FR-ING-3 (Deduplication) | FR-ING-3 ✅ | FR-ING-4 ✅ | Section 4 ✅ | Task 3.4 ✅ | **Consistent** |
| FR-ING-4 (Price trigger) | FR-ING-4 ✅ | FR-ING-6 ✅ | Section 2 ✅ | Task 1.1 ✅ | **Consistent** |
| FR-ING-5 (90-day low) | FR-ING-5 ✅ | FR-ING-7 ✅ | Section 2 ✅ | Task 3.3 ✅ | **Consistent** |
| FR-ING-6 (Alert dispatch) | FR-ING-6 ✅ | FR-ING-8 ✅ | Design implicit | Task implicit | **Consistent** |
| FR-RTE-1 (SSR page) | FR-RTE-1 ✅ | — | Section 1 ✅ | Task 6.1 ✅ | **Consistent** |
| FR-RTE-2 (Metadata) | FR-RTE-2 ✅ | FR-GEO-1 ✅ | Section 1 ✅ | Task 6.1 ✅ | **Consistent** |
| FR-RTE-3 (Sitemap) | FR-RTE-3 ✅ | FR-GEO-4 ✅ | Section 4 ✅ | Task 6.3 ✅ | **Consistent** |
| FR-RTE-4 (robots.txt) | FR-RTE-4 ✅ | FR-GEO-3 ✅ | Section 1 ✅ | Task 6.3 ✅ | **Consistent** |
| FR-GEO-1 (Edge geo) | FR-GEO-1 ✅ | FR-LOC-1 ✅ | Section 1 ✅ | Task 5.1 ✅ | **Consistent** |
| FR-GEO-2 (Fallback) | FR-GEO-2 ✅ | FR-LOC-2 ✅ | implicit ✅ | Task 5.1 ✅ | **Consistent** |
| FR-TRK-1 (SubID) | FR-TRK-1 ✅ | FR-TRK-1 ✅ | Section 3 ✅ | Task 2.3 ✅ | **Consistent** |
| FR-TRK-2 (Postbacks) | FR-TRK-2 ✅ | FR-TRK-2 ✅ | Section 3 ✅ | Task 5.2 ✅ | **Consistent** |
| FR-PRIV-1 (Footer links) | FR-PRIV-1 ✅ | FR-COMP-1 ✅ | Section 4 ✅ | Task 6.6 ✅ | **Consistent** |
| FR-PRIV-2 (Unsubscribe) | FR-PRIV-2 ✅ | FR-COMP-2 ✅ | Section 3 ✅ | Task 6.5 ✅ | ⚠️ **N-1: Missing email template update task** |
| FR-PRIV-3 (Erasure) | FR-PRIV-3 ✅ | FR-COMP-3 ✅ | Section 3 ✅ | Task 6.5 ✅ | **Consistent** |
| FR-PRIV-4 (Rate-limit) | FR-PRIV-4 ✅ | FR-COMP-4 ✅ | Section 1 ✅ | Task 5.3 ✅ | **Consistent** |

> [!NOTE]
> Requirement ID numbering differs slightly between prd.md and requirements.md (e.g., FR-ING-3 in PRD maps to FR-ING-4 in requirements). This is cosmetic — the semantic content is identical. Consider aligning numbering in the next revision for traceability.

---

## Section 4: Schema.org JSON-LD Audit

The v2 spec's JSON-LD example in prd.md (L137-163) was compared against 2025/2026 best practices:

| Property | Spec Status | Industry Best Practice | Action Needed? |
|---|---|---|---|
| `@type: Product` | ✅ Present | Required | No |
| `@type: AggregateOffer` | ✅ Present | Required for multi-merchant | No |
| `priceCurrency` | ✅ Present | Required | No |
| `lowPrice` / `highPrice` | ✅ Present | Required for AggregateOffer | No |
| `availability` | ❌ **Missing** | **Required** — must be full URL like `https://schema.org/InStock` | **Yes — add to spec** |
| `priceValidUntil` | ❌ Missing | Optional — only if deal has known expiry | No (correct to omit) |
| `url` (offer-level) | ✅ Present in design.md L420 | Required for click-through | No |
| `seller.@type: Organization` | ✅ Present | Recommended | No |
| `itemCondition` | ❌ Missing from prd.md example | Recommended: `https://schema.org/NewCondition` | **Yes — add to spec** |
| `BreadcrumbList` | ❌ Not specified | Recommended for rich results | **Yes — add to spec** |
| `@graph` container | ❌ Not specified | 2025 best practice: single `@graph` block | **Yes — recommended** |

> [!IMPORTANT]
> The `availability` field is **required by Google for rich results eligibility**. Its absence means deal pages will likely not generate Product rich results in Google Search. This should be set to `https://schema.org/InStock` for active deals.

---

## Section 5: Findings Summary & Priority Matrix

| ID | Severity | Category | Summary | Spec File(s) to Update |
|---|---|---|---|---|
| **N-1** | 🔴 CRITICAL | GDPR Compliance | Email template missing unsubscribe link + `List-Unsubscribe` header | tasks.md, design.md |
| **N-2** | 🟡 WARNING | Security/SEO | `robots.txt` spec references non-existent `/api/click`, missing `/api/postbacks` | requirements.md, design.md |
| **N-3** | 🟡 WARNING | Regulatory | Affiliate disclosure only in footer, not adjacent to links | tasks.md |
| **N-4** | 🟡 WARNING | GDPR Compliance | No cookie consent banner specification | tasks.md, design.md |
| **N-5** | 🟠 MEDIUM | Data Integrity | `price_history` CASCADE delete risks data loss on feed gaps | design.md |
| **N-6** | 🟢 LOW | Architecture | Edge geo vs. client geo approach not explicitly reconciled | design.md |
| **N-7** | 🟢 LOW | UX | `DealDetailModal.tsx` fate not specified | tasks.md |
| **S-1** | 🟡 WARNING | Schema.org | Missing `availability` and `itemCondition` in JSON-LD | prd.md, design.md |
| **S-2** | 🟢 LOW | Schema.org | Consider `@graph` container and `BreadcrumbList` | design.md |

---

## Section 6: Recommended Spec Amendments

### Amendment A: Add Email Template Update Task (fixes N-1)

Add to `tasks.md` under Phase 6:

```markdown
- [ ] **Task 6.5b: Update email template with unsubscribe link and List-Unsubscribe header**
  - *Action:* Modify `priceDropEmail()` in `src/lib/db/alerts.repo.ts` to:
    1. Generate HMAC token: `createHmac('sha256', CRON_SECRET).update(`${email}:${productId}`).digest('hex')`
    2. Append visible unsubscribe link to email HTML footer
    3. Update `sendEmail()` in `src/lib/email/send.ts` to include `List-Unsubscribe` and `List-Unsubscribe-Post` headers (RFC 8058)
  - *Verification:* Trigger a test price alert email and verify both the visible link and the email headers.
```

### Amendment B: Fix robots.txt Specification (fixes N-2)

Update `FR-GEO-3` in requirements.md and design.md:

```diff
-Disallow: /api/click
-Disallow: /api/refresh
+Disallow: /api/
```

This blanket rule is simpler and covers `/api/refresh`, `/api/postbacks`, `/api/alerts`, `/api/geo`, etc.

### Amendment C: Add Affiliate Badge Task (fixes N-3)

Add sub-task under Task 6.2:

```markdown
  - Add a visible "Affiliate-Link" / "Werbung" badge or tooltip adjacent to
    the outbound CTA button on DealCard and the SSR deal detail page.
```

### Amendment D: Add Cookie Consent Integration Task (fixes N-4)

Add to `tasks.md` as a new Phase 6 task:

```markdown
- [ ] **Task 6.7: Integrate FOSS cookie consent banner**
  - *Action:* Install `vanilla-cookieconsent` (by Orest Bida) and configure
    it in the root layout with categories: Essential (always on), Analytics
    (opt-in). Add "Cookie Settings" link to Footer alongside legal pages.
  - *Verification:* Load the site in an incognito browser and verify the
    banner appears, blocks non-essential cookies until consent, and persists
    the preference.
```

### Amendment E: Document Price History Cascade Risk (fixes N-5)

Add to design.md Section 2 after the migration DDL:

```markdown
> ⚠️ **Design Note:** The `ON DELETE CASCADE` on `price_history.product_id`
> means that if a deal is hard-deleted (e.g., by the optional 24h stale
> purge cron), all associated price history is permanently lost. For MVP,
> this is acceptable. For production, consider either: (a) a soft-delete
> `is_active boolean` flag on `deals`, or (b) changing the FK to
> `ON DELETE SET NULL` with a nullable `product_id`.
```

### Amendment F: Add Schema.org `availability` (fixes S-1)

Update the JSON-LD examples in both prd.md and design.md to include:

```json
"availability": "https://schema.org/InStock",
"itemCondition": "https://schema.org/NewCondition"
```

---

## Section 7: What is NOT Missing (False Negative Check)

To ensure no false negatives, I verified the following areas are **correctly covered** by the v2 specs:

| Area | Verified In | Status |
|---|---|---|
| RLS on all tables | design.md L112-114 | ✅ |
| Service-role key isolation | requirements.md NFR-SEC-2 | ✅ |
| `WEBHOOK_SECRET` authentication | design.md L222, tasks.md 7.1 | ✅ |
| `rel="nofollow sponsored"` on links | Live codebase DealCard.tsx L91 | ✅ |
| Data minimization (no PII in transactions) | requirements.md NFR-PRIV-1 | ✅ |
| Mock fallback when API keys absent | Existing provider pattern in codebase | ✅ |
| `next-intl` localization integration | routing.ts, middleware.ts | ✅ |
| Upstash Redis graceful degradation | redis.ts L15 (no-op on missing env) | ✅ |
| XSS protection in email templates | alerts.repo.ts L97-100 (escapeHtml) | ✅ |
| maxDuration on serverless routes | refresh/route.ts L19 | ✅ |
| Correct index strategy for hot paths | schema.sql L27-40 | ✅ |
| Input validation on alerts API | alerts/route.ts L22-33 | ✅ |
| Image CDN patterns for existing providers | next.config.mjs L9-14 | ✅ |

---

## Conclusion

The v2 specification suite is **architecturally sound and internally consistent**. The 12 original audit findings remain correctly resolved. This deep audit identified **7 new findings** (1 critical, 3 warnings, 1 medium, 2 low) and **2 Schema.org improvements**. The critical finding (N-1: missing unsubscribe link in email) is a straightforward implementation gap, not an architectural flaw.

> [!CAUTION]
> **N-1 (email unsubscribe link) must be resolved before any production deployment** — it is the single remaining GDPR compliance gap in the specification.

All recommended amendments are additive and do not require architectural changes to the v2 design. They can be incorporated as additional sub-tasks without disrupting the existing phase structure.
