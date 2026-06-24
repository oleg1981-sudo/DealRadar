# Design Blueprint — Version 3 (Canonical)
## DealRadar: Live Integration, GEO, Compliance & EU Legal

**Traceability:** This document is the technical design specification implementing the canonical [prd.md](file:///Users/danielmanzela/DealRadar/docs/ground_source_of_truth/2026-06-23_v2/prd.md). All file paths, interfaces, and SQL are verified against the live codebase as of 2026-06-23.

---

## 1. Architecture & File Organization

### Directory Layout (Changes Only)

```
DealRadar/
├── supabase/
│   └── schema.sql                  ← [MODIFY] Append new tables, triggers, indices
├── src/
│   ├── app/
│   │   ├── sitemap.ts              ← [NEW] Root dynamic multilingual sitemap (Next.js native)
│   │   ├── [locale]/
│   │   │   ├── deal/
│   │   │   │   └── [slug]/
│   │   │   │       └── page.tsx    ← [NEW] SSR deal page with JSON-LD, alternates, notFound()
│   │   │   ├── imprint/
│   │   │   │   └── page.tsx        ← [NEW] Localized Impressum page
│   │   │   ├── privacy/
│   │   │   │   └── page.tsx        ← [NEW] Localized GDPR Privacy Policy page
│   │   │   └── terms/
│   │   │       └── page.tsx        ← [NEW] Localized Terms of Service page
│   │   └── api/
│   │       ├── postbacks/
│   │       │   └── route.ts        ← [NEW] Secure transaction postback handler
│   │       ├── alerts/
│   │       │   ├── route.ts        ← [MODIFY] Add IP-based rate limiting via Upstash Redis
│   │       │   └── unsubscribe/
│   │       │       └── route.ts    ← [NEW] HMAC-verified data deletion endpoint
│   │       └── refresh/
│   │           └── route.ts        ← [MODIFY] Wire daily 90-day lowest price recalculation
│   ├── components/
│   │   ├── deals/
│   │   │   ├── DealCard.tsx        ← [MODIFY] Route to SSR page; add affiliate badge
│   │   │   └── DealDetailModal.tsx ← [DELETE] Deprecated after SSR page confirmed working
│   │   ├── layout/
│   │   │   └── Footer.tsx          ← [MODIFY] Add legal page links + "Cookie Settings" link
│   │   └── consent/
│   │       └── CookieConsent.tsx   ← [NEW] Wrapper for vanilla-cookieconsent FOSS library
│   ├── lib/
│   │   ├── db/
│   │   │   ├── deals.repo.ts      ← [MODIFY] Add getDealBySlug(), map new columns
│   │   │   └── alerts.repo.ts     ← [MODIFY] Add unsubscribe link to email template
│   │   ├── email/
│   │   │   └── send.ts            ← [MODIFY] Add List-Unsubscribe headers
│   │   ├── providers/
│   │   │   ├── strackr.ts         ← [NEW] Live Strackr PriceProvider
│   │   │   ├── registry.ts        ← [MODIFY] Register Strackr; apply Hybrid Deduplication
│   │   │   └── types.ts           ← [MODIFY] Extend NormalizedDeal interface
│   │   └── utils/
│   │       ├── affiliate.ts       ← [MODIFY] Build unified subID parameters
│   │       ├── slug.ts            ← [NEW] URL-safe slug generator
│   │       └── crypto.ts          ← [NEW] HMAC SHA-256 token helper
│   ├── middleware.ts              ← [MODIFY] Add geo-header parsing, set dr_location cookie
│   └── public/
│       └── robots.txt             ← [NEW] AI crawler rules, API exclusions, sitemap link
├── .env.example                   ← [MODIFY] Add STRACKR_API_KEY, WEBHOOK_SECRET
└── next.config.mjs                ← [MODIFY] Add Strackr CDN to remotePatterns
```

### Architecture Decision: Edge Geo vs. Client Geo

The existing codebase has a complete client-side geo-resolution chain in `src/lib/geo/resolve.ts`:
1. `readStoredLocation()` — localStorage/cookie
2. `resolveViaBrowser()` — Browser Geolocation API
3. `resolveViaIp()` — Server `/api/geo` fallback
4. `defaultLocation()` — hardcoded `DE`

The middleware (`src/middleware.ts`) currently delegates to `next-intl` only; the comment at line 3 says *"nothing geo-related is needed here."*

**Design Decision:** The edge-middleware approach is **primary** in production (prevents CLS, ensures bots see localized content). The client-side `resolve.ts` chain becomes a **fallback** for:
- Local development (no edge headers available)
- Non-Netlify/Vercel hosting environments
- Cases where the user opts to refine their city after the initial country detection

The middleware modification wraps `intlMiddleware`, parses `X-NF-Country` (Netlify) or `x-vercel-ip-country` (Vercel), and sets the `dr_location` response cookie. No removal of `resolve.ts` is needed.

---

## 2. Data Schemas

### 2.1 Database Schema Migration (`supabase/schema.sql`)

All SQL below is incremental — appended to the existing schema file.

```sql
-- ═══════════════════════════════════════════════════════════════════
-- DealRadar v3 Migration — Incremental changes to existing schema
-- ═══════════════════════════════════════════════════════════════════

-- 1. New columns on existing deals table
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS affiliate_network varchar(50),
  ADD COLUMN IF NOT EXISTS merchant_name varchar(100),
  ADD COLUMN IF NOT EXISTS native_product_id varchar(100),
  ADD COLUMN IF NOT EXISTS ean_code varchar(20),
  ADD COLUMN IF NOT EXISTS tracking_url text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS historical_low_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS slug text;

-- 2. Generate slugs for any existing records
UPDATE public.deals
SET slug = lower(regexp_replace(product_name, '[^a-zA-Z0-9\s-]', '', 'g'))
           || '-' || replace(product_id, ':', '-')
WHERE slug IS NULL;

-- 3. Enforce slug constraints
ALTER TABLE public.deals
  ALTER COLUMN slug SET NOT NULL,
  ADD CONSTRAINT unique_deal_slug UNIQUE (slug);

-- 4. Price history time-series table
CREATE TABLE IF NOT EXISTS public.price_history (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id   text NOT NULL REFERENCES public.deals(product_id) ON DELETE CASCADE,
  sale_price   numeric(12,2) NOT NULL CHECK (sale_price >= 0),
  recorded_at  timestamptz NOT NULL DEFAULT now()
);
-- ⚠️ DESIGN NOTE: ON DELETE CASCADE means hard-deleting a deal (e.g., via
-- the optional 24h stale purge cron) permanently removes all associated
-- price history. For MVP this is acceptable. For production scale, consider:
-- (a) a soft-delete `is_active boolean` flag on deals, or
-- (b) changing the FK to ON DELETE SET NULL with a nullable product_id.

-- 5. Anonymous transactions table for postback webhooks (NO PII)
CREATE TABLE IF NOT EXISTS public.transactions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id     text NOT NULL UNIQUE,
  product_id         text REFERENCES public.deals(product_id) ON DELETE SET NULL,
  subid3             text,
  commission_earned  numeric(12,2) NOT NULL CHECK (commission_earned >= 0),
  status             text NOT NULL CHECK (status IN ('pending', 'approved', 'declined')),
  raw_payload        jsonb,
  received_at        timestamptz NOT NULL DEFAULT now()
);

-- 6. Enable RLS on new tables
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- 7. Performance indexes
CREATE INDEX IF NOT EXISTS deals_slug_idx
  ON public.deals (slug);
CREATE INDEX IF NOT EXISTS deals_ean_idx
  ON public.deals (ean_code) WHERE ean_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS price_history_product_idx
  ON public.price_history (product_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS transactions_product_idx
  ON public.transactions (product_id);

-- 8. Trigger function: record price snapshot on change
CREATE OR REPLACE FUNCTION public.record_price_history()
RETURNS TRIGGER AS $$
DECLARE
  last_price numeric(12,2);
  last_date date;
BEGIN
  SELECT sale_price, recorded_at::date INTO last_price, last_date
  FROM public.price_history
  WHERE product_id = NEW.product_id
  ORDER BY recorded_at DESC
  LIMIT 1;

  -- Insert only if price changed or no snapshot exists for today
  IF last_price IS NULL OR last_price <> NEW.sale_price OR last_date <> CURRENT_DATE THEN
    INSERT INTO public.price_history (product_id, sale_price, recorded_at)
    VALUES (NEW.product_id, NEW.sale_price, timezone('utc', now()));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. Bind trigger to deals table
CREATE TRIGGER trigger_record_price_history
AFTER INSERT OR UPDATE OF sale_price ON public.deals
FOR EACH ROW
EXECUTE FUNCTION public.record_price_history();
```

### 2.2 TypeScript Data Model Extension (`src/lib/providers/types.ts`)

Add these optional fields to the existing `NormalizedDeal` interface:

```typescript
// Added to existing NormalizedDeal interface
affiliateNetwork?: string;
merchantName?: string;
nativeProductId?: string;
eanCode?: string | null;
trackingUrl?: string;
description?: string | null;
historicalLowPrice?: number | null;
slug?: string;
```

**Important:** These fields are **optional** (`?`) to maintain backward compatibility with existing providers that do not populate them.

---

## 3. API & Webhook Contracts

### 3.1 Live Strackr Deals Fetch (PROVISIONAL)

> ⚠️ **PROVISIONAL:** The endpoint URL and response payload below are **unverified** against Strackr's actual publisher documentation. Phase 0 Task 0.1 MUST validate these before implementation begins.

* **Endpoint:** `https://api.strackr.com/v3/offers` (TBD)
* **Headers:** `Authorization: Bearer $STRACKR_API_KEY`
* **Response Payload (illustration — to be verified):**

```json
{
  "results": [
    {
      "id": "129849",
      "name": "Samsung Galaxy S24 Ultra",
      "description": "256GB Titan Black",
      "image": "https://images.affiliatecdn.com/samsung-s24.jpg",
      "url": "https://track.awin.com/click?merchant=123",
      "merchant": { "name": "Samsung DE" },
      "network": "awin",
      "prices": {
        "price": 1049.00,
        "old_price": 1449.00,
        "discount_percent": 27.6
      },
      "extra": {
        "ean": "8806095304725"
      }
    }
  ]
}
```

### 3.2 Webhook Postback Endpoint

* **Endpoint:** `POST /api/postbacks?secret=WEBHOOK_SECRET`
* **Validation:** Server verifies `secret` query parameter matches `WEBHOOK_SECRET` env var.
* **Payload:**

```json
{
  "transaction_id": "tx_abc123",
  "commission_earned": 52.45,
  "status": "pending",
  "subid3": "dealradar_DE_electronics_kelkoo:12345"
}
```

* **Processing:** Split `subid3` by `_` to extract country, category, and productId. Query `deals` for matching `product_id`. Insert into `transactions` table.

### 3.3 Outgoing Affiliate Link Structure

Update `decorateAffiliateUrl()` in `src/lib/utils/affiliate.ts`:

* **Unified SubID Format:** `dealradar_${country}_${category}_${productId}`
* **Network Parameter Mapping:**

| Network | Parameter Name | Example Value |
|---|---|---|
| Kelkoo | `custom1` | `dealradar_DE_electronics_kelkoo:12345` |
| Awin | `clickref` | `dealradar_DE_electronics_awin:67890` |
| Tradedoubler | `epi` | `dealradar_DE_fashion_tradedoubler:11111` |

**Rationale:** Single-parameter format prevents data loss on networks that only support one custom tracking field.

### 3.4 Secure Unsubscribe Endpoint

* **Endpoint:** `GET /api/alerts/unsubscribe?email=...&productId=...&token=...`
* **Token Generation (in email template):**

```typescript
import { createHmac } from 'crypto';

const token = createHmac('sha256', process.env.CRON_SECRET!)
  .update(`${email}:${productId}`)
  .digest('hex');
```

* **Verification:** If `token === expectedToken`, delete the row from `price_alerts` and render a localized confirmation page.
* **Idempotency:** If the row is already deleted, render success (not an error).

### 3.5 Email Template Contract

The `priceDropEmail()` function in `alerts.repo.ts` MUST generate HTML containing:

1. Product name, current price, previous target price, shop name.
2. CTA button linking to the deal.
3. **Visible unsubscribe link** in the footer: `<a href="/api/alerts/unsubscribe?email=...&productId=...&token=...">Unsubscribe</a>`
4. Footer text: *"You're receiving this because you set a price alert on DealRadar."*

The `sendEmail()` function in `send.ts` MUST include additional headers:

```typescript
headers: {
  'List-Unsubscribe': `<${unsubscribeUrl}>`,
  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
}
```

### 3.6 Rate Limiting Contract

The `/api/alerts` POST handler MUST:

1. Extract client IP from request headers.
2. Use Upstash Redis to track: key = `ratelimit:alerts:${ip}`, value = request count.
3. If count ≥ 5 within 1 hour → return `429 Too Many Requests`.
4. Otherwise → increment counter with `EX 3600` TTL and proceed.

---

## 4. Component & Page Designs

### 4.1 SSR Deal Detail Page (`/[locale]/deal/[slug]/page.tsx`)

```typescript
// Pseudocode — implementation guide for executor
export async function generateMetadata({ params }): Promise<Metadata> {
  const deal = await getDealBySlug(params.slug);
  if (!deal) return {};
  return {
    title: `${deal.productName} - Best Deal in ${deal.country} | DealRadar`,
    description: `Save ${deal.discountPercent}% on ${deal.productName}. Verified price drop.`,
    alternates: {
      canonical: `https://dealradar.app/${params.locale}/deal/${params.slug}`,
      // Map all locales
    }
  };
}

