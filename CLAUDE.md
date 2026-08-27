# DealRadar — working rules

## 1. Verify categories whenever a new source of products is added

**Any time a new advertiser, feed, provider or product API starts producing rows,
the category assignment MUST be verified before the work is called done.**

This is not a style preference. The same defect has shipped four times:

| Date | Merchant | What published |
|---|---|---|
| 2026-07-19 | Profichemie | Cleaning chemicals under **Elektronik** |
| 2026-08-20 | Zizzz.de | A child's pyjama under **Elektronik** |
| 2026-08-27 | Mediakos DE | CBD/collagen oils + Omega-3 capsules under **Elektronik** (64 rows), and 62 more supplements — Magnesium, MSM, NAC, Chlorella — under **Sport** |
| _(and one earlier)_ | — | same shape |

The cause is always the same: `mapCategory()` in `scripts/ingest-awin.cjs` falls
back to `'electronics'` when a merchant's `category_name` matches no rule, and
the feed taxonomy rules are **English** while many German catalogues are not.

Two things the Mediakos case adds to the pattern:

- **The wrong bucket isn't always `electronics`.** Half that catalogue landed in
  `sports` via a stray keyword match, which the fallback tracker cannot see — it
  only counts rows that took the *default*. A merchant can be badly miscategorised
  while the guard reports a clean run, so reading the per-merchant category split
  (the SQL below) is still required; the automated half is not a substitute.
- **The tracker's threshold is a floor, not a verdict.** Mediakos reported 37%
  defaulted — under the ≥50% fail line, so the run passed and printed it as a
  warning. It was still 126 wrong rows on the live site. Read the warnings.

The first three were each found by a person noticing a wrong page. This one was
found by running the verification above after an ingest — which is the point of
the rule.

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
