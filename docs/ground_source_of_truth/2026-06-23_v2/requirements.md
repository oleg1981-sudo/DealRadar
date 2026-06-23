# Requirements Document: DealRadar Headless Affiliate Aggregator & GEO - Version 2

This document compiles the functional and non-functional requirements for transitioning DealRadar from mock data to real-time programmatic affiliate feeds, implementing a Generative Engine Optimization (GEO) strategy, and adding regulatory compliance controls.

---

## 1. Functional Requirements (EARS Notation)

### Ingestion & Data Pipeline
* **FR-ING-1 (Event-driven):** When the `/api/refresh` endpoint receives a valid POST request, the system shall fetch live deals from the Strackr API.
* **FR-ING-2 (State-driven):** While importing deals from the API, the system shall normalize product details (name, prices, image URL, affiliate tracking link, network name, and merchant name) to fit the internal schema.
* **FR-ING-3 (Ubiquitous):** The system shall compute a dynamic discount percentage (`discount_percentage`) for each ingested deal based on `original_price` and `sale_price`.
* **FR-ING-4 (Unwanted Behavior):** If the system identifies a duplicate product (sharing the same EAN barcode or matching cleaned name and merchant keys) across multiple networks, then the system shall apply the **Hybrid Deduplication Strategy**:
  1. Prefer the deal that offers the **lower sale price** (deepest discount percentage).
  2. If the sale prices are **equal**, prefer the network with the **highest priority** in the registry's priority order (Kelkoo > Tradedoubler > Awin).
* **FR-ING-5 (Event-driven):** When saving deals to the database, the system shall run a bulk upsert that inserts new deals and updates existing records by matching on the primary key `product_id`.
* **FR-ING-6 (Event-driven):** When a deal's price drops, the database trigger `trigger_record_price_history` shall automatically log a snapshot of the price change in the `price_history` table if the price changed or if no snapshot exists for that product on the current calendar day.
* **FR-ING-7 (State-driven):** While executing the daily refresh, the system shall calculate and update the cached `historical_low_price` on the `deals` table for all deals based on a 90-day window query of the `price_history` table.
* **FR-ING-8 (Event-driven):** When a deal's price drops below the user's subscribed alert price during ingestion, the system shall dispatch a price-drop email alert to the subscriber and mark the alert as notified.

### Tracking & Monetization
* **FR-TRK-1 (Ubiquitous):** The system shall construct affiliate links with a programmatically appended single subID structured as `dealradar_${country}_${category}_${productId}` (e.g. `dealradar_DE_electronics_kelkoo:12345`) mapped to the network's custom tracking parameter (e.g. `clickref` or `epi`) when rendering outward links.
* **FR-TRK-2 (Event-driven):** When the serverless postback listener (`/api/postbacks`) receives a transaction ping, the system shall validate the request query parameter signature (`secret`), parse the subID, query the database, and record the commission event in the `transactions` table.

### Generative Engine Optimization (GEO) & SEO
* **FR-GEO-1 (Ubiquitous):** The system shall output semantic `Product` and `AggregateOffer` schema markups (JSON-LD) on every deal page.
* **FR-GEO-2 (Ubiquitous):** The system shall inject "AI-Scrapable Proof Fields" (including 90-day historic low price status, relative local price comparison, and verification timestamp) on every deal page.
* **FR-GEO-3 (Ubiquitous):** The system shall expose a `robots.txt` configuration that allows access to all AI search agents (e.g. `OAI-SearchBot`, `PerplexityBot`, `Google-Extended`) while disallowing execution routes (`/api/click`, `/api/refresh`), pointing directly to `/sitemap.xml`.
* **FR-GEO-4 (Event-driven):** When a search client requests a sitemap, the system shall serve `/sitemap.xml` dynamically generated using Next.js `sitemap.ts` mapping all static paths, categories, and active deals with localized `hreflang` alternates.

### Geolocation & Middleware Scoping
* **FR-LOC-1 (Event-driven):** When a request is received, the middleware shall inspect Netlify geo-forwarding headers (`x-nf-client-connection-ip`, `X-NF-Country`) and forward the country code to the i18n/localization layer.
* **FR-LOC-2 (Unwanted Behavior):** If the resolved country is not supported, then the system shall fall back to the default country code (`DE`).

