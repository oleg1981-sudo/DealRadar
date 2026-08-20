# DealRadar — working rules

## 1. Verify categories whenever a new source of products is added

**Any time a new advertiser, feed, provider or product API starts producing rows,
the category assignment MUST be verified before the work is called done.**

This is not a style preference. The same defect has shipped three times:

| Date | Merchant | What published |
|---|---|---|
| 2026-07-19 | Profichemie | Cleaning chemicals under **Elektronik** |
| 2026-08-20 | Zizzz.de | A child's pyjama under **Elektronik** |
| _(and one earlier)_ | — | same shape |

Every occurrence was found by a person noticing a wrong page — never by the
pipeline, and never by me. The cause is always the same: `mapCategory()` in
`scripts/ingest-awin.cjs` falls back to `'electronics'` when a merchant's
`category_name` matches no rule, and the feed taxonomy rules are **English**
while many German catalogues are not.

### How to verify

After ingesting from any new source, run this and read every row:

```sql
select shop_name, category, count(*) as rows
from public.deals
where hidden = false
group by shop_name, category
order by shop_name, rows desc;
```

A merchant whose whole catalogue sits in one category it has no business being
in is the signal. Cross-check by reading actual product names:

```sql
select product_name, category from public.deals
where shop_name = '<new merchant>' limit 20;
```

Then fix at the right level:

- **Whole-merchant vertical** (a pharmacy is 100% health) → `ADVERTISER_CATEGORY`
- **Mixed catalogue** (Zizzz sells both bedding and sleepwear) → `NAME_CATEGORY_OVERRIDES`
- Never rely on the `electronics` default being "close enough". It is not a
  category; it is the absence of one.

### The automated half

`reportUncategorised()` in the ingest now prints every fall-through grouped by
advertiser and **fails the run** when a merchant has ≥50% of its rows defaulted
(min 3 rows). Do not silence that error by widening a regex until it stops
firing — read the product names and add the correct rule.

## 2. Don't let "it renders" stand in for "it's correct"

Related failures in this repo came from the same habit: the homepage H2
interpolated an English country name into translated sentences, and the price
disclaimer on every card was untranslated English in 11 of 12 locales. Both
rendered perfectly. Check the **content**, in the target locale, not just that
the page returns 200.
