# Product Requirements Document (PRD) - Version 2
## Project: DealRadar Headless Affiliate Aggregator & Generative Engine Optimization (GEO)

* **Status:** Draft / Pending Review
* **Target Release:** Q3 2026
* **Owner:** Principal Architect & PM Team
* **Last Updated:** 2026-06-23

---

## 1. Executive Summary & Vision

### Vision Statement
DealRadar is the premier European geo-located shopping companion, connecting consumers with verified, localized price reductions. By transforming our platform from a visual, client-only catalog to an automated, headless affiliate aggregator and AI-crawlable semantic database, DealRadar aims to capture both traditional web users and the emerging market of **autonomous AI consumers** (e.g., SearchGPT, Gemini, Perplexity).

### Core Goals
1. **Automate Monetization:** Transition from static, mock, or hard-coded lists to a programmatic data feed that dedupes deals and dynamically structures tracking links to monetize every click.
2. **Generative Engine Optimization (GEO):** Structure our page output so that AI bots crawl, verify, and cite DealRadar as their primary authority when users search for European deals.
3. **True Local Scoping:** Maintain instant, cookie-driven server-side rendering (SSR) of localized content based on edge IP detection.
4. **Regulatory and Legal Compliance:** Satisfy EU regulations (GDPR, German/Austrian Impressum requirements, and affiliate disclosures) programmatically and with zero friction.

---

## 2. Problem Statement & Opportunities

### Current Pain Points
* **Mock Baseline:** The current codebase depends on mock data structures in development and falls back to a limited number of hardcoded feeds. It lacks automated monetization links.
* **Lack of Shareable Pages:** Individual deals open inside dynamic React modals rather than dedicated static pages. This makes it impossible for search engines (traditional or LLM-based) to index specific deal items or link to them directly.
* **Weak Attribution & Schema Gap:** Outward links are not programmatically tracked. There is no serverless postback capability to attribute sales commissions back to specific product tiles, and no table schemas exist to track history or transactions.
* **Cold Starts on Location:** Location detection runs on client-side JS fallbacks, causing visual layout shifts (CLS) on initial load and rendering generic content to automated indexers.

### The Opportunity
By exposing structured Schema.org markup alongside automated database calculations (historic lows, price comparisons), DealRadar can become a primary data source for AI search crawlers. AI agents reward highly formatted data that provides "proof" of assertions with canonical footnotes.

---

## 3. Product Scope & Core Pillars

The project is structured around 5 key technical pillars, integrated with compliance controls:

```mermaid
graph TD
    A[DealRadar Core Platform] --> B[1. Headless Ingestion]
    A --> C[2. Database Persistence]
    A --> D[3. GEO Schema & Routing]
    A --> E[4. Edge Location Scoping]
    A --> F[5. Webhook Postbacks]
    A --> G[6. Legal & GDPR Compliance]
    
    B --> B1[Strackr unified API]
    C --> C1[deals, price_history, transactions tables]
    D --> D1[/[locale]/deal/[slug] page & JSON-LD]
    E --> E1[Netlify/Vercel Edge headers & middleware cookie]
    F --> F1[api/postbacks commission attribution]
    G --> G1[Imprint, Privacy, Terms, HMAC Unsubscribe, Rate-Limit]
```

---

## 4. User & Crawler Personas

### Persona A: The Deal Seeker (End User)
* **Goal:** Wants to find the lowest price for a specific product in their country/city.
* **Need:** Accurate prices, real discount percentages, historical context, and direct merchant links.

### Persona B: The Generative Search Agent (AI Bot)
* **Goal:** Crawls the web looking for authoritative answers to queries like *"Where can I buy the Samsung S24 Ultra cheapest in Germany right now?"*
* **Need:** Dynamic JSON-LD markup, historical price verification, clean canonical links, and high sitemap visibility.

### Persona C: The Developer/PM (Operations)
* **Goal:** Needs to run and test the codebase locally without active API keys or database connections.
* **Need:** Seamless mock-mode fallback when credentials are not configured in `.env`.