export default async function DealPage({ params }) {
  const deal = await getDealBySlug(params.slug);
  if (!deal) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": deal.productName,
    "image": deal.imageUrl,
    "description": `Verified price drop on ${deal.productName} from ${deal.shopName}.`,
    "offers": {
      "@type": "AggregateOffer",
      "priceCurrency": deal.currency,
      "lowPrice": deal.salePrice.toFixed(2),
      "highPrice": deal.originalPrice.toFixed(2),
      "offerCount": "1",
      "availability": "https://schema.org/InStock",
      "offers": [{
        "@type": "Offer",
        "price": deal.salePrice.toFixed(2),
        "priceCurrency": deal.currency,
        "availability": "https://schema.org/InStock",
        "itemCondition": "https://schema.org/NewCondition",
        "url": `https://dealradar.app/${params.locale}/deal/${params.slug}`,
        "seller": { "@type": "Organization", "name": deal.shopName },
        "priceSpecification": {
          "@type": "PriceSpecification",
          "price": deal.salePrice.toFixed(2),
          "priceCurrency": deal.currency,
          "valueAddedTaxIncluded": "true"
        }
      }]
    }
  };

  return (
    <main>
      <script type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {/* Deal UI: title, image, prices, proof fields, CTA with affiliate badge */}
    </main>
  );
}
```

### 4.2 Hybrid Deduplication Logic (`registry.ts`)

```typescript
// Pseudocode for the deduplication pass in fetchDealsAcrossProviders()