### Legal & GDPR Compliance
* **FR-COMP-1 (Ubiquitous):** The system shall provide localized footer links to mandatory legal pages: **Imprint (Impressum)**, **Privacy Policy**, and **Terms of Service**.
* **FR-COMP-2 (Event-driven):** When a user receives a price alert email, the system shall provide a secure, automated unsubscribe link `/api/alerts/unsubscribe` featuring an HMAC SHA-256 token signed with `CRON_SECRET`.
* **FR-COMP-3 (Event-driven):** When the unsubscribe route receives a validated token request, the system shall delete the matching user subscription from the `price_alerts` table.
* **FR-COMP-4 (Event-driven):** When the user registers for a price alert, the system shall rate-limit submissions to a maximum of 5 requests/hour per IP address using Upstash Redis.

---

## 2. Non-Functional Requirements

### Performance & Caching
* **NFR-PERF-1:** Page loads for top deals lists must leverage the existing Upstash Redis caching layer, maintaining a maximum response cached TTL of 30 minutes.
* **NFR-PERF-2:** Serverless ingestion routes (`/api/refresh`) must complete execution within serverless execution limits (e.g. Vercel's configured `maxDuration = 300` limit).

### Security & Privacy
* **NFR-SEC-1:** Access to critical administration paths and endpoints (`/api/refresh`, `/api/postbacks`) must be restricted using Bearer authorization validated against `CRON_SECRET` and signature checks against `WEBHOOK_SECRET`.
* **NFR-SEC-2:** Database Row-Level Security (RLS) must remain enabled on all tables, and the application must connect server-side only using the service-role key to prevent public data exposure.
* **NFR-SEC-3:** Geographic coordinates used for geolocation reverse-lookup must be handled transiently on the server and must never be persisted.
* **NFR-PRIV-1 (Data Minimization):** The `transactions` table must not store any personally identifiable information (PII) such as IP addresses or user account details.

### Tech Stack Constraints
* **NFR-TECH-1:** The backend codebase must run on Node.js 20 with TypeScript.
* **NFR-TECH-2:** The persistence layer must be Supabase PostgreSQL.
* **NFR-TECH-3:** Frontend routing must be compatible with Next.js 14 App Router and next-intl for localization.

---

## 3. Edge Cases & Assumptions

### Edge Cases
* **Strackr API Failures/Rate Limits:** If the Strackr API is unreachable or rate-limited, the ingestion pipeline must throw a `ProviderError`, write a log entry, and safely abort without corrupting existing database states.
* **No Price Change during Upsert:** If an ingested deal already exists and the sale price has not changed, the database trigger must update `last_updated` without writing duplicate rows to the price history table.
* **Missing EAN and Duplicate Names:** If EAN code is null for duplicate deals, the system must fall back to matching by a composite key of slugified name and merchant name.
* **Unsupported Country Codes:** If a user connects from outside the supported list, the system must serve default (`DE`) data.

### Assumptions
* The Strackr API key (`STRACKR_API_KEY`) is active and has permissions to pull product data feeds for the DACH and wider European regions.
* The outgoing email sender (e.g. Resend, Nodemailer) is configured and capable of successfully dispatching price drop alerts.
* The frontend deployment is hosted on a platform (such as Netlify or Vercel) that supports geo-headers (`x-nf-country`, `x-vercel-ip-country`).

---

## 4. Success Metrics

1. **Successful Compilation:** The TypeScript build command runs without compilation errors.
2. **Deduplicated Ingestion:** Running `/api/refresh` processes raw products, removes duplicates (keeping the best discount), and inserts/updates records successfully.
3. **Structured Metadata Coverage:** Every deal page (`/deal/[slug]`) renders valid Schema.org JSON-LD validator output containing `Product` and `AggregateOffer` elements.
4. **Compliance Status:** Mandatory legal pages (/imprint, /privacy, /terms) are accessible and footer links are active.
5. **No Vibe-Coding:** Every code change conforms to the final approved `design.md` specifications.
