# Spec Compilation Audit Report (Version 2 - Resolved)
## Cross-Reference: Source PRD × Compiled Specs × Live Codebase

**Auditor:** Principal Architect  
**Date:** 2026-06-23  
**Status:** ALL FINDINGS RESOLVED IN V2  
**Scope:** All updated specs in `docs/ground_source_of_truth/2026-06-23_v2/`  

---

## Resolved Audit Findings Checklist

| Item | Severity | Finding Title | Resolution in V2 Specifications |
|---|---|---|---|
| **D-1** | 🔴 CRITICAL | Deduplication Contradiction | Resolved via **Hybrid Deduplication Strategy**: Programmatic deduplication primarily compares EAN code (or normalized name + merchant). If prices differ, keep the lowest sale price (deepest discount) to maximize user trust. If sale prices are equal, fall back to the registry's priority order (Kelkoo > Tradedoubler > Awin). |
| **M-1** | 🔴 CRITICAL | Missing `price_history` Table | Resolved. Added `price_history` table and a Postgres database trigger `trigger_record_price_history` to log price changes or daily snapshots without Next.js overhead. In addition, `historical_low_price` on `deals` is cached and updated daily via a 90-day window query. |
| **M-2** | 🔴 CRITICAL | Missing `transactions` Table | Resolved. Added `transactions` table to the database migration schema, complete with foreign keys, uniqueness constraints, and Row Level Security (RLS) configurations. |
| **H-1** | 🟡 WARNING | Strackr Endpoint URL | Resolved. Endpoint marked as provisional/TBD in `design.md` pending Phase 0 research task to verify against official Strackr publisher developer documentation. |
| **H-2** | 🟡 WARNING | Strackr Response Payload | Resolved. Payload schema marked as provisional in `design.md`. Phase 0 research task added to verify exact JSON shape before implementation. |
| **D-2** | 🟡 WARNING | Cron Schedule Mismatch | Resolved. Formally documented that the cron job schedule is kept as daily (`0 4 * * *` at 04:00 UTC) for performance, data minimization, and cost control, while providing customization instructions for a 4-hour schedule. |
| **D-3** | 🟡 WARNING | `updated_at` Column Mismatch | Resolved. Formally documented in `design.md` that the PRD's requested `updated_at` maps to the existing `last_updated` column in the database schema. |
| **D-4** | 🟡 WARNING | Strackr Service Path | Resolved. Confirmed that placing the Strackr provider at `src/lib/providers/strackr.ts` (instead of `src/lib/affiliate/strackr.ts`) is the correct architectural decision to align with existing providers. |
| **M-3** | 🟡 WARNING | Missing `STRACKR_API_KEY` | Resolved. Added `STRACKR_API_KEY` to the environment variables section in requirements and the `.env.example` update task in `tasks.md`. |
| **M-4** | 🟡 WARNING | Strackr CDN remotePatterns | Resolved. Added a task to update `next.config.mjs` to whitelist `**.strackr.com` and related affiliate image domains. |
| **M-5** | 🟡 WARNING | subID Parameter Structure | Resolved. Formally defined a SOTA, unified subID parameter `dealradar_${country}_${category}_${productId}` mapped to the network's custom field (e.g. `clickref`/`epi`), preventing failure on networks that only support a single tracking parameter. |
| **M-6** | 🟡 WARNING | Sitemap Path Architecture | Resolved. Replaced localized routes with Next.js standard `app/sitemap.ts` generator at the root, which queries Supabase and generates a unified, multi-lingual `sitemap.xml` with alternates. Fixed `robots.txt` Sitemap URL. |
| **M-7** | 🟡 WARNING | GDPR/Privacy Assessment | Resolved. Documented Privacy-by-Design details: transaction postbacks are anonymous and contain no PII; price alerts collect email PII but implement an automated secure unsubscribe link `/api/alerts/unsubscribe` verified via HMAC SHA-256 signatures. |
| **M-8** | 🟡 WARNING | Deal Detail notFound | Resolved. Updated spec for `/[locale]/deal/[slug]/page.tsx` to call Next.js `notFound()` if a deal is absent, triggering the standard application error UI. |

---

## Regulatory & Legal Compliance Audit (SOTA Essentials)

To ensure the DealRadar platform complies with European regulations (specifically German/Austrian *Impressumspflicht*, GDPR, and affiliate disclosure guidelines), the following elements have been added as core specifications for the v2 implementation:

1. **Affiliate Disclosure Statement:** Already rendered in the footer. To comply with German UWG (unfair competition) and EU directives, we ensure it explicitly alerts the consumer of commercial links.
2. **Mandatory Imprint (Impressum):** Added `src/app/[locale]/imprint/page.tsx` displaying the legally required corporate notice (company name, address, email, phone, representation, VAT, registry details).
3. **Mandatory Privacy Policy (Datenschutzerklärung):** Added `src/app/[locale]/privacy/page.tsx` detailing data controller details, rights of data subjects, cookie classifications (essential vs. analytics), and processing disclosures for third parties (Supabase, Resend, Strackr, Awin, Tradedoubler).
4. **Mandatory Terms and Conditions (Allgemeine Geschäftsbedingungen):** Added `src/app/[locale]/terms/page.tsx` to limit DealRadar's liability regarding pricing discrepancies, stock levels, and transaction contracts (contracts are solely between the user and the retail merchant).
5. **GDPR Data Subject Deletion (Automated Unsubscribe):** Automated unsubscribe route `/api/alerts/unsubscribe` that verifies subscription tokens using HMAC SHA-256. Upon access, the specific alert is deleted from the `price_alerts` table, satisfying the "right to erasure" (Article 17 GDPR) programmatically.
6. **API Security & Rate-Limiting:** To prevent DDoS and email spamming via `/api/alerts` subscription route, we enforce rate-limiting of 5 subscriptions/hour per IP using the existing Upstash Redis client.