---

## 5. Functional Requirements (EARS Notation)

### Ingestion & Deduplication
* **FR-ING-1:** **When** the Scheduled Refresher triggers a POST request to `/api/refresh`, the system **shall** fetch the latest regional deals from the unified Strackr API.
* **FR-ING-2:** **While** processing raw deals from the API, the system **shall** calculate a dynamic discount percentage (`discount_percentage`) based on `original_price` and `sale_price`.
* **FR-ING-3:** **If** duplicate product offers (same EAN barcode or matching name + merchant) are detected from different networks, **then** the system **shall** apply a **Hybrid Deduplication Strategy**:
  1. Prefer the deal with the **lower sale price** (deepest discount percentage).
  2. If the sale prices are **equal**, prefer the deal from the network with the **highest priority** in the registry's priority order (Kelkoo > Tradedoubler > Awin).
* **FR-ING-4:** **When** a deal's price is updated, the system **shall** trigger an automatic database function that inserts a price history snapshot into `price_history` if the price changed or if no snapshot exists for the current day.
* **FR-ING-5:** **When** the refresh api executes daily, the system **shall** calculate and cache the 90-day lowest price in the `historical_low_price` column of the `deals` table.
* **FR-ING-6:** **When** a deal's price drops below the user's subscribed alert price during ingestion, the system **shall** dispatch a price-drop email alert to the subscriber and mark the alert as notified.

### Routing, UX & SEO
* **FR-RTE-1:** **When** a user clicks a deal tile on the home grid, the system **shall** route the browser to the dedicated SSR deal page `/[locale]/deal/[slug]` instead of launching a client-side modal.
* **FR-RTE-2:** **When** a request hits `/[locale]/deal/[slug]`, the page **shall** dynamically render:
  * Title structured as: `[deal.productName] - Best Deal in [Country] | DealRadar`
  * Canonical alternate links mapped to the current locale path.
  * Contextual proof text (e.g. *"This product has reached its lowest price in 90 days"*).
* **FR-RTE-3:** **When** a client requests a sitemap, the system **shall** dynamically generate `/sitemap.xml` using the Next.js `sitemap.ts` file, yielding localized routes for all static pages, active categories, and active deals with `hreflang` alternates.
* **FR-RTE-4:** **When** an AI crawler requests `/robots.txt`, the server **shall** output rules prioritizing search bots (`OAI-SearchBot`, `PerplexityBot`, `Google-Extended`) and disallowing programmatic endpoints (`/api/click`, `/api/refresh`), pointing to the root sitemap `/sitemap.xml`.

### Geolocation
* **FR-GEO-1:** **When** a request lacks the `dr_location` cookie, the edge middleware **shall** resolve the visitor's country code using Netlify/Vercel geolocation IP headers.
* **FR-GEO-2:** **If** the edge-resolved country is not supported by DealRadar, **then** the system **shall** write a default country code (`DE`) to the `dr_location` cookie.

### Transaction Attributes & Postbacks
* **FR-TRK-1:** **When** outgoing affiliate links are rendered, the system **shall** append a single unified tracking parameter structured as `dealradar_${country}_${category}_${productId}` (e.g., `dealradar_DE_electronics_kelkoo:12345`) to the network's custom field (e.g. `clickref` or `epi`).
* **FR-TRK-2:** **When** the `/api/postbacks` webhook receives a transaction payout event from Strackr, the system **shall** validate the request via `secret` query parameter signature, split the subID, query the database for the matching `product_id`, and record the transaction in the `transactions` table.

