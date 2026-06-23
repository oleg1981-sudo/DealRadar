# Design Blueprint: DealRadar Live Integration, Compliance & GEO - Version 2

This document serves as the design specification for integrating the live Strackr API, implementing the GEO (Generative Engine Optimization) knowledge graph, updating the database schemas, adding geolocation edge middleware, and ensuring EU regulatory compliance.

---

## 1. Architecture & Component Structure

We will extend the existing provider and repository patterns to support the new features, keeping all modules clean, typed, and backwards-compatible.

### File Organization & Directory Layout

```
DealRadar/
├── supabase/
│   └── schema.sql                  <-- [MODIFY] Append new table migrations, triggers, and indices
├── src/
│   ├── app/
│   │   ├── sitemap.ts              <-- [NEW] Root dynamic multilingual sitemap generator (Next.js native)
│   │   ├── [locale]/
│   │   │   ├── deal/
│   │   │   │   └── [slug]/
│   │   │   │       └── page.tsx    <-- [NEW] SSR deal page with JSON-LD, alternates, and notFound() handling
│   │   │   ├── imprint/
│   │   │   │   └── page.tsx    <-- [NEW] Localized Impressum/Legal Notice page
│   │   │   ├── privacy/
│   │   │   │   └── page.tsx    <-- [NEW] Localized GDPR Privacy Policy page
│   │   │   ├── terms/
│   │   │   │   └── page.tsx    <-- [NEW] Localized Terms of Service page
│   │   └── api/
│   │       ├── postbacks/
│   │       │   └── route.ts        <-- [NEW] Secure serverless transaction postback handler
│   │       ├── alerts/
│   │       │   ├── route.ts        <-- [MODIFY] Add IP-based rate limiting via Upstash Redis
│   │       │   └── unsubscribe/
│   │       │       └── route.ts    <-- [NEW] Secure HMAC-verified data deletion endpoint
│   │       └── refresh/
│   │           └── route.ts        <-- [MODIFY] Wire daily cached 90-day lowest price recalculation
│   ├── components/
│   │   ├── deals/
│   │   │   └── DealCard.tsx        <-- [MODIFY] Point to the new SSR deal page instead of opening a modal
│   │   └── layout/
│   │       └── Footer.tsx          <-- [MODIFY] Append localized links to /imprint, /privacy, /terms
│   ├── lib/
│   │   ├── db/
│   │   │   └── deals.repo.ts       <-- [MODIFY] Add getDealBySlug(), update queryDeals() to return history
│   │   ├── providers/
│   │   │   ├── strackr.ts          <-- [NEW] Live Strackr PriceProvider integration
│   │   │   ├── registry.ts         <-- [MODIFY] Register Strackr; apply Hybrid Deduplication
│   │   │   └── types.ts            <-- [MODIFY] Update NormalizedDeal types to include new tracking fields
│   │   └── utils/
│   │       ├── affiliate.ts        <-- [MODIFY] Refactor decorateAffiliateUrl to construct unified subIDs
│   │       ├── slug.ts             <-- [NEW] Clean, URL-safe slug generator helper
│   │       └── crypto.ts           <-- [NEW] HMAC SHA-256 token verification helper
│   ├── middleware.ts               <-- [MODIFY] Wrap intlMiddleware to parse geo-headers and set response cookie
│   └── public/
│       └── robots.txt              <-- [NEW] AI crawler allowances, API exclusion rules, and root sitemap link
```

---

## 2. Data Schemas

### Database Schema Migration (`supabase/schema.sql`)

We will run incremental SQL migrations to modify the database.

```sql
-- Database Migration (v2 incremental updates)

-- 1. Modify deals table columns
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
SET slug = lower(regexp_replace(product_name, '[^a-zA-Z0-9\s-]', '', 'g')) || '-' || replace(product_id, ':', '-')
WHERE slug IS NULL;

-- 3. Enforce constraints
ALTER TABLE public.deals 
  ALTER COLUMN slug SET NOT NULL,
  ADD CONSTRAINT unique_deal_slug UNIQUE (slug);

-- 4. Create price_history table
CREATE TABLE IF NOT EXISTS public.price_history (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id   text NOT NULL REFERENCES public.deals(product_id) ON DELETE CASCADE,
  sale_price   numeric(12,2) NOT NULL check (sale_price >= 0),
  recorded_at  timestamptz NOT NULL DEFAULT now()
);

-- 5. Create transactions table for postbacks
CREATE TABLE IF NOT EXISTS public.transactions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id     text NOT NULL UNIQUE,
  product_id         text REFERENCES public.deals(product_id) ON DELETE SET NULL,
  subid3             text,
  commission_earned  numeric(12,2) NOT NULL check (commission_earned >= 0),
  status             text NOT NULL CHECK (status IN ('pending', 'approved', 'declined')),
  raw_payload        jsonb,
  received_at        timestamptz NOT NULL DEFAULT now()
);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- 7. Add database indexes for fast query paths
CREATE INDEX IF NOT EXISTS deals_slug_idx ON public.deals (slug);
CREATE INDEX IF NOT EXISTS deals_ean_idx ON public.deals (ean_code) WHERE ean_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS price_history_product_idx ON public.price_history (product_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS transactions_product_idx ON public.transactions (product_id);

-- 8. Create trigger function to record price history automatically
CREATE OR REPLACE FUNCTION public.record_price_history()
RETURNS TRIGGER AS $$
DECLARE
  last_price numeric(12,2);
  last_date date;
BEGIN
  -- Retrieve the most recent recorded price for this product
  SELECT sale_price, recorded_at::date INTO last_price, last_date
  FROM public.price_history
  WHERE product_id = NEW.product_id
  ORDER BY recorded_at DESC
  LIMIT 1;

  -- Insert only if price has changed or it's a new calendar day
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

### TypeScript Data Model (`src/lib/providers/types.ts`)

```typescript
export interface NormalizedDeal {
  // Existing fields
  productId: string;
  productName: string;
  shopName: string;
  shopUrl: string;
  shopLogoUrl: string | null;
  originalPrice: number;
  salePrice: number;
  discountPercent: number;
  currency: string;
  category: CategorySlug;
  brand: string | null;
  imageUrl: string | null;
  country: CountryCode;
  city: string | null;
  isSponsored: boolean;
  source: string;
  lastUpdated: string;