function deduplicateDeals(deals: NormalizedDeal[]): NormalizedDeal[] {
  const groups = new Map<string, NormalizedDeal>();

  for (const deal of deals) {
    // Priority 1: EAN code. Priority 2: slugified name + merchant
    const key = deal.eanCode
      ? `ean:${deal.eanCode}`
      : `name:${slugify(deal.productName)}_${slugify(deal.shopName)}`;

    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, deal);
      continue;
    }

    // Keep lowest price. If equal, keep higher-priority provider (lower number).
    if (deal.salePrice < existing.salePrice) {
      groups.set(key, deal);
    } else if (deal.salePrice === existing.salePrice) {
      const dealPriority = getProviderPriority(deal.source);
      const existPriority = getProviderPriority(existing.source);
      if (dealPriority < existPriority) groups.set(key, deal);
    }
  }

  return Array.from(groups.values());
}
```

### 4.3 Legal Pages Content Structure

#### Imprint Page (`/[locale]/imprint/page.tsx`)
| Section | Content |
|---|---|
| Site Operator | Daniel Manzela / DealRadar |
| Registered Address | Street, City, Postcode, Country |
| Contact | Email, Support Telephone |
| Registry Court | If applicable |
| VAT ID | USt-IdNr (if applicable) |
| EU ODR Link | Link to Online Dispute Resolution platform (EU Reg 524/2013) |

#### Privacy Policy Page (`/[locale]/privacy/page.tsx`)
| Section | Content |
|---|---|
| §1 Controller | Matches Imprint data |
| §2 Data Categories | Emails (alerts), transient IP geolocation, cookie preferences |
| §3 Third-Party Processors | Supabase, Upstash Redis, Resend, Strackr, Awin, Tradedoubler, Kelkoo |
| §4 Cookies | Essential (always) vs Analytics (consent-based) |
| §5 Data Subject Rights | Access, rectification, erasure (Art 17), withdrawal of consent |
| §6 Automated Unsubscribe | Description of HMAC-based self-service deletion |

#### Terms of Service Page (`/[locale]/terms/page.tsx`)
| Section | Content |
|---|---|
| §1 Nature of Service | DealRadar is a price comparison/affiliate referral index, not a merchant |
| §2 Purchase Contracts | All contracts are between user and retail merchant |
| §3 Price Accuracy | Prices change dynamically; DealRadar not liable for discrepancies |
| §4 Affiliate Links | Outbound links are monetized; disclosure |

### 4.4 Cookie Consent Integration

**Library:** `vanilla-cookieconsent` by Orest Bida (FOSS, MIT license)
**Install:** `pnpm add vanilla-cookieconsent`

**Integration approach:**
1. Create `src/components/consent/CookieConsent.tsx` as a `'use client'` wrapper.
2. Initialize in `useEffect` to avoid SSR hydration mismatch.
3. Categories: `necessary` (always on), `analytics` (opt-in).
4. Footer link "Cookie Settings" calls `CookieConsent.showPreferences()`.
5. Supports Google Consent Mode v2 if analytics is added later.

### 4.5 robots.txt Specification

```
User-agent: *
Allow: /