### Legal Compliance & Privacy
* **FR-PRIV-1:** **When** rendering the footer, the system **shall** display links to the mandatory **Imprint**, **Privacy Policy**, and **Terms of Service** pages, as well as an option to adjust cookie preferences.
* **FR-PRIV-2:** **When** an email price alert is dispatched, the system **shall** append an automated secure unsubscribe link containing a token generated via SHA-256 HMAC signature of `email + productId` signed with `CRON_SECRET`.
* **FR-PRIV-3:** **When** a user clicks the unsubscribe link, the system **shall** securely verify the signature and delete the corresponding record from `price_alerts`, programmatically satisfying GDPR Article 17 (Right to Erasure).
* **FR-PRIV-4:** **When** a user submits an alert signup request, the system **shall** enforce rate-limiting of 5 requests/hour per IP using Upstash Redis to prevent abuse.

---

## 6. Non-Functional Requirements (NFRs)

### Performance & Scaling
* **NFR-PERF-1:** Main page routing and list queries must maintain sub-100ms response times by caching outputs on Upstash Redis with a maximum TTL of 30 minutes.
* **NFR-PERF-2:** Database queries on product name, brand, and slugs must utilize Postgres GIN/B-tree indices to prevent full-table scans.

### Security & Privacy
* **NFR-SEC-1:** Serverless API endpoints managing inventory updates (`/api/refresh`) and webhook payouts (`/api/postbacks`) must reject requests lacking correct authentication credentials (`CRON_SECRET` and `WEBHOOK_SECRET` respectively).
* **NFR-SEC-2:** Database security policies (RLS) must restrict direct anon queries, forcing database interactions to run server-side using the Supabase Service Role configuration.
* **NFR-PRIV-1 (Data Minimization):** The `transactions` table shall store only anonymous conversion records linked to products. It must not store any personally identifiable information (PII).

---

## 7. Key Architecture & Data Models

### Database Schema Updates
We will run migrations on the Supabase PostgreSQL database to create two new tables (`price_history`, `transactions`) and update the `deals` table:

1. `deals` table: Add `affiliate_network`, `native_product_id`, `merchant_name`, `ean_code`, `tracking_url`, `description`, `historical_low_price`, and `slug`.
2. `price_history` table: Records historical pricing snapshots for products.
3. `transactions` table: Records transaction commissions received via postback webhooks.

### Schema.org Integration (Product & AggregateOffer)
The page markup on `/deal/[slug]` will inject a structured JSON-LD block:
```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Samsung Galaxy S24 Ultra",
  "image": "https://images.affiliatecdn.com/samsung-s24.jpg",
  "description": "Save 27% on Samsung Galaxy S24 Ultra...",
  "offers": {
    "@type": "AggregateOffer",
    "priceCurrency": "EUR",
    "lowPrice": "1049.00",
    "highPrice": "1449.00",
    "offerCount": "1",
    "offers": [
      {
        "@type": "Offer",
        "price": "1049.00",
        "priceCurrency": "EUR",
        "seller": {
          "@type": "Organization",
          "name": "Samsung DE"
        }
      }
    ]
  }
}
```

---

## 8. Risks, Assumptions, & Mitigations

| Risk | Impact | Mitigation Strategy |
|---|---|---|
| **Strackr API Rate Limits / Failure** | High | If Strackr fails, the pipeline logs a `ProviderError` and aborts ingestion, leaving existing DB rows intact. Old deals purge on a rolling 24-hour cycle. |
| **Missing Barcodes (EANs)** | Medium | When EAN is null, the deduplication engine falls back to a composite key of slugified name and merchant name. |
| **Alert/Email Spamming** | Medium | Secure rate-limiting in Next.js via Upstash Redis client and cryptographic signature checks on all unsubscribe requests. |

---

## 9. Success Metrics & Key Performance Indicators (KPIs)

1. **AI Indexation and Citations:** Growth in referrals and citation footnotes from Perplexity/SearchGPT.
2. **Core Web Vitals:** Maintain an LCP of < 2.5s and CLS of 0.0 by using edge-resolved country cookies instead of client-side location lookups.
3. **Monetization Yield:** Conversion rate tracking of mapped payouts via postbacks.
4. **Compliance Status:** Pass manual audit checks for GDPR right-to-erasure and German/Austrian *Impressum* guidelines.