  // New tracking and GEO fields
  affiliateNetwork?: string;
  merchantName?: string;
  nativeProductId?: string;
  eanCode?: string | null;
  trackingUrl?: string;
  description?: string | null;
  historicalLowPrice?: number | null;
  slug?: string;
}
```

---

## 3. API & Webhook Contracts

### Live Strackr Deals Fetch (Provisional)
* **Endpoint:** `https://api.strackr.com/v3/offers` (to be verified in Phase 0)
* **Headers:** `Authorization: Bearer $STRACKR_API_KEY`
* **Response Payload (illustration):**
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

### Webhook Postback Endpoint
* **Endpoint:** `POST /api/postbacks?secret=WEBHOOK_SECRET`
* **Validation:** Server verifies `secret` matches environment variable `WEBHOOK_SECRET` to prevent fake pings.
* **Payload Shape:**
```json
{
  "transaction_id": "tx_abc123",
  "commission_earned": 52.45,
  "status": "pending",
  "subid3": "dealradar_DE_electronics_kelkoo:12345"
}
```
* **Processing:** Split `subid3` by `_` to extract `productId` (the fourth token). Query `deals` for matching `product_id` and insert conversion record to `transactions` table.

### Outgoing Affiliate Link Structure
Refactor `decorateAffiliateUrl` to programmatically build and append a single merged parameter value to prevent loss of telemetry on networks supporting only a single custom field:
* **Format:** `dealradar_${country}_${category}_${productId}`
* **Parameters Mapping:**
  * Kelkoo: `custom1` = `dealradar_DE_electronics_kelkoo:12345`
  * Awin: `clickref` = `dealradar_DE_electronics_awin:12345`
  * Tradedoubler: `epi` = `dealradar_DE_electronics_tradedoubler:12345`

### Secure Unsubscribe Endpoint
* **Endpoint:** `GET /api/alerts/unsubscribe?email=...&productId=...&token=...`
* **Verification:**
  ```typescript
  const expectedToken = crypto
    .createHmac('sha256', process.env.CRON_SECRET!)
    .update(`${email}:${productId}`)
    .digest('hex');
  ```
  If `token === expectedToken`, delete user's row from `price_alerts` table and render a localized confirmation.

---

## 4. Conflict Mitigation & Legal Layouts

### Hybrid Deduplication Strategy
* **Decision:** In memory, programmatically group incoming deals by `ean_code`, falling back to `slugify(name)_slugify(merchant)` if EAN is missing.
  - If a duplicate exists: compare `sale_price` and keep the one with the lowest sale price.
  - If prices are identical: keep the one from the provider with the lower `priority` value in the registry configuration.

### Sitemap Path Architecture
* **Decision:** Expose dynamic sitemap at the root level using Next.js `sitemap.ts` (`src/app/sitemap.ts`), which queries all active deals from Supabase, iterates through locales, and outputs alternates with correct `hreflang` attributes. Add `Sitemap: https://dealradar.app/sitemap.xml` to `robots.txt`.

### Legal Pages Copy Layouts

#### Imprint Page (`/imprint`)
Mandatory impressum layout. In German (`de`), it displays localized corporate notices. In English (`en`), it translates details for international compliance:
* **Content Structure:**
  - Site Operator Name (e.g., Daniel Manzela / DealRadar Ltd)
  - Registered Address (Street, City, Postcode, Country)
  - Contact Details (Email address, Support Telephone)
  - Registry Court and Registration Number (if applicable)
  - VAT Identification Number (USt-IdNr)
  - Link to Online Dispute Resolution platform (EU Regulation 524/2013)

#### Privacy Policy Page (`/privacy`)
GDPR compliant terms:
* **Sections:**
  - Section 1: Controller information (matches Imprint).
  - Section 2: Data processing categories (emails for alerts, transient IP geolocation, cookie preferences).
  - Section 3: Data processing by third-party processors (Supabase database, Upstash Redis, Resend email provider, Strackr aggregator API, Awin/Tradedoubler networks).
  - Section 4: Cookie consent details (Essential cookies vs optional analytics preferences).
  - Section 5: Rights of the Data Subject (Access, rectification, erasure under Article 17, withdrawal of consent).

#### Terms of Service Page (`/terms`)
* **Sections:**
  - DealRadar is a price comparison and affiliate referral search index; it is not a direct merchant.
  - All product contracts, shipping, warranties, and orders occur solely on the retail merchant's platform.
  - Prices change dynamically; DealRadar is not liable for price discrepancies between the search index and the merchant's checkout pages.