# Prioritize AI search agents
User-agent: OAI-SearchBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

# Block all API endpoints from crawling
User-agent: *
Disallow: /api/

Sitemap: https://dealradar.app/sitemap.xml
```

---

## 5. Environment Variables

### New Variables Required

| Variable | Purpose | Where to Set |
|---|---|---|
| `STRACKR_API_KEY` | Strackr publisher API authentication | Netlify Dashboard + `.env.local` |
| `WEBHOOK_SECRET` | Postback endpoint signature validation | Netlify Dashboard + `.env.local` |

### Existing Variables (No Change)

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (server-only) |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis auth token |
| `KELKOO_API_TOKEN` | Kelkoo publisher API |
| `AWIN_API_KEY` / `AWIN_PUBLISHER_ID` | Awin publisher API |
| `TRADEDOUBLER_TOKEN` | Tradedoubler publisher API |
| `CRON_SECRET` | Refresh job + HMAC signing |
| `RESEND_API_KEY` | Transactional email |
| `ALERT_FROM_EMAIL` | Email sender address |

### Next.js Config Update

Add to `next.config.mjs` `remotePatterns`:

```javascript
{ protocol: 'https', hostname: '**.strackr.com' },
// Plus any Strackr-specific image CDN hostnames discovered in Phase 0
```
